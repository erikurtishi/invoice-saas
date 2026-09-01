# Testing & monitoring (Epic X.5)

## Layers

| Layer | Runner | Where | Needs |
| --- | --- | --- | --- |
| Unit — pure logic | Vitest | `packages/shared/src/**/*.test.ts` | nothing |
| Integration — DB-backed | Vitest | `apps/api/src/**/*.integration.test.ts` | local Postgres (`apps/api/.env`, D2) |
| PDF snapshot | Vitest | `apps/api/src/lib/pdf/pdf-snapshot.integration.test.ts` | Postgres + headless Chrome |
| E2E happy path | Playwright | `apps/web/e2e/happy-path.spec.ts` | full stack (auto-booted) |
| Accessibility | Playwright + axe-core | `apps/web/e2e/a11y.spec.ts` | full stack |
| Responsive smoke | Playwright | `apps/web/e2e/responsive.spec.ts` | full stack — phone/tablet viewports, no page side-scroll (L3.4; physical pass in `docs/device-testing.md`) |
| End-to-end smoke checks | `tsx` scripts | `apps/api/scripts/*-check.ts` | local Postgres (some also Chrome / Stripe) |

The `*-check.ts` scripts predate Vitest and stay as broader, live-DB smoke checks
(numbering, invoice math, entitlements lifecycle, history, cross-tenant isolation,
render/font round-trip, Stripe, AI). Vitest tests are the focused,
assertion-per-behaviour layer that a change is expected to keep green on every run.

## Commands

```sh
npm test                 # all Vitest projects, once
npm run test:watch       # Vitest watch mode
npm run test:coverage    # + v8 coverage
npm run test:e2e         # Playwright (boots the API + web dev server itself)
npm run check:db         # the tsx smoke checks in sequence (needs Postgres)
```

Run a subset:

```sh
npm test -- shared                       # just the shared project
npm test -- invoice-math                 # files matching a substring
npm run test:e2e -w @invoice-saas/web -- happy-path
```

## What's covered

- **X.5.1 — money / tax / rounding / numbering.** `money.test.ts` (minor-unit and
  basis-point round-trips, malformed-input rejection), `invoice-math.test.ts`
  (line-level half-up rounding in the D20 order, per-rate tax grouping, RECEIPT
  amountDue), `invoice-numbering.test.ts` (`formatInvoiceNumber` token rendering)
  and `invoice-numbering.integration.test.ts` (the atomic allocation is gapless,
  independent per `(documentType, year)`, and leaves **no gap** when its
  transaction rolls back).
- **X.5.2 — entitlements.** `entitlements.integration.test.ts` asserts the
  capability grid: FREE (1 lifetime invoice, no templates, no AI), BASIC
  (unlimited invoices + templates, no AI, writes the `users.tier` cache), PREMIUM
  (AI unlocked, metered monthly). The deeper lifecycle stays in
  `scripts/entitlements-check.ts`.
- **X.5.3 — E2E happy paths.** One Playwright flow, real API: signup → onboarding
  → create a client → create + issue an invoice → download the PDF → send it and
  see the send-confirmation state. Servers are booted by `playwright.config.ts`'s
  `webServer` against the local Postgres; `PW_REUSE=1` runs against servers you
  already have up. Throwaway `e2e-*@example.test` tenants are removed by
  `e2e/global-teardown.ts` (→ `npm run e2e:cleanup -w @invoice-saas/api`).
- **X.5.4 — PDF snapshots.** `pdf-snapshot.integration.test.ts` renders a real PDF
  for every `paperSize × language` (A4 / Letter / Legal / A5 × EN / SQ / MK) and
  asserts the page comes out at the right physical dimensions (± a point) and the
  localized text survives as selectable text. Structural, not pixel — pixel diffs
  are unreproducible across Chrome versions.
- **X.5.6 — accessibility.** `a11y.spec.ts` runs axe-core over the key public and
  authenticated screens and fails on any *serious* / *critical* violation
  (contrast, labels, name-role-value). It scans the **light** theme — the app's
  primary, contrast-tuned palette. Fixes made from the first run: the dark palette
  was applied unconditionally (Tailwind v4 hoists `@theme` blocks regardless of a
  `@media` wrapper — the app rendered dark for everyone; now a plain `:root`
  override), and `--color-primary` moved to blue-700 so it clears AA as button
  fill, as link text, and as `text-primary` on the `bg-primary/10` active-nav
  tint.

## Known follow-ups

- **Dark-mode a11y sweep.** The gate scans light. Dark mode has known contrast
  gaps — `text-primary` link/nav text on the near-black card surfaces (~3.5:1) —
  that want a lighter dark-mode accent token or a dedicated link colour. Track as
  its own task; it's a palette change, not a test change. (Lighthouse's L3.5.2
  `color-contrast` flag on the landing hero pill folds into this.)
- **Performance profiling** lives in `docs/performance.md` — Lighthouse on the
  local prod build (L3.5). Not a repo dependency; run via `npx lighthouse` against
  `vite preview`. Top follow-up: route-level `lazy()` for `/console/*` + `/admin/*`
  to cut the 347 KB gz base chunk.
- **CI (done — production backlog L3.1).** `.github/workflows/ci.yml` runs on every
  push to `main` and every PR, from a clean checkout, in three parallel jobs:
  _quality_ (lint · `format:check` · typecheck · build · `i18n:check`, no DB),
  _checks-and-tests_ (a `postgres:17` service + `db:migrate:deploy`, then
  `check:db` and the `ai`/`admin`/`overview`/`tenants`/`usage`/`billing`/`support`
  guard scripts, then `npm test`), and _e2e_ (`postgres:17` + `playwright install
  --with-deps chromium`, then `npm run test:e2e`). No secret values in CI —
  `stripe:check` runs only when a `STRIPE_TEST_SECRET_KEY` repo secret is set and
  is skipped (green) otherwise. Deploy-on-merge is still V1.4.

---

## Monitoring (X.5.5)

### Error monitoring — Sentry, optional, free

The Sentry SDKs (`@sentry/node`, `@sentry/react`) are MIT-licensed and Sentry's
Developer plan is free; the integration ships now, dark until a DSN is set.

- **API** — `apps/api/src/lib/observability.ts`. `initObservability()` runs first
  in `index.ts`; with no `SENTRY_DSN` it is a no-op. `captureError()` is called
  from the central `error-handler.ts` for genuine 5xx only (4xx `ApiError`s are
  normal traffic). No PII (`sendDefaultPii: false`), errors-only (no tracing).
  `sentryOptions()` builds the `init` config — `environment` = `NODE_ENV`,
  `release` = `SENTRY_RELEASE` (unset locally; the deploy step sets it to the git
  SHA at V1.4.4).
- **Web** — `apps/web/src/lib/observability.ts`. `initObservability()` in
  `main.tsx` **dynamically imports** `@sentry/react` only when `VITE_SENTRY_DSN`
  is set, so a build without a DSN doesn't ship the SDK. `environment` =
  `import.meta.env.MODE`, `release` = `VITE_SENTRY_RELEASE`. Both the root
  `<AppErrorBoundary>` and the in-shell route `<ErrorBoundary>` forward caught
  render errors through `captureError()` (the route one added in L3.3.1 — before
  that a route crash was `console.error` only).

**Verifying the seam (L3.3.1).** `npm run sentry:check -w @invoice-saas/api` proves
it offline: with no DSN the seam stays dark; then it inits Sentry with a
`beforeSend` hook, captures a deliberate error, and asserts the assembled event
carries `environment` + `release` + the message + non-PII tags — sending nothing.
Set a real `SENTRY_DSN` (+ `SENTRY_RELEASE`) and the same event is also
transmitted. Web: with `VITE_SENTRY_DSN` set, call `__sentryTestError()` in the
browser console (dev builds only). The visual "it showed up in the Sentry UI"
confirmation is V1.6.1.

To enable in staging / production: create a free Sentry project, set `SENTRY_DSN`
(+ `SENTRY_RELEASE`) in `apps/api`'s env and `VITE_SENTRY_DSN`
(+ `VITE_SENTRY_RELEASE`) in `apps/web`'s build env. Nothing else changes.

### Uptime monitoring — ops, free tier

`GET /health` returns `{ status: "ok" }` and is exempt from rate limiting
(`middleware/rate-limit.ts`), so it's the probe target. When the VPS is stood up
(0.3.1), point a free external monitor at `https://<domain>/health` — UptimeRobot,
BetterStack and Sentry's own Uptime all have free tiers that cover a single
endpoint at a 1–5 minute interval with email/Slack alerts. Alert on: non-200,
body not `"ok"`, or latency over a few seconds. Pair with the backup-job alert in
`backup-and-secrets-runbook.md` §6.
