import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

interface ValidateSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Parses `req.body` / `req.params` / `req.query` against the given Zod schemas —
 * the shared schemas from `@invoice-saas/shared` (backlog 0.2.5) — replacing each
 * with its parsed (and thus typed, defaulted, coerced) value. A failure calls
 * `next(zodError)`, which `middleware/error-handler.ts` turns into a
 * `VALIDATION_ERROR` response with one message per invalid field.
 *
 * This is the only place request input should be parsed. A route that reads
 * `req.body` directly is trusting unvalidated input.
 */
export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        Object.assign(req.params, schemas.params.parse(req.params));
      }
      if (schemas.query) {
        // Express 5 makes `req.query` a getter with no setter, so `Object.assign`
        // onto it is silently discarded — the parsed value (defaults, coercions)
        // has to be installed as an own property instead.
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
