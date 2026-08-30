import { z } from 'zod';

/**
 * Standard API error shape (backlog 0.2.5). Every non-2xx JSON response from the API
 * takes this shape — never a raw stack trace, never an ad-hoc `{ message }`. The web
 * app's HTTP layer (`apps/web/src/lib/http-error.ts`) parses responses against this
 * schema so error handling is uniform everywhere a request can fail.
 */
export const API_ERROR_CODES = [
  /** A request body/params/query failed Zod validation. `fields` is populated. */
  'VALIDATION_ERROR',
  /** No valid session/credentials. */
  'UNAUTHORIZED',
  /** Authenticated, but not allowed to do this. */
  'FORBIDDEN',
  /** The resource, or the route itself, doesn't exist. */
  'NOT_FOUND',
  /** The request conflicts with current state (e.g. duplicate email on signup). */
  'CONFLICT',
  /** Rate or usage limit hit (auth throttling, free-tier limit, AI monthly cap). */
  'RATE_LIMITED',
  /** Unexpected server-side failure. Message is generic in production. */
  'INTERNAL_ERROR',
] as const;

export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    /** Plain-language, safe to show a user as-is (backlog rule: never a raw error code). */
    message: z.string(),
    /** Present only for VALIDATION_ERROR: field path -> list of messages for that field. */
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
