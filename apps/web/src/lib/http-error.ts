/**
 * Error thrown by the API client for a non-2xx response.
 *
 * Carrying the status code is what lets the QueryClient tell a retryable failure
 * (network blip, 500, 503) from a pointless one (400, 401, 403, 404). The full
 * standard API error shape is defined in packages/shared in task 0.2.5; this is the
 * transport-level wrapper around it.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** A 4xx is the client's fault and will fail identically on retry. */
export function isClientError(error: unknown): boolean {
  return error instanceof HttpError && error.status >= 400 && error.status < 500;
}
