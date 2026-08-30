import { HttpError, isClientError } from './http-error';

/**
 * TODO(X.1.1): route this copy through react-i18next once it is set up (D9).
 * One object so the swap is a single edit.
 */
const COPY = {
  offline: "You're offline — check your connection and try again.",
  notFound: "We couldn't find what you were looking for. It may have been deleted.",
  forbidden: "You don't have permission to do that.",
  badRequest: 'Something about that request was invalid.',
  server: 'The server ran into a problem. This is usually temporary.',
  generic: 'Something went wrong.',
} as const;

/**
 * Turns any thrown value into a plain-language sentence safe to show a user —
 * never a status code, never a stack trace (backlog five-states "Error" rule).
 * `<ErrorState>` and the toast system both render through this so the wording of
 * a failure is identical wherever it surfaces.
 */
export function toUserMessage(error: unknown): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return COPY.offline;
  }
  if (error instanceof HttpError) {
    if (error.status === 404) return COPY.notFound;
    if (error.status === 403) return COPY.forbidden;
    if (error.status === 401) return COPY.forbidden;
    if (isClientError(error)) return COPY.badRequest;
    return COPY.server;
  }
  if (error instanceof Error && error.message.trim() !== '') {
    // A network-layer failure (fetch throws a TypeError) has no useful message for
    // a user; anything else we let through only in dev via `devDetail`.
    return error.name === 'TypeError' ? COPY.offline : COPY.generic;
  }
  return COPY.generic;
}

/** The raw message, for a dev-only detail line. Empty string in production. */
export function devDetail(error: unknown): string {
  if (!import.meta.env.DEV) return '';
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === 'string' ? error : '';
}
