import { env } from '../config/env';

/**
 * Browser error monitoring (backlog X.5.5 / L3.3.1). The Sentry SDK is
 * **dynamically imported** and only when `VITE_SENTRY_DSN` is set — a build
 * without a DSN doesn't ship the SDK at all, and every export here is a no-op.
 * Mirrors the API's `lib/observability.ts` in intent.
 *
 * `initObservability()` runs once in `main.tsx`; the root error boundary and the
 * in-shell route boundary both forward caught render errors through
 * `captureError()`.
 */

type SentryModule = typeof import('@sentry/react');
let sentry: SentryModule | null = null;

/** The options `Sentry.init()` is called with, minus `dsn`. Split out so it can
 *  be asserted in isolation and to keep parity with the API seam. */
export function sentryOptions() {
  return {
    environment: import.meta.env.MODE,
    // Undefined when unset → Sentry omits the tag. Injected as the shipped git
    // SHA by the build step (V1.4.4).
    release: env.VITE_SENTRY_RELEASE,
    // Errors only — no session replay, no tracing, no PII (form values and the
    // user's own data must not be shipped off).
    sendDefaultPii: false,
    tracesSampleRate: 0,
  };
}

export function initObservability(): void {
  if (!env.VITE_SENTRY_DSN) return;
  void import('@sentry/react').then((mod) => {
    mod.init({ dsn: env.VITE_SENTRY_DSN, ...sentryOptions() });
    sentry = mod;
  });
}

export function captureError(error: unknown, context?: Record<string, string>): void {
  sentry?.captureException(error, context ? { tags: context } : undefined);
}
