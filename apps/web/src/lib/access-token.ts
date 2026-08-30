/**
 * The access token lives in a module variable — never `localStorage` /
 * `sessionStorage` (backlog 1.1.1). It is short-lived, and the long-lived
 * credential (the refresh token) is an httpOnly cookie the JS can't touch; keeping
 * the access token out of any persistent, script-readable store means an XSS bug
 * can't exfiltrate a durable session.
 *
 * Cost: a full page reload drops the token. That is fine — `api-client` transparently
 * mints a new one from the refresh cookie on the first 401 after load.
 */

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}
