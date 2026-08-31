import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { prisma } from '../db/client.js';
import { scopedPrisma, type ScopedPrismaClient } from '../db/tenant-scope.js';
import { ApiError } from '../lib/api-error.js';

declare module 'express-serve-static-core' {
  interface Request {
    /**
     * Populated by `middleware/authenticate.ts` from the access-token JWT
     * (backlog 1.1.1). Undefined on any route not behind `authenticate`.
     */
    auth?: { userId: string };
    /** Set by `requireTenant` below. Undefined on any route not behind it. */
    db?: ScopedPrismaClient;
  }
}

/**
 * Attaches a tenant-scoped Prisma client to `req.db` (backlog 0.2.4). Every
 * tenant-owned route must sit behind this middleware and must query only through
 * `req.db` — never the raw `prisma` export from `db/client.ts`, which has no scope
 * at all and would leak data across tenants if used directly in a route.
 *
 * Chain it after `authenticate`: `router.use(authenticate, requireTenant)`. The
 * first tenant-owned resource routes (Client, Product, …) arrive in Phase 2; until
 * then this has no caller but is kept so the scoping rule is enforced by
 * construction from the first route that needs it, not retrofitted later.
 *
 * It also re-reads `disabledAt` from the database on every call (backlog 8.3.4):
 * a disabled account's still-valid access token must stop working now, not when
 * the JWT expires — the same reason `requireAdmin` re-reads `role`.
 */
export const requireTenant: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!req.auth) {
    next(ApiError.unauthorized());
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    select: { disabledAt: true },
  });
  if (!user) {
    next(ApiError.unauthorized());
    return;
  }
  if (user.disabledAt !== null) {
    next(ApiError.forbidden('This account has been disabled. Contact support.'));
    return;
  }
  req.db = scopedPrisma(req.auth.userId);
  next();
};
