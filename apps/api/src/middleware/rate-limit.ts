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

/**
 * Blanket ceiling on every API route (backlog X.4.6), mounted once in `index.ts`
 * ahead of the routers. Deliberately loose — a real session with the invoice
 * editor's autosave + live-preview calls is chatty — so it never bites normal
 * use, only a scripted flood. The per-endpoint limiters above (and
 * `expensiveLimiter` below) layer on top for the routes that need a tighter cap.
 * Skipped for `/health` (uptime probes poll freely) and `/billing/webhook`
 * (Stripe can burst during an event backfill, the signature is its auth, and a
 * dropped payment event is worse than an unbounded one).
 */
const UNLIMITED_PATHS = new Set(['/health', '/billing/webhook']);
export const apiLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 300,
  skip: (req) => UNLIMITED_PATHS.has(req.path),
});

/**
 * The expensive, side-effecting or bulk-data endpoints: AI drafting, PDF
 * generation, CSV / full-data export, account deletion. Each call costs real
 * money (AI, headless Chrome) or ships a whole tenant's data, so this is much
 * tighter than `apiLimiter`: 20 per 5 minutes per IP.
 */
export const expensiveLimiter = rateLimit({
  ...base,
  windowMs: 5 * 60 * 1000,
  limit: 20,
});
