import { rateLimit, type Options } from 'express-rate-limit';

import { ApiError } from '../lib/api-error.js';

/**
 * Brute-force protection for the auth endpoints (backlog 1.1.6). `express-rate-limit`
 * with its default in-memory store — fine for a single API process on a VPS
 * (decision D1); swap in a shared store (Redis) only if the API is ever scaled out.
 *
 * On trip it hands the central error handler an `ApiError.rateLimited()`, so the
 * body is the same `{ error: { code: 'RATE_LIMITED', ... } }` shape as every other
 * failure and the web client's existing handling just works.
 *
 * Limits are deliberately generous enough not to interfere with normal use (or a
 * dev server hot-reloading) while still stopping a credential-stuffing run.
 */
const base: Partial<Options> = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(ApiError.rateLimited('Too many attempts. Please wait a few minutes and try again.'));
  },
};

/** Credential endpoints (login, signup) — keyed by IP. 10 per 15 min. */
export const credentialsLimiter = rateLimit({ ...base, limit: 10 });

/** Token refresh — a legitimate client calls this often (once per access-token
 * lifetime, plus on tab focus). Much higher ceiling, still bounded. */
export const refreshLimiter = rateLimit({ ...base, limit: 120 });

/**
 * Endpoints that send an email on success (verification resend, password-reset
 * request). Tightest of the three — each hit can put mail in someone's inbox:
 * 5 per hour per IP.
 */
export const emailDispatchLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
});
