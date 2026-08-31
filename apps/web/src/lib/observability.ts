import { env } from '../config/env';

/**
 * Browser error monitoring (backlog X.5.5). The Sentry SDK is **dynamically
 * imported** and only when `VITE_SENTRY_DSN` is set — a build without a DSN
 * doesn't ship the SDK at all, and every export here is a no-op. Mirrors the
 * API's `lib/observability.ts` in intent.
 *
 * `initObservability()` runs once in `main.tsx`; the root error boundary forwards
 * caught render errors through `captureError()`.
 */

type SentryModule = typeof import('@sentry/react');
let sentry: SentryModule | null = null;

export function initObservability(): void {
  if (!env.VITE_SENTRY_DSN) return;
  void import('@sentry/react').then((mod) => {
    mod.init({
      dsn: env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      // Errors only — no session replay, no tracing, no PII (form values and the
      // user's own data must not be shipped off).
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
    sentry = mod;
  });
}

export function captureError(error: unknown, context?: Record<string, string>): void {
  sentry?.captureException(error, context ? { tags: context } : undefined);
}
