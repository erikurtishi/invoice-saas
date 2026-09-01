import { isProduction } from '../config/env.js';

/**
 * CORS origin policy (backlog L3.4.1 — real-device pass).
 *
 * Production is locked to the one configured `WEB_ORIGIN`. Development also
 * accepts the origins a phone / tablet or a tunnel actually presents when
 * pointed at this machine, so device testing needs no env juggling and no
 * restart when the LAN IP changes:
 *
 *   - localhost / 127.0.0.1 on any port
 *   - a private-range LAN IP (10/8, 172.16/12, 192.168/16) on any port
 *   - a cloudflared / ngrok / localtunnel host over https
 *
 * A request with no `Origin` header (same-origin, curl, server-to-server) is
 * always allowed — CORS only governs browser cross-origin calls.
 */

const TUNNEL_HOSTS = /\.(trycloudflare\.com|ngrok-free\.app|ngrok\.io|ngrok\.dev|loca\.lt)$/;

function isPrivateLanHttpOrigin(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const { hostname } = url;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function makeCorsOrigin(webOrigin: string) {
  return (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void): void => {
    if (!origin || origin === webOrigin) {
      cb(null, true);
      return;
    }
    if (!isProduction) {
      try {
        const url = new URL(origin);
        if (
          isPrivateLanHttpOrigin(url) ||
          (url.protocol === 'https:' && TUNNEL_HOSTS.test(url.hostname))
        ) {
          cb(null, true);
          return;
        }
      } catch {
        /* not a URL — fall through to reject */
      }
    }
    cb(new Error(`Origin ${origin} not allowed by CORS`));
  };
}
