/**
 * Sentry seam check (backlog L3.3.1 — "verify the error-monitoring wiring
 * locally"). Two phases, no live Sentry project needed:
 *
 *   A. Gating — with no `SENTRY_DSN` the seam is dark: `initObservability()` does
 *      nothing, `observabilityEnabled()` is false, `captureError()` is a no-op and
 *      never throws. (This is what keeps `npm run dev` and CI untouched.)
 *   B. Envelope — init Sentry with a `beforeSend` hook and capture a deliberate
 *      error. The hook receives the fully-assembled event, so we can assert it
 *      carries `environment` (always), that `sentryOptions().release` mirrors
 *      `SENTRY_RELEASE`, and — when that var is set — that the release reaches the
 *      event, plus the thrown message and our tags, without anything leaving the
 *      process. (When `SENTRY_RELEASE` is unset the SDK may still backfill the
 *      event's release from a CI env var such as `GITHUB_SHA`; that's the SDK's
 *      doing, not our seam's, so B asserts our option, not the raw event.) If a
 *      real `SENTRY_DSN` *is* set, the same event is also transmitted, so this
 *      doubles as the "throw a test error and see it in the UI" step (the UI
 *      confirmation itself is V1.6.1).
 *
 *   npm run sentry:check -w @invoice-saas/api
 *   SENTRY_DSN=https://…  SENTRY_RELEASE=$(git rev-parse HEAD)  npm run sentry:check -w @invoice-saas/api
 */
import * as Sentry from '@sentry/node';

import { env } from '../src/config/env.js';
import {
  captureError,
  flushObservability,
  initObservability,
  observabilityEnabled,
  sentryOptions,
} from '../src/lib/observability.js';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}

// A syntactically valid DSN that is never actually contacted — `beforeSend`
// returns null below, so the transport has nothing to send.
const DUMMY_DSN = 'https://0123456789abcdef0123456789abcdef@o0.ingest.sentry.io/0';
const TEST_MESSAGE = 'L3.3.1 API test error';

async function main(): Promise<void> {
  const realDsn = env.SENTRY_DSN;
  console.log(
    realDsn
      ? `SENTRY_DSN is set (${new URL(realDsn).host}) — phase B will also transmit a real event`
      : 'SENTRY_DSN not set — offline run (phase B asserts the event shape, sends nothing)',
  );

  // --- Phase A: the seam is dark without a DSN --------------------------------
  check(
    'captureError() before init does not throw',
    safe(() => captureError(new Error('probe'))),
  );
  initObservability();
  check(
    'observabilityEnabled() matches whether a DSN is configured',
    observabilityEnabled() === Boolean(realDsn),
    `enabled=${observabilityEnabled()}`,
  );
  if (!realDsn) {
    check(
      'captureError() is a no-op when the seam is dark',
      safe(() => captureError(new Error('probe'), { trigger: 'sentry-check' })),
    );
  }

  // --- Phase B: the assembled event carries environment + release ------------
  const captured: Sentry.Event[] = [];
  Sentry.init({
    dsn: realDsn ?? DUMMY_DSN,
    ...sentryOptions(),
    beforeSend(event) {
      captured.push(event);
      return realDsn ? event : null; // transmit only against a real project
    },
  });

  Sentry.captureException(new Error(TEST_MESSAGE), {
    tags: { check: 'sentry-check', trigger: 'manual' },
  });
  await Sentry.flush(2000);

  check('exactly one event was assembled', captured.length === 1, `count=${captured.length}`);
  const event = captured[0];
  if (event) {
    check(
      `event.environment === NODE_ENV ("${env.NODE_ENV}")`,
      event.environment === env.NODE_ENV,
      `got ${JSON.stringify(event.environment)}`,
    );
    // `release` is our seam's responsibility only as far as the option we hand
    // `Sentry.init()`. When `SENTRY_RELEASE` is unset that option is `undefined`;
    // the SDK itself may then backfill the event from a CI env var (`GITHUB_SHA`
    // on Actions, Vercel/Netlify equivalents, …), which is fine — a CI-driven
    // deploy *should* be tagged. So assert our option here, and separately that a
    // release we *did* set survives into the assembled event.
    check(
      'sentryOptions().release mirrors SENTRY_RELEASE (unset ⇒ undefined)',
      sentryOptions().release === env.SENTRY_RELEASE,
      `option=${JSON.stringify(sentryOptions().release ?? null)}`,
    );
    if (env.SENTRY_RELEASE) {
      check(
        `event.release === SENTRY_RELEASE ("${env.SENTRY_RELEASE}")`,
        event.release === env.SENTRY_RELEASE,
        `got ${JSON.stringify(event.release)}`,
      );
    }
    const message = event.exception?.values?.[0]?.value ?? '';
    check('event carries the thrown message', message.includes(TEST_MESSAGE), message);
    check(
      'event carries the non-PII tags we passed',
      event.tags?.check === 'sentry-check' && event.tags?.trigger === 'manual',
      JSON.stringify(event.tags ?? {}),
    );
    check('sendDefaultPii is off, so no user object is attached', event.user === undefined);
  }

  // --- Phase C: real send, only when a DSN is actually configured -----------
  if (realDsn) {
    initObservability();
    captureError(new Error(`${TEST_MESSAGE} (via captureError)`), { trigger: 'sentry-check' });
    await flushObservability();
    console.log(
      `\nA real event was transmitted to ${new URL(realDsn).host}. Confirm it lands in the ` +
        'Sentry issue stream with the right environment + release tags (that visual check is V1.6.1),\n' +
        'then unset SENTRY_DSN for normal local dev.',
    );
  }

  console.log(failures === 0 ? '\nsentry:check OK' : `\nsentry:check FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

function safe(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
