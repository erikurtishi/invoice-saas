/**
 * A non-sensitive "this browser has a session" hint (backlog 1.1.4).
 *
 * The real credential is the httpOnly refresh cookie, which JS can't read. So on
 * a cold load the app otherwise can't tell "logged in, access token just dropped
 * on reload" from "never logged in" without asking the server — and asking means
 * a `/auth/me` + `/auth/refresh` 401 pair on every visit by a logged-out user,
 * repeated on every window refocus. This flag lets a genuinely logged-out browser
 * skip that probe entirely: no hint → no request → a clean console.
 *
 * It holds no secret and grants nothing — a stale `true` just costs the one 401
 * that clears it. Set on login/signup and on any successful `/auth/me` or
 * refresh; cleared on logout and on a failed refresh mid-session.
 *
 * Trade-off: a browser that clears localStorage but keeps its cookies is sent to
 * /login even though the refresh cookie is still valid. Clearing site data reads
 * as a "sign me out" signal in practice, so that's acceptable.
 */

const KEY = 'invoice-saas.session-hint';

export function markSessionHint(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* storage blocked (private mode) — the probe path still works */
  }
}

export function clearSessionHint(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    // Can't read storage — assume there might be a session and let the probe decide.
    return true;
  }
}
