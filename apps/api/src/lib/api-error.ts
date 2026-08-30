import type { ApiErrorCode } from '@invoice-saas/shared';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Throw or `next()` this from any route/middleware to produce the standard error
 * body (`@invoice-saas/shared`'s `apiErrorBodySchema`) with the right status code.
 * Caught centrally by `middleware/error-handler.ts` — never format an error response
 * by hand in a route.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { fields?: Record<string, string[]>; status?: number },
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = options?.status ?? STATUS_BY_CODE[code] ?? 500;
    if (options?.fields) {
      this.fields = options.fields;
    }
  }

  static validation(message: string, fields?: Record<string, string[]>): ApiError {
    return new ApiError('VALIDATION_ERROR', message, fields ? { fields } : undefined);
  }

  static unauthorized(message = 'Authentication required.'): ApiError {
    return new ApiError('UNAUTHORIZED', message);
  }

  static forbidden(message = "You don't have access to this."): ApiError {
    return new ApiError('FORBIDDEN', message);
  }

  static notFound(message = 'Not found.'): ApiError {
    return new ApiError('NOT_FOUND', message);
  }

  static conflict(message: string): ApiError {
    return new ApiError('CONFLICT', message);
  }

  static rateLimited(message = 'Too many requests. Try again later.'): ApiError {
    return new ApiError('RATE_LIMITED', message);
  }
}
