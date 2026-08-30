import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

/**
 * Access-token signing/verification (backlog 1.1.1). The access token is a short-
 * lived JWT the client sends as `Authorization: Bearer <token>`; `authenticate`
 * middleware is the only consumer. Long-lived sessions come from the opaque refresh
 * token (`lib/tokens.ts` + `refresh_tokens` table), never from a long JWT TTL.
 */

const ISSUER = 'invoice-saas';
const AUDIENCE = 'invoice-saas-web';

export interface AccessTokenClaims {
  /** `sub` — the user id. */
  userId: string;
}

export function signAccessToken(userId: string): { token: string; expiresIn: number } {
  const expiresIn = env.JWT_ACCESS_TTL_SECONDS;
  const token = jwt.sign({}, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
  });
  return { token, expiresIn };
}

/** Returns the claims, or `null` for any invalid/expired/malformed token — callers
 * turn `null` into a 401, they never see the underlying jsonwebtoken error. */
export function verifyAccessToken(token: string): AccessTokenClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
