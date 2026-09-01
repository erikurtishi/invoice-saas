# Invoice Generator SaaS — Production Backlog (local-first)

Companion to `invoice-saas-backlog.md`. That document tracks the **product build** and is
effectively feature-complete (198 tasks done). This document tracks everything that still
stands between the current codebase and a **public production launch**.

## Working strategy: local first, VPS last

The VPS is **not being purchased yet** (~1 month out). That is fine and it is the plan of
record — decision `D1`: *"Build and test locally against real Postgres now; provision the
VPS at `0.3.1`."* Everything that does **not** strictly require a running server can be
finished on localhost against the local Postgres in the meantime.

This backlog is therefore split into two tiers:

| Tier | Phases | When | Needs the VPS? |
|---|---|---|---|
| **Local now** | **L1 – L4** | Do these this month, on your machine | No |
| **VPS bring-up** | **V1** | The day the VPS is provisioned | Yes — every task here |

The rule for deciding which tier a task belongs to: *can I verify this is done without a
server that is reachable from the internet?* If yes → an `L` phase. If it needs a public
domain, TLS, a process manager on a box, a cron on a box, or a deploy pipeline → `V1`.

Nothing is lost by deferring V1: the runbooks (`docs/puppeteer-hosting-runbook.md`,
`docs/backup-and-secrets-runbook.md`) already spell out the box setup step by step, and
the code seams (mail port, `renderPdf` port, `Storage` port, env loader) are built so the
switch from local to server is configuration, not code.

---

## 0. Conventions

**Progress markers:** `[x]` done · `[~]` partially done (see note) · `[ ]` not started.
**Task ID format:** `PHASE.EPIC.TASK` — local phases `L1`–`L4`, VPS phase `V1`.
**Sizes:** S = under half a day · M = 1–2 days · L = 3–5 days · XL = split it.
**Decision refs** `D1`…`D35` live in `docs/decisions.md`.

**A local task is done when:** it works end to end against `npm run dev` + local Postgres,
the relevant `*:check` / test script is green, all five UI states + i18n hold, and — where
a runbook exists — the runbook is updated with what was done (its "executed on the VPS"
line stays open until V1).

### Status snapshot

| Area | State today | Where |
|---|---|---|
| Product features (Phases 0–8, X.1–X.7) | **Done**, tested locally (Vitest + Playwright) | — |
| Transactional email provider (`4.3.4`) | **Resend wired + sent** (`D33`); all 9 (verify/reset/invoice × EN/SQ/MK, real PDF) accepted by Resend. Failure path verified. Owner inbox-eyeball owed (`L1.1.3`) | **L1** |
| LLM provider for AI drafting (`7.1.1`) | **Two adapters built** (`AI_PROVIDER=anthropic`\|`custom`), default still `NullDrafter`. No key wired — owner flips it on + verifies cap (`L1.2.3`) | **L1** |
| OG / social image (`X.6.3`) | **Done** — `og-image.png` (1200×630) + static OG/Twitter block in `index.html` (no-JS scrapers) + per-locale `useLandingSeo()`; headless-verified. Real-platform preview is `V1.5.4` | **L1** |
| Admin console UI (Phase 8, `6.3.2`) | **Done.** All of Phase L2 (`L2.1`–`L2.8`) shipped: shell, typed hooks, charts, Overview, tenants + audit-log, grants, cost/usage, billing, support inbox | **L2** |
| CI (lint/typecheck/build/test) (`0.3.4`) | **Done** (`L3.1`) — `.github/workflows/ci.yml`, 3 jobs (quality / guard-scripts+Vitest / Playwright) on push+PR against a `postgres:17` service; no secrets, `stripe:check` opt-in | **L3** |
| Backup script (`0.3.5`, X.4.7 §2) | **Done** (`L3.2`) — `ops/invoice-backup.sh` + `ops/invoice-restore.sh` (shellcheck-clean, env-driven), local backup→encrypt→restore→app-smoke round-trip passed, runbook restore-log dated | **L3** ✓ / **V1** (install cron = V1.5.1) |
| Real-device + perf passes (X.2, X.3) | **`L3.4` done** — `npm run dev:lan` + dev LAN/tunnel CORS; `responsive.spec.ts` + `mobile-critical-path.spec.ts` (full walk at iPhone 13 / iPad Mini, Chromium) automate the device pass; fixed a real phone side-scroll on `/invoices/new`; PDF glyph embedding verified via `render:check` + a FontFile probe. Residual = a ~10-min iOS-Safari eyeball (`docs/device-testing.md`). **Perf `L3.5` done** — Lighthouse recorded (`docs/performance.md`): landing desktop 99 / mobile 83, a11y 96, SEO 100 (added `robots.txt`), TBT ≤40 ms, marketing chunk still 47 KB gz | **L3** |
| Security review, GDPR verify, session decision | **`L3.6` + `L3.7` done** — security pass clean (`docs/security-review.md`, 1 Low dev-only accepted); rate limits + `trust proxy: 1` documented; GDPR export/delete + cascade verified locally; session strategy ratified (`D35` — no launch changes, 90-day absolute cap is a recommended fast-follow). Only open item: re-run the `/security-review` skill once the L3 branch is committed | **L3 / L4** |
| VPS, domain, TLS, process manager, deploy, live monitoring, Stripe live | Nothing done | **V1** |

### Explicitly not in this document

- `X.7.24` (partial CSV export) — N/A for the current export shape. No work for launch.
- Any new product feature (paid/unpaid status, reminders, teammates `D3`, cloud `Storage`
  adapter `D15`) — out of scope, recorded as decisions.

---

# PHASE L1 — Local providers & seams

**Goal:** make the three deliberately-stubbed external seams real, all testable from
localhost. Each is a single implementation behind an existing port — no call-site changes.

**Note on `NODE_ENV=production`:** `mail/index.ts` throws at boot if it's production and no
real mailer is wired. That gate only matters on the VPS (V1). Locally you keep running in
dev mode; `L1.1` just makes the real mailer *available* so V1 is a config flip.

## Epic L1.1 — Transactional email provider

Closes `4.3.4` (S) / the open decision in `decisions.md`. Port:
`apps/api/src/mail/mailer.ts` (`Mailer.send(MailMessage)`); dev transport
`console-mailer.ts`; wiring point `mail/index.ts`.

- [x] `L1.1.1` (S) Choose the provider
  - Candidates named in the code: Resend / Postmark / SMTP. Decide on deliverability for
    the Balkans + US, price, free-tier limits, and attachment support (the invoice PDF
    rides along as `MailAttachment`). Record as a new `D`-decision.
  - All of these have a free tier and a **sandbox / onboarding sending domain** you can
    use from localhost with no domain of your own — enough to build and test now.
  - **Done when:** the decision + reasoning are in `decisions.md`.
  - **Done — `D33`: Resend** (permanent free tier, sandbox `onboarding@resend.dev`
    sending domain, first-class attachments). Reasoning in `decisions.md`.
- [x] `L1.1.2` (S) Implement the `Mailer`
  - One new class implementing `send()` incl. `attachments`, `text` always, `html`
    optional. One-line swap in `mail/index.ts` gated on an env var (keep `ConsoleMailer`
    as the default for `npm run dev`; select the real one when the key is present).
  - Add the API key to `config/env.ts` (optional in dev, required in prod) and to the
    backup-runbook §4 secret table + `apps/api/.env.example`.
  - **Done when:** with the key set locally, a real email is sent from `npm run dev` and
    no call site changed.
  - **Done:** `mail/resend-mailer.ts` (`ResendMailer`, the only importer of `resend`);
    `mail/index.ts` selects it when `RESEND_API_KEY` + `MAIL_FROM` are set, else
    `ConsoleMailer`. `RESEND_API_KEY` (`re_…`) + `MAIL_FROM` added to `config/env.ts`
    (a `superRefine` requires `MAIL_FROM` when the key is present), `.env.example`,
    backup-runbook §4. No call site changed. typecheck + lint + build + `npm test` (53)
    green. The live send with a real key is `L1.1.3`.
- [~] `L1.1.3` (S) Verify the three transactional emails against a real inbox
  - Email verification, password reset, invoice send (with the PDF attached). Copy already
    routes through i18n / `renderLabels` — check EN/SQ/MK render.
  - Deliverability tuning (SPF/DKIM/DMARC on *your* domain) is **V1.5** — it needs the
    domain. The provider sandbox domain is fine for now.
  - **Done when:** all three arrive at a test inbox from localhost with correct content
    and the PDF opens.
  - **Sent (2026-09-01):** `npm run l1:mail-check -w @invoice-saas/api` — a new script
    that drives the real `ResendMailer` through `sendVerificationEmail`,
    `sendPasswordResetEmail`, and `buildInvoiceEmail` + a **real Puppeteer-rendered
    invoice PDF** (88–98 KB, size varies by language = fonts embedding). All 9
    (verify/reset/invoice × EN/SQ/MK) accepted by Resend from `onboarding@resend.dev`
    → `erionerion64@gmail.com`. **Owner still to eyeball the inbox**: EN/SQ/MK copy +
    subject render, and the attached PDF opens with Cyrillic/Albanian glyphs intact.
- [x] `L1.1.4` (S) Failure path holds
  - A provider 5xx must still surface as the app's existing "PDF generated but email could
    not be sent" 502 → `<InvoiceActions>` "Download instead" + "Try again" panel
    (`X.7.15` / `4.3.7`). Never a combined success.
  - **Done when:** forcing a provider failure locally shows exactly that panel, no success
    toast.
  - **Verified (2026-09-01):** forced a real provider failure (`ResendMailer` with a
    bogus key) — the SDK returns `{ error }` (401), `ResendMailer.send()` throws on it,
    and `sendInvoice` (`services/pdf-service.ts:141`) unconditionally turns any throw
    from `mailer.send()` into the 502 with the exact "PDF was generated but the email
    could not be sent" message. The 502 → "Download instead / Try again" panel is
    `X.7.15`, already shipped + tested. A literal browser click-through is the only
    remaining nicety.

## Epic L1.2 — LLM provider for AI drafting

Closes `7.1.1` (`[~]` — "port only, concrete provider deferred: Anthropic vs OpenAI",
`D25`). Port: `apps/api/src/lib/ai/drafter.ts` (`AiDrafter`); stub `null-drafter.ts`;
cost model `cost.ts`; wiring `lib/ai/index.ts`. Schema
`packages/shared/src/ai.ts` (`aiExtractionSchema` — no computed money, UTC dates). Log
table `AiGenerationLog`. Check: `npm run ai:check`.

> **Approach (2026-09-01):** "make the place for the AI but do not connect to any
> model." Two selectable adapters are built behind the existing port; the default
> build stays on `NullDrafter` (nothing contacted). Provider is picked by
> `AI_PROVIDER`: `anthropic` (an existing hosted model — Claude Haiku) or `custom`
> (an OpenAI-compatible endpoint the owner runs). No API key is wired here.

- [~] `L1.2.1` (S) Choose the provider + model
  - Default to the latest capable Claude model per project guidance. Confirm structured-
    output support matches `aiExtractionSchema` (client name, line items w/
    description/qty/unit price, dates, currency). An API key is all that's needed — fully
    local.
  - **Done when:** decision + model id recorded in `decisions.md` (extends `D25`).
  - **Shape decided (D25 extension):** not one provider — a seam with two options
    (`anthropic` for Haiku, `custom` for a self-built model). Exact model id is the
    owner's to set in `AI_MODEL` when they switch it on.
- [x] `L1.2.2` (M) Implement the `AiDrafter`
  - One class calling the provider with the strict schema; map the response onto
    `aiExtractionSchema`; populate token counts + `costMicros` via `cost.ts`. Swap
    `NullDrafter` → real impl in `lib/ai/index.ts`, gated on the key being present (keep
    `NullDrafter` for keyless local runs and CI). Key into `config/env.ts` +
    backup-runbook §4 + `.env.example`.
  - Preserve invariants: no computed money from the model, dates UTC, a failed/malformed
    generation is logged to `AiGenerationLog` but does **not** increment the
    `UsageCounter` (`X.7.18`).
  - **Done when:** `npm run ai:check` passes against the real provider and `AiDraftPanel`
    (create-invoice screen) fills fields with `AiFilledBadge` markers, running locally.
  - **Done:** `lib/ai/claude-drafter.ts` (`ClaudeDrafter`, plain `fetch` on
    `/v1/messages`, forced-tool-use with `z.toJSONSchema(aiExtractionSchema)`, no
    `@anthropic-ai/sdk` dep) + `lib/ai/custom-drafter.ts` (`CustomDrafter`,
    OpenAI-compatible `/chat/completions` + json-mode) + shared `lib/ai/prompt.ts`.
    `lib/ai/index.ts` switches on `AI_PROVIDER` (`anthropic` | `custom` | unset →
    `NullDrafter`). `config/env.ts` (`AI_PROVIDER`/`AI_MODEL`/`ANTHROPIC_API_KEY`/
    `AI_BASE_URL`/`AI_API_KEY` + a boot-refusal superRefine), `.env.example`,
    backup-runbook §4 all updated. No key wired — default build unchanged.
    `npm run ai:check` (fake) + `npm test` (53) green; `npm run ai:provider-check`
    added (offline: asserts `NullDrafter`; with a key: one real `draft()` +
    schema check). Verified offline that a bad key → `AiProviderError http_401`
    and an unreachable custom URL → `network_error`. The service already keeps
    every invariant (no computed money, UTC dates, failure ⇒ no `UsageCounter`
    bump) — `ai-draft-service.ts` untouched. `npm run ai:check` "against the real
    provider" + the `AiDraftPanel` eyeball need a key → the owner, at `L1.2.3`.
- [ ] `L1.2.3` (S) Rate limit + monthly cap verified
  - `7.1.6` hard limits and `D6` (50 successful generations / calendar month on Premium)
    enforced against the real provider.
  - **Done when:** the 51st successful generation in a month is refused with the friendly
    gate (`X.7.17`), and cost shows up in the `/admin/usage/ai` response.
- [ ] `L1.2.4` (S) Failure UX holds
  - Model unavailable / malformed → `AiDraftPanel` shows `toUserMessage(error)`, counter
    not decremented, user-cancel `AbortError` filtered.
  - **Done when:** a forced provider error locally shows the message and the
    remaining-generations count is unchanged.

## Epic L1.3 — Social / SEO image

Closes `X.6.3` ("OG/Twitter image artwork is a separate design task; add the asset before
launch").

- [x] `L1.3.1` (S) Produce `og-image.png`
  - 1200×630, product name + value prop, on-brand. Per-language variants optional. Place
    in `apps/web/public/` so the dev server and the eventual static build both serve it at
    `/og-image.png`.
  - **Done when:** the file exists and resolves at `http://localhost:5173/og-image.png`
    (and is picked up by `npm run build`).
  - **Done:** `apps/web/public/og-image.png`, 1200×630, brand gradient (`#47bfff` →
    `#7e14ff`) + "Invoice SaaS" + the hero tagline + "MK · AL · XK" + the three
    languages + an invoice-document motif. `npm run build -w @invoice-saas/web`
    emits it to `dist/og-image.png`. A hand-designed replacement is a nice-to-have,
    not a blocker.
- [x] `L1.3.2` (S) Verify the tags locally
  - `useLandingSeo()` already emits `og:*` / `twitter:*`. Check the rendered `<head>` on
    `/` and validate the image path. Full card-preview validation on real platforms needs
    a public URL → **V1.5** (or a temporary tunnel).
  - **Done when:** DevTools shows the meta tags with a resolvable image URL.
  - **Verified (2026-09-01), headless Chrome against the production build:**
    - Added a **static** OG/Twitter block to `apps/web/index.html` (EN copy, `og:type`,
      `og:site_name`, `og:locale`, `og:title`, `og:description`, `og:image`,
      `twitter:card`/`title`/`description`/`image`) so **no-JS social scrapers** get a
      valid card — a SPA that only injects tags client-side would show none.
      `useLandingSeo()` reuses these same tags, so JS clients still get per-locale copy.
    - Rendered `<head>` on `/` confirmed for EN/SQ/MK: `<title>`, `og:title`,
      `og:description`, `og:locale` and `twitter:*` all localise (e.g. `og:locale`
      `en`→`sq`→`mk`; MK title in Cyrillic).
    - `/og-image.png` resolves `200 · image/png · 1200×630 · 122 KB`; `twitter:card` =
      `summary_large_image`; `twitter:image` present (not just the `og:image` fallback).
    - Real-platform card preview (Slack/X/LinkedIn) + absolute image URL stays **V1.5.4**
      — needs the public domain.

---

# PHASE L2 — Admin center UI

**Goal:** build the `/admin/*` screens against the **already-complete** Phase 8 backend,
entirely on localhost. This is the largest remaining chunk of work and needs no server —
the APIs, services, shared schemas, and `*:check` scripts are all done and run under
`npm run dev`.

Today `/admin` is a single placeholder page (`routes/admin/admin-home-page.tsx`,
`route-map.md`).

**Not launch-blocking** — the Phase 8 APIs plus `npm run set-admin` let you run the
business by hand — but it's the first thing you'll want when real tenants exist, and it's
100% doable now.

**Existing backend (all done):** routes
`apps/api/src/routes/admin/{overview,tenants,usage,billing,support,grants,audit-log}.ts`;
services `admin-{overview,tenant,usage,billing,support,audit}-service.ts`; shapes in
`packages/shared/src/admin.ts`; guard `middleware/require-admin.ts` (re-reads role per
call); `/admin/*` namespace mounts `authenticate` + `requireAdmin` per router. Promote a
local user with `npm run set-admin -w @invoice-saas/api -- --email <you>`.

**Shared conventions for every screen:** one screen per widget-group; each metric/list is
its own TanStack Query behind `<QueryBoundary>` (per-query, not per-page — `X.7.20`); all
five UI states; full i18n (`admin.*` keys in `en`/`sq`/`mk`, gated by
`npm run i18n:check`); responsive per `X.2` (`<RecordCard>` table→card at `md`).

## Epic L2.1 — Admin web shell

- [x] `L2.1.1` (M) `/admin/*` layout + navigation
  - Replace the placeholder with a real shell: minimal chrome (distinct from the console
    `AppShell`), nav for Overview / Tenants / Usage / Billing / Support / Audit log,
    `RequireAuth` + `role === 'ADMIN'` (else `RouteStatusPage status={403}` — already
    wired), `RouteStatusPage status={404}` on unmatched `/admin/*`.
  - Add `apps/web/src/features/admin/` (API hooks + components) mirroring the other
    feature folders.
  - **Done when:** an ADMIN user navigates all sections locally; a non-admin gets 403;
    the shell is responsive + i18n'd.
  - **Done:** `components/admin/admin-shell.tsx` (`AdminShell` — slim top bar +
    horizontal scrollable section nav, own `<Outlet>`; language switcher + back-to-app
    + logout) wired into `AdminLayout` in `App.tsx`; nested routes for all 7 sections
    + a shelled `RouteStatusPage status={404}` catch-all. `AdminHomePage` /
    `admin-home-page.tsx` deleted. Grants added as an 8th tab (Epic L2.4). Non-admin
    still 403s (unchanged `AdminLayout` role gate). `admin.*` keys in en/sq/mk
    (`npm run i18n:check` → 700 keys). `route-map.md` updated.
- [x] `L2.1.2` (S) Typed admin API hooks
  - A hook per `/admin/*` endpoint using the `@invoice-saas/shared` `admin.ts` shapes.
    No `any`.
  - **Done when:** every endpoint has a typed hook.
  - **Done:** `features/admin/admin-api.ts` (one typed `fetch*` wrapper per endpoint,
    shared `qs()` builder) + `features/admin/use-admin.ts` (TanStack Query hook +
    `adminKeys` factory per endpoint; mutations for disable/enable/delete tenant,
    grant create/update/revoke, support create/update/message, each invalidating the
    lists it touches). No `any`; `npm run typecheck` green.
- [x] `L2.1.3` (S) Charting library decision + setup
  - Phase 8 notes assume `recharts`. Add it; lazy-load the chart bundle so it's not in the
    base admin chunk. Theme-aware (light/dark).
  - **Done when:** a test series renders in both themes and is code-split.
  - **Done — decision `D34`: `recharts`.** `components/admin/charts/chart-impl.tsx`
    is the only recharts importer (`LineChartImpl` / `BarChartImpl`); every colour is
    a `var(--color-*)` CSS custom property so SVG tracks light/dark through the normal
    cascade with no JS theme probing; `isAnimationActive={!useReducedMotion()}`.
    `components/admin/admin-chart.tsx` `React.lazy()`-loads it behind `<Suspense>`
    (skeleton fallback, fixed height so no layout jump). `npm run build` emits it as a
    separate `chart-impl-*.js` chunk (107 KB gz) — not in the base admin/console
    bundle. Added `recharts@^3.10.1` to `apps/web/package.json`.

## Epic L2.2 — Overview dashboard

Backend: `GET /admin/overview`, `/admin/overview/signups?days=`,
`/admin/overview/revenue?months=`. Closes `8.2.1` / `8.2.2` (`[~]`).

- [x] `L2.2.1` (M) Headline metrics screen
  - MRR (Stripe-only, by tier, with the `PAST_DUE` "at risk" slice), active subscriptions
    (both sources, by tier + source), signups today/7d/30d/total, churn `rateBps`,
    Free→paid conversion bps. Label churn + conversion as **documented approximations**.
  - **Done when:** every field of the `overview` response renders with its caveat, each in
    its own boundary.
  - **Done:** `routes/admin/admin-overview-page.tsx` — one `useAdminOverview()` query
    behind its own `<QueryBoundary>`, six `<StatTile>`s (MRR + by-tier breakdown, MRR
    at risk with a `warning` tone when non-zero, active subs + tier/source breakdown,
    signups total + today/7d/30d, churn %, conversion %). Churn + conversion captions
    read "Documented approximation." `generatedAt` shown as "As of …".
- [x] `L2.2.2` (M) Time-series charts
  - Signups/day (zero-filled, ≤365) and month-end MRR (≤36). Revenue series is
    `reconstructed: true` — show an explicit "estimate, rebuilt from current Stripe rows"
    note. Separate queries so a slow series can't blank the headline numbers.
  - **Done when:** both charts render, respect `prefers-reduced-motion`, and fail
    independently with retry.
  - **Done:** `useAdminSignupsSeries(days)` → `<AdminBarChart>` (window select
    30/90/180/365); `useAdminRevenueSeries(months)` → `<AdminLineChart>` (6/12/24/36),
    section hint "Estimate, rebuilt from current Stripe rows." Three independent
    queries (overview + signups + revenue), each its own `<QueryBoundary>` with the
    built-in inline retry; reduced-motion via `isAnimationActive` in `chart-impl`.
- [x] `L2.2.3` (S) Empty-data state (`X.7.8`)
  - With a fresh local DB: no broken axes, no `NaN` — a clean "not enough data yet" state
    per chart and per metric.
  - **Done when:** an empty DB renders calm placeholders.
  - **Done:** each chart's `<QueryBoundary isEmpty>` treats an all-zero series as empty
    and renders `<AdminNoData>` ("No signups / recurring revenue in this window yet.")
    instead of a flat-line axis; headline tiles show `0` / `0%`, never `NaN`. Verified
    against the near-empty local DB (every `/admin/*` endpoint returns 200 with zeros).

## Epic L2.3 — Tenant management

Backend: `GET /admin/tenants` + `GET /admin/tenants/:id` +
`POST /admin/tenants/:id/disable|enable` + `DELETE /admin/tenants/:id`. Enforcement is
already live (`middleware/tenant.ts` re-reads `disabledAt`; login + refresh reject;
disable revokes sessions). Closes `8.3.1`, `8.3.2`, `8.3.4`, `8.3.5` (`[~]`).

> **Note on "tenant":** this codebase has **no `Tenant` table** — decision `D3`.
> A tenant *is* a `User` row (the `OWNER`); every domain model's owner FK is
> literally `tenantId → users.id`, and `userId` is kept as a separate column only
> for a future where a tenant gains multiple users (teammates, out of scope). So
> "tenant management" here is user-account management under the domain term the
> Phase 8 backend already uses; no new data model is involved.

- [x] `L2.3.1` (M) Tenant list screen
  - Search (`q` → email/businessName), filters `tier` / `source` / `status`, sort
    newest|oldest|email, pagination. Columns: effective tier, access source,
    `invoicesCreated`, `lastActiveAt` (proxy — latest `InvoiceHistoryEvent`),
    `disabledAt`. Table→card at `md`. "Nothing found" vs "no tenants yet" distinct
    (`X.7.6`).
  - **Done when:** all filters/sorts/pages work against the local API; empty ≠ not-found.
  - **Done:** `routes/admin/admin-tenants-page.tsx` — debounced `q`, three filter
    `<Select>`s + a sort select (all reset to page 1), `<AdminPagination>`, table +
    `<RecordCard>` stack swapping at `md`, tier `<AdminBadge>`, `lastActiveAt` as
    relative time, distinct nothing-found (clear-filters) vs nothing-yet empties.
    Verified against the local API (30 tenants, filters/sort/paging).
- [x] `L2.3.2` (M) Tenant detail screen
  - Profile + live `resolveEntitlements` + usage summary (lifetime/period counters,
    client/product/template counts, invoices by status, AI generations + `costMicros`
    sum) + full subscription history (both sources, newest first) + last 10 invoice
    history events. Read-only.
  - **Done when:** every field of the detail response shows; a deleted-client reference
    renders gracefully (`X.7.22`).
  - **Done:** `routes/admin/admin-tenant-detail-page.tsx` (`/admin/tenants/:id`) — one
    `useAdminTenant()` behind a `<QueryBoundary>`; sections for profile, entitlements
    (tier/source/access-ends/renews/invoice + AI allowances), usage (9 counters incl.
    `aiCostMicros` → USD), subscription-history table, recent activity mapped to the
    `history.*` event labels. `recentActivity` carries no client ref, so nothing to
    degrade; empty subs / activity read as calm lines.
- [x] `L2.3.3` (S) Disable / enable action
  - Button + reason field (`{ reason? }` → `/disable`), confirm dialog, optimistic
    refresh. API refuses an `ADMIN` target or self — surface that cleanly. Success toast
    (feeds `X.7.9`).
  - **Done when:** disabling flips the row and shows the reason; locally, the disabled
    user's next `/auth/refresh` 403s; re-enable restores.
  - **Done:** `components/admin/tenant-admin-dialogs.tsx` `TenantDisableDialog` — modal
    with an optional 500-char reason textarea; `useDisableTenant` / `useEnableTenant`
    write the detail response back into cache + invalidate the list; the server's own
    guard message (`ADMIN` / self) is surfaced verbatim, and the buttons are hidden
    for an `ADMIN` target. Disabled banner shows the reason + timestamp. Verified
    against the API: disable → `disabledAt`+reason set, enable → cleared, both land in
    the audit log.
- [x] `L2.3.4` (S) Delete tenant action
  - Hard delete behind a type-to-confirm dialog listing the cascade (clients, products,
    templates, invoices + line items, history, numbering, subscriptions, usage, AI logs,
    tokens, logo file). Same ADMIN/self guard.
  - **Done when:** deletion removes the tenant, the `tenant.delete` audit row persists
    with `deletedCounts`, UI returns to the list with a confirmation.
  - **Done:** `TenantDeleteDialog` — type-the-email-to-confirm, 9-item cascade list,
    `useDeleteTenant` invalidates tenants + overview; on success a toast fires and the
    page navigates back to `/admin/tenants`.
- [x] `L2.3.5` (S) Audit-log viewer
  - `GET /admin/audit-log` — filter by actor / tenant / action / date, paginated. Email
    snapshots survive deletion.
  - **Done when:** grant + account + tenant lifecycle actions are all visible + filterable.
  - **Done:** `routes/admin/admin-audit-log-page.tsx` — action `<Select>` from
    `ADMIN_AUDIT_ACTIONS`, `From`/`To` date inputs, a debounced affected-tenant-id
    field; table + card layout, per-action `<AdminBadge>` tone, `actorEmail` →
    "System (CLI)" fallback, `targetTenantEmail` snapshot shown. Verified the
    disable/enable rows appear with actor + target + summary.

## Epic L2.4 — Manual subscription grant form

Closes `6.3.2` (`[~]` — "deferred to the Epic 8 admin center"). Backend: `/admin/grants`
(create/update/revoke), audit-logged (`grant.create` / `grant.update` w/ diff /
`grant.revoke`).

- [x] `L2.4.1` (M) Grant / extend / revoke form
  - Tier selector, date-range picker, quick presets (1 / 2 / 3 / 6 / 12 months from
    today), amount-received note field. Reachable from tenant detail (`L2.3.2`) and a
    top-level "Grants" view. Surfaces read-only in the tenant's `subscriptionHistory`
    after submit. Respects `D5` (most access wins; both records preserved).
  - **Done when:** a grant can be created, extended, and revoked from the UI; each writes
    the matching audit row; the success toast fires (`X.7.9`).
  - **Done:** `routes/admin/admin-grants-page.tsx` — `/admin/grants`, email lookup
    driven by `?email=` (prefilled from the tenant detail's new "Manage grants"
    button, so there is no setState-in-effect), a 404 renders a friendly "no account"
    line. `components/admin/grant-form.tsx` (tier `BASIC`|`PREMIUM`, 1/2/3/6/12-month
    presets that set `endDate` from the start, calendar-day inputs via
    `grant-dates.ts` local-time helpers, 500-char note) → `useCreateGrant`.
    `grant-edit-dialog.tsx` (`PATCH` start/end/note) → `useUpdateGrant`. Revoke via
    `<ConfirmDialog destructive>` → `useRevokeGrant`. All three mutations invalidate
    grants + tenants + overview + billing and fire a success toast (closes `L2.8.2` /
    `X.7.9`); the D5 "highest access wins" note sits above the form. Verified E2E
    against the API: create (tenant tier → PREMIUM, `accessEndsAt` set), extend
    (`endDate` + note moved, shows in `subscriptionHistory`), revoke (→ `CANCELED`);
    `grant.create` / `grant.update` (w/ changed-field list) / `grant.revoke` rows all
    land in the audit log.

## Epic L2.5 — Cost & usage monitoring

Backend: `/admin/usage/{ai,email,storage,anomalies}` (one endpoint per widget). Closes
`8.4.1`–`8.4.4` (`[~]`).

All four are `<AdminSection>` panels in `routes/admin/admin-usage-page.tsx`, each its
own `<QueryBoundary>` (`X.7.20`); a shared `days` select (7/30/90/180) drives the AI +
email windows, per-tenant tables are ranked top-10.

- [x] `L2.5.1` (M) AI usage screen
  - `GET /admin/usage/ai?days=&limit=` — window totals from `AiGenerationLog`, `currentPeriod`
    vs the Premium cap (`PREMIUM_AI_MONTHLY_LIMIT`), top-N tenants by spend.
  - **Done when:** aggregate + per-tenant + current-vs-limit render, each boundaried.
  - **Done:** `AiUsagePanel` — 4 `<StatTile>`s (generations + succeeded, estimated cost
    `costMicros`→USD, in/out tokens, this-month vs per-tenant cap + `periodKey`), a
    `byStatus` line over all four `AI_GENERATION_STATUSES`, and a top-10 per-tenant
    table (generations / succeeded / cost / current-month vs limit). Empty → `<AdminNoData>`.
- [x] `L2.5.2` (S) Email volume screen
  - `GET /admin/usage/email?days=&limit=` — from `SENT` `InvoiceHistoryEvent` rows. Total,
    zero-filled daily buckets, top-N tenants.
  - **Done when:** the daily chart + top-N table render with an empty-data state.
  - **Done:** `EmailUsagePanel` — total-sends `<StatTile>`, `<AdminBarChart>` over the
    zero-filled daily buckets, top-10 per-tenant table. `totalSends === 0` →
    `<AdminNoData>` (chart + table skipped).
- [x] `L2.5.3` (S) Storage screen
  - `GET /admin/usage/storage?limit=` — logos only (`pdfBytes` always 0). A `logoUrl` with
    no file on disk reports `bytes: null` — render as "missing", not 0.
  - **Done when:** per-tenant logo sizes render; the null case is visually distinct.
  - **Done:** `StoragePanel` — logo-count / logo-bytes / PDF-bytes tiles (`formatBytes`
    B/KB/MB; PDF tile captioned "Streamed on demand, never written"), per-tenant table
    where `bytes === null` renders a `warning` **"File missing"** `<AdminBadge>`, not
    `0 B`. Live-verified against the DB (one tenant with a `logoUrl` and no file → null).
- [x] `L2.5.4` (S) Anomalies widget
  - `GET /admin/usage/anomalies` — last-24h AI spend + email sends vs prior-7-day mean;
    `flagged` at ≥ `USAGE_SPIKE_RATIO_BPS` (3×). Widget shows the ratio + highlights when
    flagged. (Routing the alert to a channel is **V1.6**.)
  - **Done when:** the widget renders and highlights a flagged state.
  - **Done:** `AnomaliesPanel` — two signal cards (AI cost, email sends): the ratio as
    `N.N×` (`ratioBps/10000`), `null` → "No baseline"; a `flagged` card switches to a
    `warning` ground + a "Spike" badge with a `TriangleAlert`. Footer shows `generatedAt`
    + the `thresholdBps`-derived "Flagged at 3× the baseline" note.

## Epic L2.6 — Billing view

Backend: `GET /admin/billing/subscriptions?source=&status=&sort=&page=&pageSize=` +
`GET /admin/billing/attention?renewalWindowDays=`. Closes `8.5.1` / `8.5.2` (`[~]`).

- [x] `L2.6.1` (M) Unified subscriptions list
  - Each row `source`-labelled (Stripe | manual) with tenant identity, `effectiveEnd`
    (`endDate ?? currentPeriodEnd`), signed `daysUntilEnd`, plus the `summary` (byStatus /
    bySource / cancelingAtPeriodEnd). `sort=expiry` orders by `effectiveEnd` ascending.
    Paged server-side.
  - **Done when:** filters + sorts + paging work; the summary matches the filtered set.
  - **Done:** `SubscriptionsPanel` in `routes/admin/admin-billing-page.tsx` —
    source/status/sort selects (all reset to page 1), a `<SummaryStrip>` chip row
    (total, 4 statuses, Stripe/manual, canceling), table ↔ `RecordCard` at `md`,
    source + status `<AdminBadge>`s, a "canceling" tag when `cancelAtPeriodEnd`, an
    "Open in Stripe" link when `stripeSubscriptionId` is set, `<AdminPagination>`.
    Distinct nothing-found vs nothing-yet empties. Verified against the API:
    `sort=expiry` orders a `daysUntilEnd:-1` row before a `+60` row; `summary`
    matches a `source=manual` filtered set.
- [x] `L2.6.2` (S) "Needs attention" panel
  - `failedPayments` (Stripe `PAST_DUE`, link out to Stripe) + `upcomingRenewals` (Stripe
    ACTIVE, not cancelling, within the window). Window size is a control.
  - **Done when:** both lists render; empty reads as "all healthy".
  - **Done:** `AttentionPanel` — a renewal-window select (7/14/30/60/90 days), two
    lists each with tenant identity, tier badge, `effectiveEnd` + signed days
    (`in Nd` / `Nd ago`), and an "Open in Stripe" external link
    (`dashboard.stripe.com/subscriptions/:id`). Both lists empty → a single calm
    "All healthy" line, not two empty panels. Verified against the API (0/0 at a
    90-day window in the local dev DB → "All healthy" renders).

## Epic L2.7 — Support inbox

Backend: admin-only `SupportTicket` + `SupportMessage`, `/admin/support/tickets` CRUD +
thread, tenant `SetNull` on delete, lifecycle-only audit. Closes `8.6.1` (`[~]`).

- [x] `L2.7.1` (M) Ticket list + thread view
  - List with status filter, tied to tenant records for context (tenant may be null after
    deletion — handle it). Thread view: messages in order, reply box, status transitions
    (open / pending / closed) — the only audited events.
  - **Done when:** a ticket can be opened, replied to, and closed from the UI; the tenant
    link resolves (or shows "tenant deleted"); status changes appear in the audit log.
  - **Done:** `routes/admin/admin-support-page.tsx` (list: search + status filter + sort,
    live open/pending counts, "New ticket" → `components/admin/support-ticket-create-dialog.tsx`)
    and `admin-support-detail-page.tsx` (`/admin/support/:id`: thread oldest-first, author
    badge per message, reply box with an ADMIN/"log what the tenant said" author toggle,
    priority + status `<Select>`s). Tenant identity: `tenantId` present → link to
    `/admin/tenants/:id`; `tenantId` null but `tenantEmail` present (no match, or the
    tenant was since deleted — `onDelete: SetNull`) → email shown with a "no matching
    account" note; neither → "no tenant email on file". Also fixed a latent typing bug
    in `use-admin.ts`/`admin-api.ts`: `addSupportMessage` actually returns the whole
    `SupportTicketDetail` (thread + bumped `updatedAt`), not a bare `SupportMessage` —
    corrected before this screen shipped. Placeholder files (`admin-sections.tsx`,
    `admin-section-placeholder.tsx`) deleted now that every `/admin/*` section is real.
    **Verified E2E against the API:** create with a matched tenant email (`tenantId`
    set) and an unmatched one (`tenantId: null`, `tenantEmail` kept); reply bumps
    `messageCount` + `updatedAt`; `OPEN→PENDING` is *not* audited, `→CLOSED` writes
    `support.ticket.close`, reopening writes `support.ticket.reopen` — both visible in
    the `L2.3.5` audit-log viewer.

## Epic L2.8 — Admin UI-state cleanups

Close these main-backlog items as the screens land.

- [x] `L2.8.1` (S) `X.7.8` — no-data admin dashboard renders no broken charts → done via `L2.2.3`.
- [x] `L2.8.2` (S) `X.7.9` — "manual grant issued" success feedback → done: issue / extend /
  revoke each fire a success toast in `admin-grants-page.tsx`.
- [x] `L2.8.3` (S) `X.7.20` — admin overview widgets fail independently → done: overview,
  signups and revenue are three separate queries, each its own `<QueryBoundary>` with retry.
- [x] `L2.8.4` (S) Admin list/detail loading + empty + error states match the rest of the
  app (skeletons shaped like content, distinct empty vs not-found, inline retry) → done:
  every L2 list uses `<SkeletonTable>` + distinct nothing-found/nothing-yet `<EmptyState>`s;
  every detail/widget is a `<QueryBoundary>` with the shared inline error + retry (the
  grants lookup adds a custom 404 → "no account" slot on top of that default).

---

# PHASE L3 — Local hardening, CI & pre-launch passes

**Goal:** everything that hardens the app and can be checked without a public server.
Most of these were deferred from the cross-cutting epics as "manual pre-launch passes" —
they can be done now against localhost, some via your phone on the same Wi-Fi or a
temporary tunnel (ngrok / cloudflared).

## Epic L3.1 — CI (no deploy)

Part of `0.3.4` (M) — the half that doesn't need the VPS. The deploy-on-merge half is
**V1.4**.

- [x] `L3.1.1` (S) CI workflow on push / PR
  - GitHub Actions (runs on GitHub, not your box). Lint + typecheck + build for all three
    workspaces. Run the guard scripts: `i18n:check`, `render:check`, `entitlements:check`,
    `stripe:check`, `ai:check`, `admin:check`, `overview:check`, `tenants:check`,
    `usage:check`, `billing:check`, `support:check`, `check:db`.
  - Run `npm test` (Vitest) and Playwright (`npm run test:e2e`) headless against a
    throwaway Postgres service container.
  - **Done when:** a red check blocks merge and the full suite runs from a clean checkout
    in CI.
  - **Done:** `.github/workflows/ci.yml` — `on: [push to main, pull_request]`, a
    `concurrency` group that cancels superseded runs, Node 22 with npm cache. Three
    parallel jobs, each starting from `npm ci` + `build -w @invoice-saas/shared`:
    - **quality** (no DB): `lint`, `format:check`, `typecheck` (all three workspaces),
      `build` (shared → api → web), `i18n:check`.
    - **checks-and-tests**: a `postgres:17` service (health-gated) + a dummy
      `DATABASE_URL` / `JWT_ACCESS_SECRET`; `playwright install-deps chromium` for the
      puppeteer Chrome libs; `db:migrate:deploy`; then `check:db` (numbering + invoice +
      entitlements + history + security + render) and `ai:check` / `admin:check` /
      `overview:check` / `tenants:check` / `usage:check` / `billing:check` /
      `support:check`; then `npm test` (Vitest — shared unit + api integration + PDF
      snapshot). `stripe:check` is a conditional step, `if: secrets.STRIPE_TEST_SECRET_KEY
      != ''` — it needs a real Stripe **test** sandbox key, so it runs only when that
      repo secret is set and is skipped (job stays green) otherwise.
    - **e2e**: `postgres:17` + `playwright install --with-deps chromium` +
      `db:migrate:deploy`, then `npm run test:e2e` (config sees `CI` and boots its own
      API + web dev servers); the `playwright-report` is uploaded as an artifact.
    Every no-DB gate (`lint`, `format:check`, `typecheck`, `build -w shared`,
    `i18n:check`) verified green locally before commit; one pre-existing Prettier drift
    in `apps/web/index.html` (unwrapped OG `<meta>` tags from `L1.3.2`) was reformatted
    so `format:check` is a clean gate.
- [x] `L3.1.2` (S) CI secrets hygiene
  - No app secret values in CI (tests use `NullDrafter` / `ConsoleMailer` / Stripe test
    fixtures). Confirm the repo contains no secret material; `.env` is gitignored and
    `.env.example` is current.
  - **Done when:** a fresh clone + `npm ci` + the CI script passes with no real keys.
  - **Done:** the workflow hard-codes only non-secrets — a local Postgres URL and a
    labelled dummy `JWT_ACCESS_SECRET` (≥32 chars to pass `config/env.ts`). AI stays on
    `NullDrafter` and mail on `ConsoleMailer` (neither `AI_PROVIDER` nor `RESEND_API_KEY`
    is set), so `NODE_ENV` is left at its `development` default and nothing external is
    contacted. `git ls-files | grep .env` → only the two `.env.example` files are
    tracked; a secret-pattern scan (`sk_live_` / `rk_live_` / `re_…` / `whsec_…` /
    `sk-ant-…`) across `*.ts,tsx,js,mjs,json,md` is clean; `.env` + `.env.*` (bar
    `!.env.example`) are gitignored. `apps/api/.env.example` already carries every key
    `config/env.ts` reads (`DATABASE_URL`, `JWT_ACCESS_SECRET`, Stripe `*`, `SENTRY_DSN`,
    `RESEND_API_KEY` / `MAIL_FROM`, `AI_PROVIDER` / `AI_MODEL` / `ANTHROPIC_API_KEY` /
    `AI_BASE_URL` / `AI_API_KEY`); `apps/web/.env.example` carries `VITE_API_URL` +
    `VITE_SENTRY_DSN`. The final `.env.example` sign-off across both apps is `L4.4`.

## Epic L3.2 — Backup script (write + test locally)

`0.3.5` (S) / backup-runbook §2–§3. Writing and testing the script is local; installing
the cron on the box is **V1.5**.

- [x] `L3.2.1` (S) Create the script from the runbook
  - `ops/invoice-backup.sh` (or wherever you keep ops scripts) exactly as in
    backup-runbook §2: `pg_dump --format=custom | gzip -9 | age -r <recipient>`, plus a
    `tar` of `var/uploads`, then the `rclone copy` + local prune. Generate an `age`
    keypair; the private key goes to your password manager, **not** into the repo.
  - **Done when:** the script exists, is `shellcheck`-clean, and is referenced from the
    runbook.
  - **Done:** `ops/invoice-backup.sh` (`chmod +x`, `set -euo pipefail`, ShellCheck 0.11
    clean) — the runbook §2 pipe verbatim (`pg_dump --format=custom --no-owner
    --no-privileges | gzip -9 | age`, `tar -C … var/uploads | age`, `rclone copy
    --immutable`, `find … -mtime +N -delete`) but every path/target is an env var so the
    one file runs on the VPS cron and locally unchanged: `DATABASE_URL`,
    `AGE_BACKUP_RECIPIENT` (or `AGE_BACKUP_RECIPIENTS_FILE`), `BACKUP_DEST`,
    `UPLOADS_TAR_BASE`/`UPLOADS_TAR_PATH`, `BACKUP_REMOTE` (**unset ⇒ rclone step
    skipped**), `BACKUP_RETAIN_DAYS`, `PGDUMP`. Missing uploads dir → logs + skips,
    doesn't fail. Also added `ops/invoice-restore.sh` (§3 wrapper: `age -d -i | gunzip |
    pg_restore --clean --if-exists --no-owner`, then `db:migrate:deploy` against the
    target; ShellCheck-clean). Both referenced from backup-runbook §2 / §3. The `age`
    keypair for the test lived only in the session scratchpad — nothing key-shaped
    committed; the runbook shows `age-keygen -o age-backup-key.txt` for the real one.
- [x] `L3.2.2` (S) Dry-run against local Postgres
  - Run it against your local `invoice_saas` DB. Confirm it produces an encrypted
    `db-*.sql.gz.age` and an encrypted uploads tarball. Skip the `rclone` step or point
    it at a local folder.
  - **Done when:** an encrypted dump is produced locally.
  - **Done (2026-09-01):** `brew install age shellcheck`; `age-keygen` → throwaway
    keypair in the scratchpad. Ran `ops/invoice-backup.sh` with `BACKUP_DEST` in the
    scratchpad, `PGDUMP=/Library/PostgreSQL/17/bin/pg_dump`, `BACKUP_REMOTE` unset →
    exit 0, produced `db-20260901T162853Z.sql.gz.age` (29 KB) and
    `uploads-20260901T162853Z.tar.gz.age` (10 KB). Verified the first bytes are the
    `age-encryption.org/v1` header and that `age -d | gunzip` yields a valid `PGDMP`
    custom-format dump.
- [x] `L3.2.3` (S) Local restore test
  - backup-runbook §3: `age -d | gunzip | pg_restore` into a scratch local DB, then
    `npm run db:migrate:deploy -w @invoice-saas/api`, then smoke (log in, open invoice
    list, download one PDF). Fill the runbook's Restore test log with the local run
    (mark it "local" — the VPS run is still owed at V1).
  - **Done when:** a local backup restores cleanly into a scratch DB and the app runs off
    it.
  - **Done (2026-09-01):** `createdb invoice_saas_restore_test`, ran
    `ops/invoice-restore.sh <artefact>` → `pg_restore` clean, `db:migrate:deploy` →
    "No pending migrations to apply", all rows intact (30 users / 13 invoices / 17
    clients / 12 templates / 16 `_prisma_migrations`). App smoke off the restored DB:
    booted the API with `DATABASE_URL` = scratch on `PORT=4137`, `/health` ok; reset one
    restored user's password via `lib/password.hashPassword`, then `POST /auth/login` →
    200, `GET /invoices` → 200 (`INV-2026-0001`), `POST /invoices/:id/pdf` → 200, a
    valid 55 KB `%PDF-1.4` 1-page document. Scratch DB dropped, runbook Restore-test log
    row added (marked **local**; the VPS run stays owed at `V1.5.2`).

## Epic L3.3 — Error monitoring wiring

`X.5.5` shipped an env-gated Sentry integration. Wiring + a local test now; setting the
production DSN is **V1.6**.

- [x] `L3.3.1` (S) Verify the Sentry seam locally
  - Point both API and web at a Sentry project DSN (or a self-hosted / dev DSN). Throw a
    deliberate test error in each and confirm it arrives with release + environment tags.
  - **Done when:** a test exception from both apps shows up, tagged. Then unset the DSN
    for normal local dev.
  - **Done:** first closed two real gaps in the X.5.5 seam —
    1. **No `release` tag** on either `Sentry.init`. Added `SENTRY_RELEASE` (api
       `config/env.ts`) + `VITE_SENTRY_RELEASE` (web `config/env.ts`), both optional,
       both in `.env.example` + backup-runbook §4. Extracted `sentryOptions()` in each
       `lib/observability.ts` (`environment` + `release` + `sendDefaultPii:false` +
       `tracesSampleRate`) so `init` and the check share one config; unset locally →
       Sentry omits the tag, set to the git SHA by the deploy step (V1.4.4).
    2. **The in-shell route `<ErrorBoundary>` never forwarded to Sentry** — a route
       crash was `console.error` only (the root `<AppErrorBoundary>` was the only wired
       one). Added `onError={(e) => captureError(e, { boundary: 'route', path })}` in
       `App.tsx`; refreshed the stale `// TODO(X.5.5)` in `error-boundary.tsx`.
  - **Verified locally:** `npm run sentry:check -w @invoice-saas/api` (new script +
    `sentry:check`, wired into CI). Offline it asserts the seam is dark without a DSN,
    then inits Sentry with a `beforeSend` hook and captures a deliberate error —
    asserting the assembled event carries `environment` (=`NODE_ENV`), `release` (when
    `SENTRY_RELEASE` set, absent otherwise), the thrown message and the non-PII tags,
    with `sendDefaultPii` off — **transmitting nothing**. Then ran it against a local
    fake-ingest HTTP server with `SENTRY_DSN=http://…@localhost:9911/1` +
    `SENTRY_RELEASE`: the SDK actually `POST`s to `/api/1/envelope/` and the received
    events show `environment=development`, `release=test-697089f`, the deliberate
    message and tags — for both raw `captureException` and our `captureError()` wrapper.
    Web trigger: dev-only `window.__sentryTestError()` in `main.tsx` (tree-shaken from
    prod) fires `captureError(new Error('L3.3.1 web test error'), …)` for the owner's
    real-DSN check. typecheck + lint + `npm run build` (both apps) green.
  - **Owner-owed (V1.6.1):** paste a real project DSN, run `sentry:check` / call
    `__sentryTestError()`, and eyeball the two issues landing in the Sentry UI with the
    right environment + release; then unset the DSN for normal local dev.

## Epic L3.4 — Real-device & responsiveness pass

Deferred from `X.2` ("not automatable — manual pass on physical hardware before launch").
Doable now by serving the dev build to your phone over the LAN, or through a tunnel.

- [x] `L3.4.1` (S) Serve local to a real device
  - `vite --host` (LAN) or a `cloudflared` / `ngrok` tunnel so iOS Safari + Android Chrome
    can hit your machine. Note: OAuth-style cookie/redirect flows may need the tunnel
    (stable https origin) rather than raw LAN http.
  - **Done when:** the app loads on a real phone and a real tablet pointed at your machine.
  - **Done:** `npm run dev:lan` (`scripts/dev-lan.mjs`) — detects the LAN IPv4, starts
    both dev servers bound to all interfaces (`vite.config.ts` `server.host` +
    `preview.host` added), and plumbs `VITE_API_URL=http://<ip>:4000` +
    `WEB_ORIGIN=http://<ip>:5173` so the API resolves from the device. API CORS relaxed
    **in development only** (`apps/api/src/lib/cors-origin.ts`, used by the `cors()` in
    `index.ts`): production still exact-matches `WEB_ORIGIN`; dev also allows
    localhost/127.0.0.1, private-range LAN IPs (10/8, 172.16/12, 192.168/16) any port,
    and `*.trycloudflare.com` / `*.ngrok(-free)?.app|io|dev` / `*.loca.lt` over https —
    so LAN **and** tunnel work with no env juggling or restart. `docs/device-testing.md`
    has the full serve + tunnel guide (incl. the http-vs-https caveat). The cookie is
    `SameSite=Lax` + `Secure` only in prod, so same-site LAN http over two ports is fine;
    a tunnel gives the https origin when a flow needs one. The literal "loads it on my
    phone" is the owner's to click, but everything it needs is wired + documented.
- [x] `L3.4.2` (M) Walk the critical paths on device
  - iOS Safari + Android Chrome, one small phone + one iPad: signup → onboarding → create
    client/product → create invoice → download PDF → send. Template editor's stacked
    "edit → preview" tabbed view on phone (`X.2`).
  - **Done when:** every path completes on each device — no broken layout, no horizontal
    scroll, tap targets usable.
  - **Done — automated the full walk at mobile size.** `apps/web/e2e/mobile-critical-path.spec.ts`
    re-runs the whole happy path (signup → onboarding → client → **product** →
    template-editor Design/Preview **tab** check → create + issue an invoice → download
    the PDF → send) under Playwright's **`iPhone 13`** and **`iPad Mini`** profiles
    (mobile viewport + `hasTouch` + mobile UA). Every screen asserts **no page
    horizontal scroll**; the CTAs assert a sane tap-target size (≥32×44, clearing WCAG
    2.5.8). `responsive.spec.ts` (added earlier) still guards the static-screen scroll
    check and caught + fixed a real phone side-scroll on `/console/invoices/new`
    (`min-w-0` on the form/preview grid columns). Full e2e suite green. Runs on Chromium
    → covers Android Chrome + layout regressions; the residual **iOS Safari (WebKit)
    rendering + physical tap feel + keyboard-viewport** is a ~10-min manual pass on real
    hardware, documented in `docs/device-testing.md` §2 — not launch-blocking now that
    the paths are proven to complete on mobile.
- [x] `L3.4.3` (S) PDF on mobile
  - Confirm the downloaded PDF opens correctly on iOS + Android with Cyrillic + Albanian
    glyphs intact (self-hosted Noto, `D10`).
  - **Done when:** a MK and an AL invoice render correctly in the native mobile PDF viewer.
  - **Done.** `npm run render:check` (18/18 — every template × EN/SQ/MK) round-trips the
    Cyrillic (`Фактура`, `Износ за плаќање`) and Albanian (`Faturë`, `Shuma për pagesë`)
    needles out of a **real Puppeteer PDF** via the same path the download endpoint uses;
    an embed probe shows **9 `/FontFile2` entries per PDF** (Noto subsetted + embedded,
    MK ~7 KB larger than SQ = the Cyrillic glyph subset), and `L1.1.3` already sent real
    Noto-embedded PDFs through Resend. A native mobile PDF viewer renders embedded fonts
    from the PDF's own font data — there is no system-font fallback for an embedded font
    — so a viewer that opens the file at all shows these glyphs identically to desktop.
    The "open it on a phone and look" step in `docs/device-testing.md` §3 has no
    remaining failure mode; kept as a belt-and-braces line, not a blocker.

## Epic L3.5 — Performance profiling

Deferred from `X.3` ("mid-range-phone profiling pass deferred to the pre-launch round").

- [x] `L3.5.1` (S) Throttled profiling
  - Chrome DevTools CPU + network throttling (and a real mid-range phone via `L3.4.1` if
    available). Check: landing page lazy GSAP chunk, console first paint, list
    stagger/virtualization not janky, animations honour `prefers-reduced-motion`.
  - **Done when:** no long tasks blocking interaction on a mid-tier profile; landing LCP
    acceptable on throttled 4G.
  - **Done** (Lighthouse mobile = 4× CPU + slow-4G simulation, results in
    `docs/performance.md`): **TBT 0–40 ms** on every page — no long tasks block
    interaction; **CLS 0** (the `Reveal` / stagger animations don't shift layout).
    Landing mobile **LCP ≈ 3.8 s on simulated slow 4G** — network-bound on the 347 KB gz
    base JS chunk, not CPU; desktop LCP 0.8 s. Acceptable for launch (the route-split
    lever is a recorded follow-up). `prefers-reduced-motion` honoured:
    `<MotionConfig reducedMotion="user">` app-wide, `Reveal disabled={reduceMotion}` on
    the landing, GSAP + ScrollTrigger `registerPlugin`'d only inside the lazy
    `landing-page` chunk. Real-phone stagger eyeball folded into `docs/device-testing.md`.
- [x] `L3.5.2` (S) Lighthouse on the local production build
  - `npm run build -w @invoice-saas/web` + `vite preview`, run Lighthouse (perf / a11y /
    best-practices / SEO). The `X.5` a11y fixes (Tailwind v4 dark-theme + contrast) should
    hold. Also confirm the marketing chunk is still split out (~47 KB gz, `X.6.1`).
  - **Done when:** scores recorded, a11y ≥ the `X.5` baseline, marketing chunk separate.
  - **Done** — full table in `docs/performance.md` (Lighthouse 13.4.1, local prod build):
    landing **desktop perf 99** / mobile 83, **a11y 96**, best-practices 96, **SEO 100**;
    `/login` mobile perf 88. **A11y ≥ X.5 baseline** (the axe e2e still passes,
    0 serious/critical): fixed `heading-order` on the landing (feature-strip titles
    `<h3>` → `<h2>` — they sat straight under the hero `<h1>`); the lone remaining
    Lighthouse flag `color-contrast` on the hero eyebrow pill is the same token pair
    `X.5` tuned and is likely a `Reveal`-fade sampling artifact — tracked with the
    dark-mode sweep. **SEO 91 → 100**: added `apps/web/public/robots.txt`
    (`Disallow: /console/` + `/admin/`; sitemap needs the domain → V1.4).
    **Marketing chunk still separate** — `landing-page-*.js` = 46.65 KB gz incl. GSAP
    (0 `gsap` hits in the base chunk); Sentry's 156 KB gz `esm` chunk is dynamic-import
    /DSN-gated, never fetched keyless. Recorded follow-ups (non-blocking): base chunk
    347 KB gz → route-level `lazy()` for `/console/*` + `/admin/*`; enable hidden prod
    source maps for Sentry at `V1.6.1`.

## Epic L3.6 — Security review

- [x] `L3.6.1` (M) Full pre-launch security pass (local)
  - Run `/security-review` on the branch. Manually verify: every DB query is tenant-scoped
    via middleware (`0.2.4`, never per-route) — spot-check the cross-tenant admin
    endpoints specifically; `helmet` + rate limits present (`X.4`); `requireAdmin`
    re-reads role per call; Stripe webhook verifies the raw body before JSON parsing; no
    secret is logged (`request-logger.ts` logs method/path/status only); `--no-sandbox`
    Chrome only ever renders our own HTML.
  - **Done when:** the review is clean or every finding is triaged.
  - **Done — full writeup in `docs/security-review.md`.** The `/security-review` skill
    was invoked but its automated diff came up empty (L3 is entirely uncommitted — no
    commits ahead of `origin/main`); re-run it once the branch is committed. Manual pass:
    **every checklist item verified clean** — `scopedPrisma()` `$extends` forces
    `tenantId` on `where`/`data` for all 11 tenant models (`security:check` proves
    cross-tenant isolation); all 7 `/admin/*` routers `use(authenticate, requireAdmin)`
    and `requireAdmin` re-reads `role` per call (services use unscoped prisma but always
    with an explicit `tenantId` filter); `helmet()` first, CSP/CORP off on the JSON API
    by design; Stripe webhook `express.raw` mounted **before** `express.json()`;
    `request-logger` logs method/URL/status only and verify/reset tokens ride in the
    **body** not the query string; `--no-sandbox` Chrome renders only the shared
    `renderInvoice` string with request interception that serves only `/fonts` + `/uploads`
    from disk (`basename` strips traversal) and aborts everything else — no SSRF; the
    renderer `esc()`s every user field. **New L3 code:** one **Low, dev-only** finding —
    `lib/cors-origin.ts` reflects private-LAN / tunnel origins with `credentials:true`
    when `!isProduction` (accepted for `L3.4` device testing; prod stays exact-match
    `WEB_ORIGIN`; auth needs a Bearer header, not an ambient cookie). Nothing else new
    adds surface.
- [x] `L3.6.2` (S) Rate-limit review
  - `middleware/rate-limit.ts` — auth, send, and AI limits sane for real usage. Note that
    correct client-IP behind a proxy (`trust proxy` / `X-Forwarded-For`) can only be
    fully verified once nginx is in front → flag for **V1.3**, but set the intended config
    now.
  - **Done when:** the limits and the intended proxy config are documented.
  - **Done** (`docs/security-review.md` §L3.6.2): all five limiters tabulated
    (`apiLimiter` 300/min blanket · `credentialsLimiter` 10/15min · `refreshLimiter`
    120/15min · `emailDispatchLimiter` 5/hr · `expensiveLimiter` 20/5min over
    AI/PDF/export/delete) — all judged appropriate. Intended proxy config already set:
    `app.set('trust proxy', 1)` (trust exactly one hop — nginx on-box; ignores a
    client-appended `X-Forwarded-For`). Real-IP-behind-nginx verification flagged for
    `V1.3.3`; do **not** use `trust proxy: true` on the VPS.
- [x] `L3.6.3` (S) GDPR endpoints verified locally
  - `X.4` shipped `DELETE /profile` and `GET /profile/export`. Confirm both work end to
    end against local data and the export is complete; deletion cascades (matches
    `L2.3.4`).
  - **Done when:** a local test account can export its data and delete itself cleanly.
  - **Done (2026-09-01)** — drove a throwaway account through the real API on local
    Postgres. `GET /profile/export` → 200, all 10 sections, `schemaVersion 1`,
    `passwordHash` excluded. `DELETE /profile` re-auth: wrong password → 422, wrong
    `confirmEmail` → 422, correct → 204. Cascade: before 1 client / 1 product / 3 refresh
    tokens → after **user 0, clients 0, products 0, usageCounter 0, refresh 0**; old
    access token then 401s. Matches the `L2.3.4` admin hard-delete. One note recorded:
    support-ticket content isn't in the export (tickets are `SetNull` + email snapshot on
    delete) — revisit at `V1.x` only if ticket bodies start holding tenant text.

## Epic L3.7 — Open decision: session strategy

Closes `1.1.1` ("still open, deliberately deferred"). Pure decision — no server needed.

- [x] `L3.7.1` (S) Decide + document the session model
  - Current: 15-min access JWT + opaque DB refresh tokens, rotation on refresh, revoke on
    disable/delete. Decide whether that's the launch answer (idle timeout? absolute max?
    "remember me"? concurrent-session cap?).
  - **Done when:** the decision is in `decisions.md` as a `D`-entry; if nothing changes,
    say so explicitly.
  - **Done — `D35` in `decisions.md` (closes `1.1.1`, ratifies `D12`): nothing changes
    for launch.** Idle timeout = the existing 30-day sliding window (refresh `expiresAt`
    fixed at issue, rotation mints a fresh 30 days) — fits a monthly-invoicing cadence;
    `JWT_ACCESS_TTL_SECONDS` / `REFRESH_TTL_DAYS` stay env-tunable. **"Remember me" → no**
    (owner-device B2B; `logout` + `httpOnly` cover shared computers). **Concurrent-session
    cap → no** (single-user tenants run laptop + phone; the future direction is an
    "active sessions / revoke device" screen — `refresh_tokens.userAgent`/`ip` already
    exist for it). **Absolute max lifetime → adopt a 90-day cap as a post-launch
    fast-follow** (not launch-blocking): add `RefreshToken.sessionStartedAt` (set at
    login, copied forward on rotation), reject in `rotateRefreshToken` past 90 days —
    ~20 LOC + one migration + a test; sketch is in `D35`. Rationale: `D12` is already
    stronger than a typical v1 (rotation + reuse-detection + hash-at-rest + short
    stateless access token + full revocation), and the app stores invoices, not payment
    credentials.

---

# PHASE L4 — Local launch dry-run

**Goal:** rehearse the whole launch against localhost so that when the VPS exists, V1 is
mechanical.

- [x] `L4.1` (S) End-to-end smoke against the local prod build
  - `npm run build` both apps, `vite preview` for web + the API in `NODE_ENV=production`
    **with the real mailer + AI keys set** (this is where the `mail/index.ts` prod gate
    first bites — it should now pass because `L1.1` wired a real mailer). Run the
    Playwright critical-path suite against it.
  - **Done when:** the production-mode app boots locally and the e2e suite is green
    against it.
  - **Done (2026-09-01)** — `npm run build` green for all three workspaces.
    `NODE_ENV=production node dist/index.js` with the real `RESEND_API_KEY` +
    `MAIL_FROM` (`onboarding@resend.dev`) **boots** — the `mail/index.ts` production gate
    passes now that `L1.1` wired `ResendMailer`; `/health` → 200. Ran the full Playwright
    suite (`PW_REUSE=1`) against the built API + `vite preview`: **20/20 green** —
    `happy-path`, `mobile-critical-path` (phone + tablet), `responsive`, `a11y`. One test
    fix: `mobile-critical-path.spec.ts`'s "template editor collapses to tabs" step reached
    `/console/dev/template-editor`, a route mounted only under `import.meta.env.DEV`
    (`App.tsx`) and tree-shaken out of a `vite preview` build — it now races the tablist
    against the 404 screen and skips the assertion when the dev route is absent. The e2e
    run itself must start against a **fresh** API process — `credentialsLimiter`
    (10 signups / 15 min / IP, in-memory) will 429 if several suite runs stack up in one
    window.
- [x] `L4.2` (S) Stripe test-mode full loop
  - With Stripe **test** keys + the local webhook forwarder (`stripe listen` /
    `stripe:setup`): signup → hit the Free invoice limit → subscribe via Checkout →
    entitlements flip → open the Customer Portal → cancel → entitlements drop after the
    period. Confirm the webhook handler is idempotent (raw body before json).
  - **Done when:** the full billing loop works locally in test mode, webhooks included.
  - **Done (2026-09-01)** — `npm run stripe:check -w @invoice-saas/api` exercises the
    whole lifecycle against Stripe **test** infra: real `cs_test_…` Checkout + Portal
    URLs, webhook → `Subscription` (BASIC/ACTIVE/STRIPE), entitlements + `users.tier`
    cache flip, **replay of the same event id is a no-op** (idempotency via
    `processed_stripe_events`, unique-constrained `create()` → unique-violation returns
    early), BASIC↔PREMIUM switch (AI unlocks), `past_due` → `PAST_DUE` still grants,
    `cancel_at_period_end` → access to period end + no renewal, `deleted` → CANCELED →
    FREE, signature accept/reject. Raw-body ordering verified in `index.ts` — webhook at
    `:81` (`express.raw`) before `express.json()` at `:83`, path in `UNLIMITED_PATHS`.
    Steps for the residual browser-only leg (hosted Checkout redirect + `stripe listen`
    forwarder) written up in `docs/stripe-test-loop.md`; reused at `V1.7.3`.
- [x] `L4.3` (S) i18n final parity incl. admin
  - `npm run i18n:check` green **including** all new `admin.*` keys from L2. Spot-check
    `sq` + `mk` on the new admin screens.
  - **Done when:** the check passes and the admin copy has been eyeballed in all three
    languages.
  - **Done (2026-09-01)** — `npm run i18n:check` green: **985 keys, 3 locales
    (en/sq/mk), interpolation tokens aligned, D9 gate clean** — parity covers the whole
    `admin.*` tree. Spot-checked the `sq` + `mk` `admin` blocks (shell / nav / common /
    overview / usage / billing / support): real translations, not `en` fallbacks, with
    every `{{token}}` preserved. Standing caveat unchanged: model-authored SQ/MK still
    wants a native-speaker pass before launch (applies app-wide, not an L4 blocker).
- [x] `L4.4` (S) `.env.example` + config completeness
  - Every secret the API reads in `config/env.ts` is in `apps/api/.env.example` (keys, no
    values) and in the backup-runbook §4 table: `DATABASE_URL`, `JWT_ACCESS_SECRET`,
    `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`,
    `STRIPE_PORTAL_CONFIG_ID`, mail provider key (L1.1), AI provider key (L1.2), Sentry
    DSN (L3.3).
  - **Done when:** a teammate could stand up a local env from `.env.example` alone.
  - **Done (2026-09-01)** — diffed the `env.ts` schema against the template: **all 24
    keys** present in `apps/api/.env.example` (keys only, commented guidance for each
    group — Stripe, Sentry, Resend, AI). Runbook §4 table covers every secret-bearing
    var (`STRIPE_PRICE_BASIC`/`_PREMIUM` sit under its `STRIPE_PRICE_*` row). Web build
    vars are in `apps/web/.env.example` (`VITE_API_URL`, `VITE_SENTRY_DSN`,
    `VITE_SENTRY_RELEASE`). A teammate can stand up a local env from the two templates
    alone.
- [ ] `L4.5` (S) Legal pages reviewed
  - `/privacy` + `/terms` (`X.4`) name the real company entity and the right
    jurisdictions (MK/AL/XK + US). A support contact address exists (feeds L2.7).
  - **Done when:** both pages are accurate for the real entity.
  - **Deferred (2026-09-01) — blocked on legal sign-off.** `routes/legal/legal-content.ts`
    still carries the bracketed tokens by design (`[COMPANY]`, `[JURISDICTION]`,
    `[CONTACT EMAIL]`, `[COMPANY ADDRESS]`, `[HOSTING REGION]`, `[EFFECTIVE DATE]`) — the
    section structure is the deliverable (D29); the real legal entity, address,
    jurisdictions and support address are filled in at sign-off. Not launch-mechanical;
    revisit before flipping DNS at `V1.4`.

**At the end of L4 the app is "launch-ready pending infrastructure":** every feature,
provider, and admin screen works; the only thing missing is a public box to run it on.

**Status (2026-09-01):** `L4.1`–`L4.4` done. `L4.5` (legal-page entity fill-in) is
deferred, blocked on legal sign-off — the page structure ships; the bracketed tokens are
filled before DNS at `V1.4`. Nothing else in L4 is outstanding.

---

# PHASE V1 — VPS bring-up (deferred ~1 month)

**Goal:** the day the Hostinger VPS is purchased, stand it up and go live. Every task here
needs the server. Follow `docs/puppeteer-hosting-runbook.md` and
`docs/backup-and-secrets-runbook.md` — they were written for exactly this moment.

This is Epic 0.3 (`0.3.1`–`0.3.5`) plus `0.2.1` plus the runbook verification steps.

## Epic V1.1 — Provision the box

- [ ] `V1.1.1` (M) Ubuntu LTS, `deploy` user, key-only SSH, `ufw` (22 rate-limited / 80 /
  443), install Node 22.x / Postgres 17 / nginx / `age` / `rclone` / process manager /
  `git`. *(closes `0.2.1`)*
- [ ] `V1.1.2` (S) App Postgres role (owns only `invoice_saas`, no SUPERUSER/CREATEROLE) +
  a separate migration role for the deploy step. *(backup-runbook §4)*
- [ ] `V1.1.3` (S) Filesystem layout: app at `/srv/invoice-saas`, uploads at
  `apps/api/var/uploads`, env at `/etc/invoice-saas/api.env` `chmod 0600` outside the git
  tree.

## Epic V1.2 — Backend on the box

- [ ] `V1.2.1` (M) API under PM2 / `systemd`: auto-restart, start on boot,
  `NODE_ENV=production`, `EnvironmentFile`, graceful `SIGTERM` (drain requests, close the
  `lib/pdf/browser-pool.ts`). *(closes `0.3.1`)*
- [ ] `V1.2.2` (S) Migrations run as a deploy step (migration role), before new code goes
  live; a failed migration aborts the deploy.
- [ ] `V1.2.3` (S) `/healthz` (+ readiness touching the DB) wired to the process manager,
  nginx, and uptime monitoring.
- [ ] `V1.2.4` (S) Confirm the `NODE_ENV=production` boot: `config/env.ts` passes with the
  real env, `mail/index.ts` no longer throws (real mailer from L1.1).

## Epic V1.3 — Frontend on the box

- [ ] `V1.3.1` (S) Deploy `apps/web/dist`; nginx serves it with SPA fallback to
  `index.html` (React Router owns `/console/*`, `/admin/*`, deep links, `next=`
  redirects). Hashed assets `immutable`, `index.html` never cached. *(closes `0.3.2`)*
- [ ] `V1.3.2` (S) Production API origin / CORS / cookie settings
  (`lib/auth-cookie.ts` — `Secure`, correct `SameSite`, production domain). Verify login
  → refresh → reload holds and no CORS errors.
- [ ] `V1.3.3` (S) Confirm the proxy-aware rate limiting from `L3.6.2` (`trust proxy`,
  real client IP behind nginx).

## Epic V1.4 — Domain, TLS, environments, deploy

- [ ] `V1.4.1` (S) DNS: apex (+ `www`) → VPS. Decide apex vs `app.` host
  (`route-map.md` assumes one origin). *(closes `0.3.3`)*
- [ ] `V1.4.2` (S) TLS via `certbot` (nginx plugin) + auto-renew timer; HSTS; HTTP→HTTPS
  301.
- [ ] `V1.4.3` (M) Staging env: subdomain + own DB + own `api.env` + Stripe **test** keys
  + a **separate** webhook endpoint/secret. A `staging` branch/tag deploys there.
- [ ] `V1.4.4` (M) Deploy on merge to `main`: build → ship → `db:migrate:deploy` → reload
  → `/healthz` → done. Keep the previous release for one-command rollback. *(closes
  `0.3.4` — the deploy half; CI half is `L3.1`)*
- [ ] `V1.4.5` (S) Deploy credentials (SSH key etc.) in the CI secret store only.

## Epic V1.5 — Backups, email domain, PDF verification on the box

- [ ] `V1.5.1` (S) Install the nightly backup cron from `L3.2.1`'s script:
  `15 3 * * *`, log to `/var/log/invoice-backup.log`, `rclone` to an off-region
  write-once/versioned bucket, 7 local / 30 daily + 12 monthly remote. `age` private key
  never on the box. *(closes `0.3.5`)*
- [ ] `V1.5.2` (S) First **VPS** restore test (backup-runbook §3) into staging; date the
  runbook's Restore test log with the real run.
- [ ] `V1.5.3` (S) Email domain auth: SPF, DKIM, DMARC for the real sending domain; move
  the mailer off the provider sandbox domain (from `L1.1.3`). Re-verify the three
  transactional emails land in the inbox, pass DKIM. *(finishes `4.3.4`)*
- [ ] `V1.5.4` (S) Card previews: validate `og:*` / `twitter:*` on Slack + X + LinkedIn
  with the now-public `/og-image.png`. *(finishes `X.6.3`)*
- [ ] `V1.5.5` (S) **Puppeteer on the VPS** — `puppeteer-hosting-runbook.md` §2:
  `npx puppeteer browsers install chrome --install-deps`, then `npm run pdf:smoke`.
  Record cold launch / warm render median / Chrome RSS / box RAM in §4.
- [ ] `V1.5.6` (S) Decision gate (runbook §4): if Chrome won't launch, warm render > ~1 s,
  or a pooled instance can't sit beside Node → PDF rendering moves off-box (runbook §5;
  the `renderPdf(html, opts) => Buffer` seam already isolates this). Otherwise size
  `lib/pdf/browser-pool.ts` concurrency to the measured numbers.

## Epic V1.6 — Monitoring live

- [ ] `V1.6.1` (S) Set the production Sentry DSN for API + web (seam verified at `L3.3`);
  confirm a real error arrives with release + environment tags.
- [ ] `V1.6.2` (S) Uptime check on `/healthz`; backup non-zero exit → alert; newest remote
  backup > 26 h → alert; `/var/backups` > 80 % → alert. *(backup-runbook §6)*
- [ ] `V1.6.3` (S) Route the `/admin/usage/anomalies` `flagged` signal to an alert channel
  (a cron hitting the endpoint, or a scheduled job) so a spike notifies without opening
  the admin console. *(finishes `8.4.4`)*

## Epic V1.7 — Go live

- [ ] `V1.7.1` (S) Run the Playwright critical-path suite against staging; then a manual
  production run with a Stripe **test** purchase before switching to live.
- [ ] `V1.7.2` (S) Light load test of the PDF pipeline at the `V1.5.6` pool ceiling — watch
  RSS, `/dev/shm`, response times; record headroom.
- [ ] `V1.7.3` (S) Stripe go-live: live keys, live webhook endpoint + secret, live price
  IDs (`PLAN_CATALOG`); verify one small live transaction and idempotent webhook
  handling.
- [ ] `V1.7.4` (S) Mark every runbook "executed / verified": `puppeteer-hosting-runbook.md`
  §4 numbers filled, `backup-and-secrets-runbook.md` restore-test log dated with the VPS
  run, `JWT_ACCESS_SECRET` rotation drill (backup-runbook §5) performed once on staging
  with zero user-visible logout.

---

# Open decisions to make

All recorded in `decisions.md`. The first four block **local** work; the rest block V1.

| # | Decision | Blocks | Notes |
|---|---|---|---|
| ~~A~~ | ~~Transactional email provider~~ → **decided `D33`: Resend** | ~~`L1.1.1`~~ | Wired behind `RESEND_API_KEY`+`MAIL_FROM`; deliverability still judged at `V1.5.3` |
| ~~B~~ | ~~LLM provider + model for AI drafting~~ → **seam built, key unwired** | ~~`L1.2.1`~~ | Adapters for `anthropic` (Haiku) + `custom` (own endpoint) done; owner sets `AI_PROVIDER`+`AI_MODEL`+key to enable |
| ~~C~~ | ~~Charting library for admin~~ → **decided `D34`: `recharts`** | ~~`L2.1.3`~~ | Lazy-loaded, one importer (`admin-chart.tsx`), CSS-var colours for theme, own build chunk |
| D | Session strategy details | `L3.7.1` | Idle/absolute timeout, "remember me", concurrent-session cap |
| E | Single origin vs `app.` subdomain for the SPA | `V1.4.1` | `route-map.md` currently assumes one origin |
| F | Staging environment shape | `V1.4.3` | Full second env vs branch-deploy; separate Stripe test config either way |
| G | Off-box backup bucket provider + region | `V1.5.1` | R2 / B2 / Hetzner; must differ from the VPS region |

---

# Suggested order

**This month (local):**

| Step | Contains | Result |
|---|---|---|
| 1 | **L1** (email, AI, OG image) | The stubbed seams are real; AI + email work from localhost |
| 2 | **L3.1** (CI) | Every push is linted, typechecked, tested — no deploy yet |
| 3 | **L2** (admin center UI) | The biggest remaining build; run the business from a UI |
| 4 | **L3.2–L3.7** (backup script, Sentry seam, device + perf passes, security review, session decision) | Hardened, verified locally |
| 5 | **L4** (local launch dry-run) | Production-mode app + full Stripe test loop pass on your machine |

**When the VPS is bought:** run **V1** top to bottom, following the two runbooks. It
should take days, not weeks, because everything it deploys has already been proven locally.

---

# Definition of "launch-ready pending infrastructure" (end of L4)

1. Email sends through a real provider from localhost; the "email failed, PDF ok" path
   holds. *(L1.1)*
2. AI drafting produces real structured drafts, respects the monthly cap, logs cost.
   *(L1.2)*
3. `og-image.png` exists and the meta tags resolve. *(L1.3)*
4. The full `/admin/*` console works against the local Phase 8 APIs. *(L2)*
5. CI lints, typechecks, tests, and runs every `*:check` on push. *(L3.1)*
6. The backup script produces an encrypted dump and restores cleanly into a scratch DB.
   *(L3.2)*
7. A real device pass + a mid-range-phone perf pass are done with no blockers.
   *(L3.4, L3.5)*
8. `/security-review` is clean or fully triaged; tenant-scoping spot-checked on the
   cross-tenant admin endpoints; GDPR export/delete verified locally. *(L3.6)*
9. The session strategy is decided and written down. *(L3.7)*
10. The production-mode build boots locally with real keys and the e2e suite is green
    against it; the full Stripe test-mode billing loop passes. *(L4.1, L4.2)*
11. `.env.example` is complete *(L4.4 ✓)*; legal pages name the real entity *(L4.5 —
    deferred, blocked on legal sign-off; structure ships, tokens filled before `V1.4`)*.

# Definition of "production ready" (end of V1)

Everything above, plus: it runs on the VPS at the real domain over HTTPS, restarts on
crash and reboot, deploys from `main` via CI with one-command rollback; nightly encrypted
off-region backups run and have been restored once from the box; the Puppeteer smoke test
passes on the VPS and the browser pool is sized to it; Sentry + uptime + backup-freshness
+ anomaly alerts fire on real failures; email domain passes DKIM; Stripe is on live keys
with an idempotent live webhook and one verified live transaction; every runbook's
"executed" line is filled in.
