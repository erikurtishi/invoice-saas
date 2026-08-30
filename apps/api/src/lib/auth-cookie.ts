import type { Response } from 'express';

import { isProduction } from '../config/env.js';

/**
 * The refresh token travels in this cookie and nowhere else (backlog 1.1.1).
 * `httpOnly` keeps it out of reach of any script (so an XSS bug can't lift the
 * long-lived credential); `path=/auth` means it is only ever attached to the two
 * routes that need it (`/auth/refresh`, `/auth/logout`).
 */
export const REFRESH_COOKIE_NAME = 'refresh_token';

const COOKIE_PATH = '/auth';

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: COOKIE_PATH,
  });
}
