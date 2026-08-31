import { Prisma, type User } from '@prisma/client';
import type { AuthSession, AuthUser } from '@invoice-saas/shared';

import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { ApiError } from '../lib/api-error.js';
import { signAccessToken } from '../lib/jwt.js';
import { hashPassword, needsRehash, verifyPassword } from '../lib/password.js';
import { expiresInDays, expiresInMinutes, generateToken, hashToken } from '../lib/tokens.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../mail/index.js';

/**
 * All authentication state transitions (backlog Epic 1.1) in one module. Routes in
 * `routes/auth.ts` are thin — parse input, call one function here, shape the
 * response. Nothing here touches Express `req`/`res`.
 *
 * These operate on `User` and the token tables, none of which are tenant-scoped
 * (decision D3: the user *is* the tenant), so they use the raw `prisma` client
 * directly — `scopedPrisma` would have nothing to scope by anyway (there is no
 * authenticated tenant yet during signup/login).
 */

const VERIFICATION_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_MINUTES = 60;

/** A real scrypt hash (of a throwaway string), written with the current params so
 * verifying against it on a login miss burns the same CPU as a genuine password
 * check — a non-existent email must not return faster than a wrong password, or the
 * difference is a user-enumeration oracle. Regenerate if `password.ts` PARAMS change. */
const DUMMY_HASH =
  'scrypt$131072$8$1$OUaDj2PgHHL3IP6W87zfBA==$BDgbrZA+wMSuyOb36O8R2mWpLrvGOBnGAASqccfm0GxRG3pk0mmMPRodlVa5LcfrfpIjA2ZjRUYc1OWZ7kE3zg==';

export interface ClientContext {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export interface IssuedSession {
  session: AuthSession;
  /** Raw refresh token — belongs in an httpOnly cookie, never a JSON body. */
  refreshToken: string;
  refreshExpiresAt: Date;
  /** `refresh_tokens.id` of the row just written — used to link the previous token
   * to this one on rotation (reuse detection). Not sent to the client. */
  refreshTokenId: string;
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    businessName: user.businessName,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    preferredLanguage: user.preferredLanguage,
    tier: user.tier,
    onboardingCompleted: user.onboardingCompletedAt !== null,
  };
}

async function issueSession(user: User, ctx: ClientContext): Promise<IssuedSession> {
  const { token: accessToken, expiresIn } = signAccessToken(user.id);
  const refreshToken = generateToken();
  const refreshExpiresAt = expiresInDays(env.REFRESH_TTL_DAYS);

  const row = await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: refreshExpiresAt,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    },
  });

  return {
    session: { user: toAuthUser(user), accessToken, expiresIn },
    refreshToken,
    refreshExpiresAt,
    refreshTokenId: row.id,
  };
}

/** Replace every unconsumed one-time token of a purpose for a user, so only the
 * link we are about to send stays valid. */
async function invalidateOneTimeTokens(
  tx: Prisma.TransactionClient,
  userId: string,
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
): Promise<void> {
  await tx.oneTimeToken.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}

async function createOneTimeToken(
  userId: string,
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
  expiresAt: Date,
): Promise<string> {
  const token = generateToken();
  await prisma.$transaction(async (tx) => {
    await invalidateOneTimeTokens(tx, userId, purpose);
    await tx.oneTimeToken.create({
      data: { tokenHash: hashToken(token), purpose, userId, expiresAt },
    });
  });
  return token;
}

// --- Signup -----------------------------------------------------------------

export async function signup(
  input: { email: string; password: string; businessName: string },
  ctx: ClientContext,
): Promise<IssuedSession> {
  const passwordHash = await hashPassword(input.password);

  let user: User;
  try {
    user = await prisma.user.create({
      data: { email: input.email, passwordHash, businessName: input.businessName },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw ApiError.conflict('An account with this email already exists.');
    }
    throw error;
  }

  await sendVerification(user);
  return issueSession(user, ctx);
}

// --- Login ----------------------------------------------------------------

export async function login(
  input: { email: string; password: string },
  ctx: ClientContext,
): Promise<IssuedSession> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always run one verify, against the real hash or the dummy, so both branches
  // take the same time.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok) {
    throw ApiError.unauthorized('Email or password is incorrect.');
  }

  // A disabled account (backlog 8.3.4) authenticates but gets no session.
  if (user.disabledAt !== null) {
    throw ApiError.forbidden('This account has been disabled. Contact support.');
  }

  // Opportunistically upgrade a hash written with older parameters.
  if (needsRehash(user.passwordHash)) {
    const upgraded = await hashPassword(input.password);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: upgraded } });
  }

  return issueSession(user, ctx);
}

// --- Refresh-token rotation --------------------------------------------------

export async function rotateRefreshToken(
  rawToken: string,
  ctx: ClientContext,
): Promise<IssuedSession> {
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing) {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }

  // A token presented after it was already revoked/rotated means the cookie leaked
  // and is being replayed. Burn every session for that user and force a fresh login.
  if (existing.revokedAt !== null) {
    await revokeAllForUser(existing.userId);
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }

  // Disabled between refreshes (backlog 8.3.4) — end the session here too. Disable
  // also revokes outstanding refresh tokens, so this is the belt to that braces.
  if (existing.user.disabledAt !== null) {
    throw ApiError.forbidden('This account has been disabled. Contact support.');
  }

  const issued = await issueSession(existing.user, ctx);
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedById: issued.refreshTokenId },
  });
  return issued;
}

/** Best-effort revoke for logout — a missing or already-revoked token is not an
 * error (the user wants to be logged out either way). */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Force every session for a user to end — used by the admin "disable account"
 *  action (backlog 8.3.4) so a disable takes effect on the next refresh even
 *  before the current access token expires. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await revokeAllForUser(userId);
}

// --- Email verification ----------------------------------------------------

async function sendVerification(user: User): Promise<void> {
  const token = await createOneTimeToken(
    user.id,
    'EMAIL_VERIFICATION',
    expiresInMinutes(VERIFICATION_TTL_HOURS * 60),
  );
  await sendVerificationEmail({ to: user.email, businessName: user.businessName, token });
}

export async function resendVerificationEmail(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized();
  if (user.emailVerifiedAt !== null) return; // already done — nothing to send
  await sendVerification(user);
}

export async function verifyEmail(rawToken: string): Promise<AuthUser> {
  const token = await prisma.oneTimeToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });

  if (
    !token ||
    token.purpose !== 'EMAIL_VERIFICATION' ||
    token.consumedAt !== null ||
    token.expiresAt.getTime() <= Date.now()
  ) {
    throw ApiError.validation('This verification link is invalid or has expired.');
  }

  const [, updatedUser] = await prisma.$transaction([
    prisma.oneTimeToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: token.userId },
      data: token.user.emailVerifiedAt === null ? { emailVerifiedAt: new Date() } : {},
    }),
  ]);

  return toAuthUser(updatedUser);
}

// --- Password reset ------------------------------------------------------------

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  // No user-enumeration: the route responds identically whether or not this matched.
  if (!user) return;

  const token = await createOneTimeToken(
    user.id,
    'PASSWORD_RESET',
    expiresInMinutes(PASSWORD_RESET_TTL_MINUTES),
  );
  await sendPasswordResetEmail({ to: user.email, businessName: user.businessName, token });
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const token = await prisma.oneTimeToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });

  if (
    !token ||
    token.purpose !== 'PASSWORD_RESET' ||
    token.consumedAt !== null ||
    token.expiresAt.getTime() <= Date.now()
  ) {
    throw ApiError.validation('This reset link is invalid or has expired.');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.oneTimeToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
    prisma.oneTimeToken.updateMany({
      where: { userId: token.userId, purpose: 'PASSWORD_RESET', consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({ where: { id: token.userId }, data: { passwordHash } }),
    // Changing the password kills every existing session — this is the "someone got
    // in, lock them out" lever.
    prisma.refreshToken.updateMany({
      where: { userId: token.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
