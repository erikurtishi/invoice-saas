import type {
  AuthSession,
  AuthUser,
  LoginInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  SignupInput,
  VerifyEmailInput,
} from '@invoice-saas/shared';

import { clearAccessToken, setAccessToken } from '../../lib/access-token';
import { apiFetch } from '../../lib/api-client';
import { HttpError } from '../../lib/http-error';
import { clearSessionHint, hasSessionHint, markSessionHint } from '../../lib/session-hint';

/**
 * Thin wrappers over the `/auth/*` endpoints (backlog Epic 1.1). Each keeps the
 * in-memory access token in sync as a side effect so callers never touch it.
 * `retryOnUnauthorized: false` on the credential calls stops a bad login from
 * bouncing through the refresh-and-retry path.
 */

export async function signup(input: SignupInput): Promise<AuthSession> {
  const session = await apiFetch<AuthSession>('/auth/signup', {
    method: 'POST',
    body: input,
    retryOnUnauthorized: false,
  });
  setAccessToken(session.accessToken);
  markSessionHint();
  return session;
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const session = await apiFetch<AuthSession>('/auth/login', {
    method: 'POST',
    body: input,
    retryOnUnauthorized: false,
  });
  setAccessToken(session.accessToken);
  markSessionHint();
  return session;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<void>('/auth/logout', { method: 'POST', retryOnUnauthorized: false });
  } finally {
    clearAccessToken();
    clearSessionHint();
  }
}

/** The session-bootstrap read. A cold load has no access token → this 401s → the
 * client silently refreshes from the cookie → replays. A genuine "not logged in"
 * surfaces as an `HttpError` with status 401.
 *
 * When this browser has never authenticated (no session hint), there is no cookie
 * worth probing — reject with a synthetic 401 so `<RequireAuth>` redirects,
 * skipping the console-noisy `/auth/me` + `/auth/refresh` round-trip. */
export async function fetchCurrentUser(): Promise<AuthUser> {
  if (!hasSessionHint()) {
    throw new HttpError(401, 'Not authenticated');
  }
  const user = await apiFetch<AuthUser>('/auth/me', { notifyOnSessionExpiry: false });
  markSessionHint();
  return user;
}

export function verifyEmail(input: VerifyEmailInput): Promise<AuthUser> {
  return apiFetch<AuthUser>('/auth/verify-email', {
    method: 'POST',
    body: input,
    retryOnUnauthorized: false,
  });
}

export function resendVerificationEmail(): Promise<void> {
  return apiFetch<void>('/auth/verify-email/resend', { method: 'POST' });
}

export function requestPasswordReset(input: RequestPasswordResetInput): Promise<void> {
  return apiFetch<void>('/auth/password/request-reset', {
    method: 'POST',
    body: input,
    retryOnUnauthorized: false,
  });
}

export function resetPassword(input: ResetPasswordInput): Promise<void> {
  return apiFetch<void>('/auth/password/reset', {
    method: 'POST',
    body: input,
    retryOnUnauthorized: false,
  });
}
