# Pre-launch security review (backlog L3.6)

Local pass, 2026-09-01, against the L3 working branch. Covers the `L3.6.1`
checklist, the rate-limit review (`L3.6.2`), and the GDPR endpoint verification
(`L3.6.3`). Nothing here blocks launch; open items are marked and dated.

---

## L3.6.1 — Full pre-launch security pass

### `/security-review` (skill)

Run on the branch. The skill's automated diff extraction came up empty — the L3
work is entirely uncommitted (no commits ahead of `origin/main`), so its
`git diff origin/HEAD...` had nothing to feed the analyzers. **Re-run it once the
L3 branch is committed.** In the meantime the new L3 code was reviewed by hand
(below) and the standing checklist was walked.

### New L3 code — findings

| # | Where | Severity | Finding |
|---|---|---|---|
| 1 | `apps/api/src/lib/cors-origin.ts` | **Low (dev-only)** | Development CORS now reflects any `http(s)://` private-range LAN origin (10/8, 172.16/12, 192.168/16) and `*.trycloudflare.com` / `*.ngrok*` / `*.loca.lt` with `credentials: true`. A hostile server already on the same LAN could therefore make *credentialed* cross-origin calls to a **dev** API. Impact is contained: (a) `!isProduction` gated — production stays exact-match `WEB_ORIGIN`; (b) authenticated routes require an `Authorization: Bearer` **header**, not an ambient cookie, so a foreign page cannot forge one; (c) the refresh cookie is `httpOnly` + `SameSite=Lax` + `path=/auth`, so it is not sent on a cross-site request and `/auth/refresh` cannot be driven from another origin. Accepted for `L3.4` device testing. If ever uncomfortable, pass an explicit `WEB_ORIGIN` to `npm run dev:lan` instead of the wildcard. |

No other new file introduces an attack surface: `scripts/dev-lan.mjs` (dev
launcher, not shipped), `apps/api/scripts/sentry-check.ts` (offline check),
`apps/web/public/robots.txt` (informational — the routes it lists are auth-gated
regardless), `apps/web/playwright.config.ts` (test only), the `SENTRY_RELEASE` /
`VITE_SENTRY_RELEASE` env additions (optional strings passed to the Sentry SDK
config, no injection sink), `main.tsx`'s `__sentryTestError` (`import.meta.env.DEV`
only, tree-shaken from prod), `ops/*.sh` (operator scripts, no untrusted input).

### Standing checklist

| Item | Result |
|---|---|
| **Every DB query tenant-scoped via middleware, never per-route** (`0.2.4`) | `db/tenant-scope.ts` `scopedPrisma()` is a Prisma `$extends` that forces `where.tenantId` / `data.tenantId` on all `WHERE`/`DATA` operations for every model in `TENANT_SCOPED_MODELS` (Client, Product, Template, Invoice, InvoiceHistoryEvent, both numbering tables, Subscription, UsageCounter, AiGenerationLog, SupportTicket). `middleware/tenant.ts` attaches one per request as `req.db`; routes never touch the raw `prisma`. `npm run security:check` drives this against two tenants and asserts B can't read/mutate A and can't plant a row under A. |
| **Cross-tenant admin endpoints** | All 7 `/admin/*` routers (`audit-log`, `billing`, `grants`, `overview`, `support`, `tenants`, `usage`) call `router.use(authenticate, requireAdmin)` at the top. The admin *services* deliberately use the unscoped `prisma` (that is their job — cross-tenant reads) but every query carries an explicit `tenantId` / `tenantId: { in: ids }` filter. `requireAdmin` re-reads `users.role` from the DB on every call, so a demoted admin loses access immediately (not at JWT expiry). |
| **`helmet` + rate limits present** (`X.4`) | `helmet()` mounted first in `index.ts` (nosniff, frameguard DENY, Referrer-Policy no-referrer, hidePoweredBy, HSTS in prod). CSP / CORP / COEP are deliberately off on the JSON API — CSP belongs on the web app's HTML, and `/fonts` sets its own `cross-origin` CORP for the sandboxed preview iframe. Rate limits: see L3.6.2. |
| **`requireAdmin` re-reads role per call** | Yes — `prisma.user.findUnique({ select: { role } })` on every request, not from JWT claims. `requireTenant` likewise re-reads `disabledAt` so a disabled account's still-valid access token stops working now. |
| **Stripe webhook verifies the raw body before JSON** | `app.post('/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler)` is mounted **before** `app.use(express.json())`. Signature verification (`verifyWebhook`) runs on the raw `Buffer`. The webhook is also exempt from `apiLimiter` (Stripe backfill bursts; the signature is its auth) — acceptable, not a finding. |
| **No secret logged** | `request-logger.ts` = morgan `dev` locally / `combined` in prod — method, URL, status, timing, and in prod the remote addr + UA. No headers, no bodies. Email-verification and password-reset tokens travel in the request **body** (`POST /auth/verify-email`, `POST /auth/password/reset`), never the query string, so `combined`'s URL logging can't leak them. `config/env.ts` is the only reader of `process.env`. |
| **`--no-sandbox` Chrome only renders our own HTML** | `lib/pdf/browser-pool.ts` launches with `--no-sandbox` (needed on VPS images) and renders **only** the string from the shared `renderInvoice` via `page.setContent`. Request interception is on: every request is `data:` / `about:blank`, or must prefix-match `/fonts/` or `/uploads/` and is then served from disk by `join(dir, basename(pathname))` (`basename` strips traversal), or is `abort()`ed. A malicious logo URL or an injected `<img src="http://169.254.169.254/…">` in invoice data is aborted — no network egress. The live preview renders the same HTML in an `<iframe sandbox="">` (scripts disabled). |
| **Invoice-render XSS** | `packages/shared/src/render/html.ts` `esc()` (escapes `& < > " '`) / `escMultiline()` wrap **every** user value in `blocks.ts` — party names, addresses, line-item descriptions, units, notes, bank details, footer, signature. The `<title>` uses a dedicated `escapeTitle`. Self-contained document, no `<script>`, no templating engine. |

**Verdict:** clean. One Low, dev-only, accepted (finding 1).

---

## L3.6.2 — Rate-limit review

`middleware/rate-limit.ts`, `express-rate-limit` v8, default in-memory store (one
API process on the VPS — `D1`; move to a shared store only if scaled out). On trip
each returns the standard `{ error: { code: 'RATE_LIMITED' } }` body.

| Limiter | Window | Limit | Applied to | Assessment |
|---|---|---|---|---|
| `apiLimiter` | 60 s | 300 / IP | every route (mounted before the body parser), except `/health` and `/billing/webhook` | Loose by design — the invoice editor's autosave + live-preview is chatty. Fine. |
| `credentialsLimiter` | 15 min | 10 / IP | `POST /auth/signup`, `/login`, `/password/reset` | Sane for credential stuffing; generous enough for a fat-fingered real user. |
| `refreshLimiter` | 15 min | 120 / IP | `POST /auth/refresh` | A legit client refreshes ~once per 15-min access-token life plus on tab focus — headroom is deliberate. |
| `emailDispatchLimiter` | 60 min | 5 / IP | `POST /auth/password/request-reset`, `/auth/verify-email/resend` | Tightest — each hit can put mail in an inbox. Good. |
| `expensiveLimiter` | 5 min | 20 / IP | AI draft, PDF render, CSV export, `GET /profile/export`, `DELETE /profile` | Each call costs money (AI / headless Chrome) or ships a whole tenant's data. Appropriate. |

**Proxy config (intended, verify at `V1.3`):** `app.set('trust proxy', 1)` in
`index.ts` — trust **exactly one** hop (nginx terminating TLS on the same box), so
`req.ip` is the real client from `X-Forwarded-For[-1]` and can't be spoofed by a
client appending its own `X-Forwarded-For` (which `trust proxy: 1` ignores). This
is the `express-rate-limit`-recommended setting and cannot be fully verified until
nginx is actually in front → **flag for `V1.3.3`**. Do **not** use `trust proxy: true`
(trust-all) on the VPS.

---

## L3.6.3 — GDPR endpoints verified locally

Drove a throwaway account through the real API against local Postgres (2026-09-01):

- **`GET /profile/export`** → `200`, `application/json` attachment. Payload has all
  10 sections (`meta`, `account`, `clients`, `products`, `templates`, `invoices`
  incl. line items + history, `invoiceNumbering`, `subscriptions`, `usageCounter`,
  `aiGenerationLogs`), `schemaVersion: 1`. `account` **excludes `passwordHash`**;
  raw token tables are not included; the logo is referenced by URL, not inlined.
  Soft-deleted rows are included by design (still the tenant's data).
- **`DELETE /profile`** re-auth friction: wrong password → `422`, wrong
  `confirmEmail` → `422`, correct password + email → `204`.
- **Cascade** (matches `L2.3.4`): before = 1 client / 1 product / 3 refresh tokens;
  after = **user 0, clients 0, products 0, usageCounter 0, refresh tokens 0**. The
  old access token then gets `401` on `/auth/me`. `deleteOwnAccount` cancels Stripe
  first and aborts the delete on failure (a caught error keeps the row so billing
  can't keep charging a card with no way left to cancel).
- Note (not a defect): support tickets/messages are `SetNull` on user delete and
  survive with just the email snapshot; they are also **not** in the export. If a
  ticket thread ever carries tenant-authored content, add it to `exportOwnData`
  and decide retention — a `V1.x` consideration, not launch-blocking.

---

## Open items

| Item | Owner / when |
|---|---|
| Re-run `/security-review` (skill) once the L3 branch is committed | before merge |
| Verify `trust proxy: 1` gives the real client IP behind nginx | `V1.3.3` |
| Decide support-ticket content in the GDPR export | `V1.x` (only if ticket bodies start holding tenant text) |
