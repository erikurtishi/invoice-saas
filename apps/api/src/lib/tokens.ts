import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque bearer tokens for the refresh-token and one-time-token flows (backlog
 * 1.1.1–1.1.3). The raw token goes to the client (a cookie, or a link in an email);
 * only its SHA-256 hash is ever stored, so a dump of `refresh_tokens` /
 * `one_time_tokens` cannot be replayed.
 *
 * SHA-256 with no salt is deliberate and safe here — unlike a password, the input
 * is 256 bits of CSPRNG output, so there is nothing to brute-force and the hash has
 * to be deterministic to be looked up by.
 */

/** 32 random bytes, URL-safe — fine in a `Set-Cookie` value and in a query string. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64');
}

/** Constant-time compare of two already-computed hashes. */
export function tokenHashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function expiresInDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function expiresInMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
