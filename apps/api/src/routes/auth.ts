import {
  type LoginInput,
  loginSchema,
  type RequestPasswordResetInput,
  requestPasswordResetSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
  type SignupInput,
  signupSchema,
  type VerifyEmailInput,
  verifyEmailSchema,
} from '@invoice-saas/shared';
import { Router, type Request, type Response } from 'express';

import { prisma } from '../db/client.js';
import { ApiError } from '../lib/api-error.js';
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from '../lib/auth-cookie.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  credentialsLimiter,
  emailDispatchLimiter,
  refreshLimiter,
} from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import {
  type ClientContext,
  type IssuedSession,
  login,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  rotateRefreshToken,
  revokeRefreshToken,
  signup,
  toAuthUser,
  verifyEmail,
} from '../services/auth-service.js';

/**
 * Auth endpoints (backlog Epic 1.1). Mounted at `/auth` in `index.ts`, ahead of
 * `notFoundHandler`. Every handler is thin: validate → call `auth-service` → set
 * the refresh cookie and return `{ user, accessToken, expiresIn }`. The refresh
 * token itself is only ever a `Set-Cookie`, never a response body.
 *
 * Handlers are typed `Request<never, ..., TBody>` where `TBody` is the shared Zod
 * input type; `validate({ body })` has already replaced `req.body` with the parsed
 * value by the time they run.
 */
export const authRouter: Router = Router();

function clientContext(req: Request): ClientContext {
  return { userAgent: req.get('user-agent') ?? undefined, ip: req.ip };
}

function readRefreshCookie(req: Request): string | null {
  const jar = req.cookies as Record<string, unknown> | undefined;
  const raw = jar?.[REFRESH_COOKIE_NAME];
  return typeof raw === 'string' && raw !== '' ? raw : null;
}

/** Set the rotating refresh cookie and reply with the JSON session body. */
function sendSession(res: Response, issued: IssuedSession, status = 200): void {
  setRefreshCookie(res, issued.refreshToken, issued.refreshExpiresAt);
  res.status(status).json(issued.session);
}

authRouter.post(
  '/signup',
  credentialsLimiter,
  validate({ body: signupSchema }),
  async (req: Request<never, unknown, SignupInput>, res) => {
    const issued = await signup(req.body, clientContext(req));
    sendSession(res, issued, 201);
  },
);

authRouter.post(
  '/login',
  credentialsLimiter,
  validate({ body: loginSchema }),
  async (req: Request<never, unknown, LoginInput>, res) => {
    const issued = await login(req.body, clientContext(req));
    sendSession(res, issued);
  },
);

authRouter.post('/refresh', refreshLimiter, async (req, res) => {
  const raw = readRefreshCookie(req);
  if (raw === null) {
    throw ApiError.unauthorized('Your session has expired. Please sign in again.');
  }
  const issued = await rotateRefreshToken(raw, clientContext(req));
  sendSession(res, issued);
});

authRouter.post('/logout', async (req, res) => {
  const raw = readRefreshCookie(req);
  if (raw !== null) {
    await revokeRefreshToken(raw);
  }
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) throw ApiError.unauthorized();
  res.json(toAuthUser(user));
});

authRouter.post(
  '/verify-email',
  validate({ body: verifyEmailSchema }),
  async (req: Request<never, unknown, VerifyEmailInput>, res) => {
    const user = await verifyEmail(req.body.token);
    res.json(user);
  },
);

authRouter.post('/verify-email/resend', authenticate, emailDispatchLimiter, async (req, res) => {
  await resendVerificationEmail(req.auth!.userId);
  res.status(202).end();
});

authRouter.post(
  '/password/request-reset',
  emailDispatchLimiter,
  validate({ body: requestPasswordResetSchema }),
  async (req: Request<never, unknown, RequestPasswordResetInput>, res) => {
    await requestPasswordReset(req.body.email);
    // Always 202, matched or not — no user enumeration (backlog X.4.6).
    res.status(202).end();
  },
);

authRouter.post(
  '/password/reset',
  credentialsLimiter,
  validate({ body: resetPasswordSchema }),
  async (req: Request<never, unknown, ResetPasswordInput>, res) => {
    await resetPassword(req.body.token, req.body.password);
    res.status(204).end();
  },
);
