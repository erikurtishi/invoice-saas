import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { ApiError } from '../lib/api-error.js';
import { verifyAccessToken } from '../lib/jwt.js';

/**
 * Populates `req.auth` from the `Authorization: Bearer <accessToken>` header
 * (backlog 1.1.1). This is the gate that turns an anonymous request into an
 * identified one; `requireTenant` (`middleware/tenant.ts`) sits directly behind it
 * and turns `req.auth.userId` into the tenant-scoped `req.db`.
 *
 * A missing, malformed, or expired token is a 401 — the web client's HTTP layer
 * treats that as "try one refresh, then redirect to login" (backlog 1.1.5).
 */
export const authenticate: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(ApiError.unauthorized());
    return;
  }

  const claims = verifyAccessToken(header.slice('Bearer '.length).trim());
  if (!claims) {
    next(ApiError.unauthorized('Your session has expired. Please sign in again.'));
    return;
  }

  req.auth = { userId: claims.userId };
  next();
};
