import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { prisma } from '../db/client.js';
import { ApiError } from '../lib/api-error.js';

/**
 * Gates the `/admin/*` namespace on `users.role === 'ADMIN'` (backlog 8.1.1 —
 * "all admin endpoints double-check the role"; pulled forward for Epic 6.3's
 * manual-grant API). Chain it after `authenticate`:
 * `router.use(authenticate, requireAdmin)`.
 *
 * The role is re-read from the database on every call rather than trusted from
 * the access-token claims — a revoked admin must lose access without waiting for
 * their JWT to expire.
 */
export const requireAdmin: RequestHandler = async (
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
    select: { role: true },
  });
  if (!user || user.role !== 'ADMIN') {
    next(ApiError.forbidden('Admin access is required for this action.'));
    return;
  }
  next();
};
