/** Where a signed-in user lands when there's no explicit `?next=` — the console
 * home, since `/` is the public marketing page. */
export const DEFAULT_AUTHED_PATH = '/console';

/**
 * Whitelist a `?next=` value to an in-app path. Anything absolute, protocol-
 * relative, or malformed collapses to the console home so the parameter can't be
 * used as an open-redirect off-site. A bare `/` also collapses to the console —
 * a signed-in user has no reason to be sent to the marketing page.
 */
export function safeNextPath(raw: string | null): string {
  if (!raw) return DEFAULT_AUTHED_PATH;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded === '/') return DEFAULT_AUTHED_PATH;
    if (decoded.startsWith('/') && !decoded.startsWith('//')) return decoded;
  } catch {
    // fall through
  }
  return DEFAULT_AUTHED_PATH;
}
