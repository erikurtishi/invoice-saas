import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { isProduction } from '../config/env.js';
import { ApiError } from '../lib/api-error.js';
import { captureError } from '../lib/observability.js';

/** Mounted after every route. Anything that reaches here matched no route. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` },
  });
};

function zodErrorToFields(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '(root)';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

/** True for the SyntaxError body-parser throws on malformed JSON (`express.json()`). */
function isBodyParserSyntaxError(err: unknown): err is SyntaxError {
  return (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status?: unknown }).status === 400 &&
    'type' in err &&
    (err as { type?: unknown }).type === 'entity.parse.failed'
  );
}

/**
 * Central error handler (backlog 0.2.5) — the only place an error becomes an HTTP
 * response. Every route just `throw`s or `next(error)`s; nothing formats a response
 * by hand. Must be mounted last, after every route and after `notFoundHandler`.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed.',
        fields: zodErrorToFields(err),
      },
    });
    return;
  }

  if (isBodyParserSyntaxError(err)) {
    res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON.' },
    });
    return;
  }

  // Unhandled — backlog rule: never a raw error code or stack trace reaches the
  // client. Log the real error server-side, report it to Sentry if configured
  // (X.5.5 — only the genuine 5xx incidents get here, the 4xx `ApiError`s
  // returned above are normal traffic), and give production a generic message.
  console.error(err);
  captureError(err, { method: req.method, path: req.path, status: 500 });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message:
        !isProduction && err instanceof Error ? err.message : 'Something went wrong. Try again.',
    },
  });
};
