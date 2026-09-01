import * as Sentry from '@sentry/node';

import { env } from '../config/env.js';

/**
 * Error monitoring (backlog X.5.5 / L3.3.1). Sentry is initialised only when
 * `SENTRY_DSN` is set; without it every function here is a no-op, so local dev
 * and the check scripts run untouched — the same "configure to enable, degrade
 * otherwise" shape as the Stripe / Mailer / Storage ports.
 *
 * Call `initObservability()` once, first thing in `index.ts`. Report unexpected
 * failures through `captureError()` from the central error handler — never
 * scatter `Sentry.*` calls through the codebase.
 */

let enabled = false;

/**
 * The options `Sentry.init()` is called with. Split out so `scripts/sentry-check.ts`
 * can assert the shipped event carries `environment` + `release` without a live
 * project (backlog L3.3.1). `dsn` is left for the caller to supply.
 */
export function sentryOptions(): Sentry.NodeOptions {
  return {
    environment: env.NODE_ENV,
    // Undefined when unset → Sentry simply omits the tag. Set to the deployed git
    // SHA by the deploy step (V1.4.4) so an incident maps to a release.
    release: env.SENTRY_RELEASE,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // PII (emails, client names, request bodies) must not leave the box.
    sendDefaultPii: false,
  };
}

export function initObservability(): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({ dsn: env.SENTRY_DSN, ...sentryOptions() });
  enabled = true;
  console.log(
    `Sentry error monitoring enabled (${env.NODE_ENV}${
      env.SENTRY_RELEASE ? `, release ${env.SENTRY_RELEASE}` : ''
    })`,
  );
}

export function observabilityEnabled(): boolean {
  return enabled;
}

/**
 * Report an unexpected error. Client faults (4xx `ApiError`s) are deliberately
 * skipped — they are normal traffic, not incidents. `context` is attached as
 * non-PII tags (method, path, status).
 */
export function captureError(error: unknown, context?: Record<string, string | number>): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { tags: context } : undefined);
}

/** Flush buffered events before the process exits (used by short-lived paths). */
export async function flushObservability(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  await Sentry.flush(timeoutMs).catch(() => undefined);
}
