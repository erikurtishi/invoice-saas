import { apiErrorBodySchema, authSessionSchema } from '@invoice-saas/shared';

import { env } from '../config/env';
import { clearAccessToken, getAccessToken, setAccessToken } from './access-token';
import { HttpError } from './http-error';

/**
 * The one place the web app talks to the API (backlog 1.1.4 / 1.1.5).
 *
 * Responsibilities:
 *  - attach `Authorization: Bearer <accessToken>` from the in-memory store
 *  - send `credentials: 'include'` so the refresh cookie rides along
 *  - on a 401, transparently rotate the token via `/auth/refresh` **once** and
 *    replay the request (requests that race share a single refresh)
 *  - if that fails, clear the token and fire `onSessionExpired` so the app can
 *    bounce to /login globally
 *  - turn every non-2xx into an `HttpError` carrying the status (and `fields` for
 *    a 422) so `toUserMessage` / `<QueryBoundary>` / forms all handle it uniformly
 */

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

/** Register a global 401 handler (the app shell wires this to a redirect). */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

function notifySessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener();
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON-serialised, unless it is a `FormData` (multipart, e.g. the logo upload) —
   * then it is sent as-is and the browser sets the `Content-Type` + boundary. */
  body?: unknown;
  /** Attempt a token refresh + replay on a 401. Off for the auth endpoints that
   * would recurse (login, signup, refresh). Default true. */
  retryOnUnauthorized?: boolean;
  /** Fire the global `onSessionExpired` listeners if auth ultimately fails. The
   * session bootstrap query sets this false — a cold load with no session is not
   * an "expired" event, the route guard handles it. Default true. */
  notifyOnSessionExpiry?: boolean;
  signal?: AbortSignal;
}

let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${env.VITE_API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const session = authSessionSchema.parse(await res.json());
    setAccessToken(session.accessToken);
    return true;
  } catch {
    return false;
  }
}

function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function toHttpError(res: Response): Promise<HttpError> {
  let message = res.statusText || 'Request failed';
  let fields: Record<string, string[]> | undefined;
  try {
    const parsed = apiErrorBodySchema.safeParse(await res.json());
    if (parsed.success) {
      message = parsed.data.error.message;
      fields = parsed.data.error.fields;
    }
  } catch {
    // non-JSON body — keep the status-text fallback
  }
  return new HttpError(res.status, message, fields);
}

/**
 * The shared request core: attaches the bearer token, sends with credentials,
 * transparently rotates the token once on a 401 and replays. Returns the raw
 * `Response` (still checked for `res.ok`) so both the JSON helper and the binary
 * helper below get identical auth handling.
 */
async function apiRequest(
  path: string,
  options: ApiFetchOptions,
  accept: string,
): Promise<Response> {
  const {
    method = 'GET',
    body,
    retryOnUnauthorized = true,
    notifyOnSessionExpiry = true,
    signal,
  } = options;

  const send = (): Promise<Response> => {
    const headers: Record<string, string> = { Accept: accept };
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body; // browser sets multipart Content-Type + boundary
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    return fetch(`${env.VITE_API_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      ...(payload !== undefined ? { body: payload } : {}),
      ...(signal ? { signal } : {}),
    });
  };

  let res = await send();

  if (res.status === 401 && retryOnUnauthorized) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await send();
    if (!refreshed || res.status === 401) {
      clearAccessToken();
      if (notifyOnSessionExpiry) notifySessionExpired();
      throw await toHttpError(res);
    }
  }

  if (!res.ok) throw await toHttpError(res);
  return res;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const res = await apiRequest(path, options, 'application/json');
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Fetch a binary response (the invoice PDF `4.3.3`, the library CSV `4.5.4`) with
 * the same auth / refresh handling as `apiFetch`. Returns the blob plus the
 * filename the server put in `Content-Disposition`, so the caller can trigger a
 * correctly-named download without hard-coding it.
 */
export async function apiFetchBlob(
  path: string,
  options: ApiFetchOptions = {},
  accept = 'application/octet-stream',
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await apiRequest(path, options, accept);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = utf8 ? decodeURIComponent(utf8[1]!) : (plain?.[1] ?? null);
  return { blob: await res.blob(), filename };
}
