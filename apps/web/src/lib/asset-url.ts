import { env } from '../config/env';

/**
 * Resolve a server-relative asset path (e.g. a `logoUrl` of `/uploads/logos/x.webp`)
 * to an absolute URL against the API origin. Pass-through for values that are
 * already absolute, and `null` for nullish input so callers can spread it straight
 * into an `<img src>` guard.
 */
export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${env.VITE_API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
