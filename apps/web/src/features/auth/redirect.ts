/**
 * Whitelist a `?next=` value to an in-app path. Anything absolute, protocol-
 * relative, or malformed collapses to "/" so the parameter can't be used as an
 * open-redirect off-site.
 */
export function safeNextPath(raw: string | null): string {
  if (!raw) return '/';
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('/') && !decoded.startsWith('//')) return decoded;
  } catch {
    // fall through
  }
  return '/';
}
