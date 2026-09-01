# Architecture Decisions

Answers to "Open decisions to make before building" in `invoice-saas-backlog.md`, plus
anything else locked in along the way. Backlog task `0.2.1` requires the hosting/DB
decision to be documented — this is that document.

---

## D1 — Hosting: build against local Postgres now, Hostinger VPS later

**Decided (revised 2026-08-30):** Development runs entirely on the local machine —
local Node, local Postgres — until the product is far enough along to deploy. When
deployment starts, hosting is a **Hostinger VPS**, not the managed deploy-from-GitHub
Node environment.

**Supersedes:** the same-day revision that chose managed Node hosting over a VPS. That
revision is void. The original VPS decision stands, just later in the timeline than
`0.2.1` implied.

**Why revert:** the managed-hosting path had two unresolved risks that only a real
Hostinger plan could answer — Postgres availability and whether headless Chrome could
launch (see the now-superseded text, preserved in git history). A VPS answers both by
construction: root access means Postgres is just `apt install postgresql`, and Chrome
gets its system libraries the same way `pdf-smoke.mjs` already proved works locally.
Trading that certainty for a git-push deploy stopped being worth it.

**Consequences:**
- `0.2.1`–`0.2.5` (backend skeleton, migrations, tenant scoping, error shape) and
  everything through Phase 3 (templates) and most of Phase 4 (invoices) are built and
  tested against `localhost` Postgres. Nothing here is hosting-shaped — this was always
  going to work the same way once deployed.
- `0.3.1` (deployment) reverts to PM2-on-a-box: install Node, install Postgres, install
  Chrome's deps, `pm2 start` behind nginx or Caddy for TLS termination. Undo the CI
  shrink from the managed-hosting revision — `0.3.4` needs a real deploy step (SSH +
  `git pull` + `pm2 reload`, or a small deploy script) once the VPS exists.
  **Not scheduled yet** — do this when the user provisions the VPS, not before.
  `puppeteer-hosting-runbook.md` already covers the VPS install sequence and is correct
  as written; only its "managed platform, no root" §5 fallback stops applying.
- `DATABASE_URL` in `apps/api/.env` points at local Postgres for the whole local-build
  phase; it becomes the VPS connection string only at `0.3.1`.

## D2 — Database: Postgres

**Decided, unconditionally.** Local Postgres 17 is running now (`invoice_saas`
database created, `DATABASE_URL` verified against it — see `apps/api/.env`). The VPS in
D1 gives root, so `jsonb`, extensions, and everything else Postgres offers are all
available without a hosting-driven fallback to MySQL. D1's earlier "check Postgres
availability" risk no longer applies.

**Consequences:**
- `jsonb` is available for the template config blob (`3.1.1`) — schema-versioned JSON,
  queryable if we ever need it.
- Integer minor units for money map to `bigint` / `integer` columns; never `float` or
  `money`. Rounding rules documented once in `4.1.2`.
- Gapless per-tenant invoice numbering (`4.1.3`) uses a sequence table row locked with
  `SELECT ... FOR UPDATE` inside the same transaction as the insert — not a Postgres
  `SEQUENCE`, which is explicitly gappy on rollback.
- Migration tool: **Prisma** — see D11.

## D3 — Data model: single `users` table, no Tenant/User split

**Decided:** One row per signed-up business. Login credentials (email, password hash,
verification state) and business profile (name, logo, address, tax ID, default currency,
payment terms, paper size, language) live together on `users`. No separate `tenants`
table. This overrides the two-entity model in spec §2 and settles backlog open decision
#3 as "no teammates for now."

**Consequences:**
- The Subscription record, usage counters, and the admin role attach to the `users` row.
- Everything else in the multi-tenant strategy (`0.2.4`) is unchanged: every child table
  still carries one owner FK, still injected by central middleware, still never scoped
  per-route.

**Naming convention that follows from this (recommended):** keep the owner column on
every child table named **`tenant_id`**, referencing `users.id` — rather than `user_id`.

- It keeps the CLAUDE.md convention ("every DB query scoped by `tenant_id` via
  middleware") literally true, so there is one word for the scope across code,
  middleware, docs and backlog.
- If teammates are ever added, the split is: create `tenants`, move the business-profile
  columns onto it, point `users.tenant_id` at it, and repoint the existing
  `tenant_id` FKs. **No child table and no query changes** — which is the expensive part.
  With `user_id` everywhere, that same change is a rename across every table and every
  line of data access.
- Cost: a reader has to know `tenant_id` currently resolves to a user row. Documented
  here and in the schema comment; that is the whole cost.

## D4 — Soft delete for clients and products

**Decided:** Soft delete (backlog's own recommendation, open decision #4).

Historical invoices must keep rendering after a client or product is deleted. Deleted
rows are excluded from pickers and lists but still resolve for invoices that reference
them; `X.7.22` covers the UI when a reference is missing entirely.

## D5 — Manual grant + Stripe subscription conflict: most access wins

**Decided:** Whichever record grants more access wins; both records are preserved and
both are visible in the admin billing view (backlog's own recommendation, open
decision #5).

The central entitlement service (`6.1.2`) resolves this in one place — it reads all
active subscription records for the owner and returns the highest tier. Nothing else in
the codebase compares tiers.

## D6 — AI generation limit on Premium: 50/month

**Decided:** 50 successful generations per calendar month (backlog's suggested figure).

Counter increments only on a successful, schema-valid generation (`7.1.6`, `7.1.8`).
The number lives in config, not in code branches, so it can be changed without a deploy
touching business logic.

## D7 — Repository layout: single monorepo, npm workspaces

**Decided:** One repository, npm workspaces (`0.1.1`). Three workspaces:
`apps/web` (React + TS + Vite), `apps/api` (Express + TS), `packages/shared`
(Zod schemas and types imported by both).

**Consequences:**
- Installs run from the repo root only; there is exactly **one** `package-lock.json`,
  at the root. Per-app lockfiles are a bug — they mean someone ran `npm install`
  inside a workspace folder.
- `packages/shared` is the single source of truth for data shapes. It compiles to
  `dist/` with declarations, and both apps consume it through the workspace symlink
  as `@invoice-saas/shared`.
- Packages are scoped `@invoice-saas/*` so no workspace name collides with the root.

## D8 — TypeScript pinned to 6.0.x across all workspaces

**Decided:** `typescript@~6.0.3` in web, api and shared alike.

**Why:** TypeScript 7.0.2 is the current `latest`, but `typescript-eslint@8.68.0`
(also current `latest`) peer-requires `typescript >=4.8.4 <6.1.0`. No published
`typescript-eslint` supports TS 7 yet. Backlog `0.1.2` requires ESLint, and the rules
worth having there are the type-aware ones, so the linter constrains the compiler.

**Consequences:**
- One compiler version across the monorepo: the `.d.ts` files `packages/shared`
  emits are produced and consumed by the same TypeScript.
- Revisit when `typescript-eslint` ships TS 7 support — it should then be a single
  commit bumping all three workspaces together, never one workspace at a time.
- `@types/node` is pinned to `^22.20.1` to match the Node 22 runtime rather than
  floating ahead to types for a Node version we do not run.

## D9 — Placeholder English copy until i18n lands (X.1.1)

**Decided:** UI copy written before `react-i18next` exists is hardcoded English, kept
in a single `COPY` object per file and marked `TODO(X.1.1)`.

**Why:** CLAUDE.md forbids hardcoded UI strings and the backlog warns against deferring
i18n — both correct at scale. But pulling all of X.1.1 (provider, en/sq/mk resources,
detection, persistence, lint rule) into task `0.1.5` to translate three strings on one
error screen trades a large scope expansion for a tiny saving.

**Consequences:**
- Applies only to surfaces built before X.1.1 — currently just
  `apps/web/src/components/AppErrorBoundary.tsx`.
- Every such string sits in one `COPY` object so the conversion is mechanical.
- **X.1.1 is not done until `grep -r "TODO(X.1.1)"` returns nothing.** That grep is the
  checklist.
- The `no-literal-string` lint rule from `X.1.1` is what stops this convention from
  quietly spreading past its intended scope.

**Resolved (Epic X.1.1, see D26).** The grep returns nothing; all 55 `COPY` objects
are converted; `i18next/no-literal-string` is live on `apps/web/src` and
`npm run i18n:check` is the ongoing gate.

## D10 — Never `system-ui` in invoice rendering

**Decided:** The invoice renderer and PDF pipeline must use an explicit, self-hosted
font stack. `system-ui` is banned outright in any surface that reaches a PDF.

**Why — measured, not theoretical.** The Phase 0 Puppeteer smoke test
(`apps/api/scripts/pdf-smoke.mjs`) rendered `Фактура` with `font-family: system-ui`
and the text extracted back out of the PDF as `Фаĸтура`: Chrome emitted a ToUnicode
map turning Cyrillic **к U+043A** into Latin **ĸ U+0138 (LATIN SMALL LETTER KRA)`.
The page *looks* correct — the failure only appears when the text is copied,
searched, or extracted. Every other stack tested (`sans-serif`, `serif`,
`Helvetica/Arial`, `Noto Sans`) round-tripped correctly.

This is precisely the backlog risk "Cyrillic breaks in PDF but not on screen",
occurring on a developer laptop before a single invoice template exists.

**Consequences:**
- `3.1.6` (self-hosted Noto Sans/Serif) is a correctness requirement, not a polish
  task — it removes the dependency on whatever fonts the host happens to have.
- `X.1.6` must verify Cyrillic by **extracting text from the generated PDF and
  comparing codepoints**, not by eyeballing the render. Visual inspection cannot
  catch this class of bug.
- The curated font pairings in the template editor (`3.2.6`) must never expose
  `system-ui` as an option.

## D11 — Migration tooling: Prisma

**Decided:** Prisma (`prisma migrate` + Prisma Client) for schema, migrations and data
access. Settles the `0.2.2` open question.

**Version pinned to `~6.19.3`, not `latest`.** `npm install prisma` currently resolves to
`8.0.0-rc.12` — a pre-release that ships an entirely different, agentic CLI (`prisma auth`,
`prisma deploy`, `prisma orm`, no `migrate`/`generate`/`studio` as such). Prisma 7 stable
also breaks the classic setup this document describes: `datasource { url = env(...) }` in
`schema.prisma` is rejected outright, replaced by a driver adapter passed to the
`PrismaClient` constructor plus a `prisma.config.ts` file. Both are real, current shifts in
Prisma's architecture, not installation mistakes — 6.19.3 is the newest release still using
the classic CLI and schema-level `url` this decision (and the code below) assumes. Revisit
the pin once 7's driver-adapter model is designed in, not stumbled into mid-migration.

**Why, against Knex specifically:**

- **It enforces the tenant rule instead of relying on discipline.** CLAUDE.md requires
  every query scoped by `tenant_id` "via middleware, never per-route" (`0.2.4`). A Prisma
  Client extension (`$extends({ query: { $allModels: { ... } } })`) injects the scope into
  every `findMany`/`update`/`delete` for every model, in one file. Knex has no equivalent
  hook — the best it offers is a wrapper that every developer must remember to call, which
  means the guarantee is a code-review convention rather than a property of the system.
  A missed scope is a cross-tenant data leak (`X.4.6`), so this difference is the whole
  argument on its own.
- **Generated types are the same shape discipline as `packages/shared`.** The schema is
  the single source of truth for rows the way Zod is for payloads. Knex's `Knex.TableType`
  interfaces are hand-maintained and drift silently from the real columns.
- **Migrations are first-class.** `prisma migrate dev` diffs the schema and writes the SQL;
  Knex requires hand-authoring both `up` and `down` for every change.
- **It hedges D1's open Postgres question.** Prisma targets Postgres and MySQL from the
  same schema file. If the Hostinger plan turns out not to offer Postgres, the port is a
  provider change plus a review of column types — not a rewrite of hand-written SQL.

**The objection against it — gapless invoice numbering — does not hold.** `4.1.3` needs a
row lock: `SELECT ... FOR UPDATE` on the tenant's counter row, in the same transaction as
the insert. Prisma's interactive transactions give exactly that:

```ts
await prisma.$transaction(async (tx) => {
  const [counter] = await tx.$queryRaw`
    SELECT next_value FROM invoice_counter
    WHERE tenant_id = ${tenantId} AND doc_type = ${docType}
    FOR UPDATE`;
  // ... increment, then tx.invoice.create(...) on the same connection
});
```

One raw query, in one function, in the one place in the codebase that needs it. That is a
far smaller cost than hand-writing every other query to get it.

**Consequences:**
- Adds a build step: `prisma generate` must run before typecheck in CI and after install.
- The tenant-scoping extension (`0.2.4`) is the only sanctioned way to reach the database.
  Raw `$queryRaw` is allowed **only** inside the numbering transaction and must carry the
  tenant predicate explicitly — it bypasses the extension.
- `packages/shared` still owns Zod schemas for API payloads. Prisma types describe rows,
  Zod describes wire format; they are not the same thing and neither generates the other.

## D12 — Session strategy: access JWT + rotating opaque refresh token

**Decided (settles the `1.1.1` open question):** A short-lived **access JWT**
(15 min, HS256, sent as `Authorization: Bearer`) plus a long-lived **opaque refresh
token** (30 days) in an `httpOnly`, `SameSite=Lax` cookie scoped to `/auth`.

**Mechanics:**
- Only the SHA-256 hash of a refresh token is stored (`refresh_tokens` table), so a
  DB dump can't be replayed as a live session.
- Every `POST /auth/refresh` **rotates**: the presented row is revoked and linked
  (`replacedById`) to a freshly issued one. Presenting an already-revoked token is
  treated as theft — every active refresh token for that user is revoked and they
  must log in again.
- Password reset and logout revoke refresh tokens server-side; a stolen access
  token still dies on its own within 15 minutes.
- Web app keeps the access token in a **module variable, never `localStorage`** —
  an XSS bug can't lift a durable credential. A page reload drops it;
  `lib/api-client.ts` mints a new one from the cookie on the first 401.

**Why not a plain cookie session:** functionally fine, but the access-token split
keeps the API's per-request auth check stateless (no session-store round-trip on
every call) which matters once Phase 4's PDF/render endpoints get heavy, and it
leaves the door open to a second client (mobile, CLI) without reworking auth.

**Why not a long-lived JWT with no refresh:** can't be revoked. Logout, password
reset, and "sign out everywhere" all need a server-side handle on the session.

## D13 — Mail: pluggable `Mailer` port, `ConsoleMailer` until a provider is picked

**Decided (partial — the provider choice in `4.3.4` is still open):** All outbound
email goes through a one-method `Mailer` interface (`apps/api/src/mail/mailer.ts`).
The only implementation today is `ConsoleMailer`, which logs the message (and the
verification / reset link) to the server console, so the `1.1.2` / `1.1.3` flows
are fully exercisable on a laptop with no provider account.

**Consequences:**
- `mail/index.ts` **throws at boot** if `NODE_ENV=production` and no real transport
  is wired — a mock mailer must never reach production silently.
- Choosing Resend / Postmark / SMTP (`4.3.4`) is one new `Mailer` class plus a
  one-line change in `mail/index.ts`; no call site changes.
- Email copy is placeholder English in `mail/index.ts`, `TODO(X.1.1)` — it becomes a
  per-language lookup keyed on `user.preferredLanguage` when i18n lands.

## D14 — Free tier: a `tier` column on `users` now, `Subscription` table in Phase 6

**Decided (settles `1.2.1` — "assigns Free tier automatically"):** Add a `tier` enum
(`FREE` | `BASIC` | `PREMIUM`, default `FREE`) directly on `users`. Signup writes no
code for it — the column default *is* the "assign Free automatically". Nothing in the
codebase branches on `tier` until Phase 6.

**Why not defer entirely:** `1.2.1` explicitly asks for tier-on-signup, and the auth
session (`AuthUser`) is the natural place for the app to learn a user's plan. A nullable
"no record = Free" convention would mean every later reader special-cases the absence.

**Why not the full `Subscription` table now:** `6.1.1` designs that table (status,
source, start/end dates, Stripe linkage) and `6.1.2` the central entitlement service
that is the *only* sanctioned tier reader. Building it in Phase 1 with no billing, no
Stripe and no manual grants would be guessing at its shape.

**Consequences:**
- Phase 6 migrates this: `Subscription` rows become the source of truth, the entitlement
  service (`6.1.2`) reads them, and this column is either dropped or kept as a
  denormalised cache the service writes. Either way, **only** `6.1.2` reads tier after
  Phase 6 — the same rule D5 already states.
- `AuthUser.tier` is exposed to the web app for display/gating hints; server-side
  enforcement (`6.1.4`) never trusts it.

## D15 — File storage: a `Storage` port, `LocalDiskStorage` until a cloud store is picked

**Decided (partial — the concrete cloud backend is still open):** All persisted binary
assets (business logos now — `1.2.3`; generated PDFs and other uploads later) go through
a one-interface `Storage` port (`apps/api/src/lib/storage/storage.ts`). The only
implementation today is `LocalDiskStorage`, writing under `UPLOAD_DIR` and served
read-only by `express.static` at `/uploads`.

Deliberately the same shape as the D13 `Mailer` port — "pluggable adapter, concrete
choice deferred".

**Why local disk is fine for now:** D1 puts the whole build on one machine, then one
VPS. A single box with a persistent disk needs nothing more; object storage only earns
its keep once there's more than one app server or a CDN in front.

**Consequences:**
- Adopting S3 / R2 / a VPS volume mount is one new `Storage` class plus a one-line swap
  in `lib/storage/index.ts` — no call-site changes (`profile-service`, and later the PDF
  pipeline, only see `storage`).
- Stored `logoUrl` values are **root-relative** (`/uploads/logos/…`), resolved against
  the API origin by whoever renders them (`resolveAssetUrl` on the web; the Phase 3 PDF
  renderer server-side). A cloud backend that returns absolute URLs still satisfies the
  `Storage` contract — `resolveAssetUrl` passes absolute URLs through untouched.
- Uploaded files are re-encoded (logos → bounded WebP via `sharp`), never stored as the
  raw upload: strips metadata, caps dimensions, removes the "is this really an image"
  question from every downstream consumer.
- `X.4.4` (account deletion) and `X.4.6` (upload validation) both touch this — the port
  is where a "delete every asset for this user" method lands later.

## D16 — Client address: per-client choice of structured vs free-text

**Decided (settles a `2.1.3` sub-question the backlog left open — "address" is
unspecified):** a `Client` carries an `addressMode` (`STRUCTURED` | `FREE_TEXT`,
default `STRUCTURED`) and the columns for *both* shapes; the form shows one set at a
time and the invoice renderer reads whichever the mode names.

**Why both, not one:**
- **Structured** (line1/line2/city/postalCode/country) mirrors the business profile
  on `users`, so the Phase 3 renderer's client-info block is symmetric with its
  business-info block — same fields, same formatting code.
- **Free-text** is what a user with a client whose address doesn't fit five Western
  fields actually needs (common across MK/AL/XK and international clients). Forcing
  everything structured would mean lossy data entry; forcing everything free-text
  would lose the renderer's ability to align and format.
- The cost of carrying both is six nullable columns and one enum — cheap. Picking
  wrong and migrating later is not.

**Consequences:**
- `3.1.3` (client-info block) branches once on `addressMode`; nothing else does.
- No cross-field requirement — a client with no address at all is valid (Send only
  needs an email; spec §91).
- Products (`2.2`) have no address, so this stays Client-only.

## D17 — Product money: integer minor units + basis points, tenant default currency

**Decided (settles `2.2.1` — "default price" and "default tax rate" have no stored
form in the spec):**
- `Product.defaultPriceMinor` — `Int?`, minor units (×100; every target currency is
  2-decimal so the scale is a constant, not a per-currency lookup). **Nullable** —
  a product can be a named service whose rate is set per invoice.
- `Product.defaultTaxRateBp` — `Int @default(0)`, basis points (`1800` = 18.00%).
  Integer, not a percent float, so it handles `8.25%` (a real US rate) exactly and
  keeps line math integer.
- **No per-product currency and no FX.** The price is implicitly in the tenant's
  `defaultCurrency`; on an invoice in another currency it is just a prefill the
  user overwrites. A per-product currency column was rejected — it invites an
  FX-conversion expectation the product doesn't have and forces the picker to
  reconcile two currencies.

**Consequences:**
- `packages/shared/src/money.ts` is the single decimal⇆integer boundary
  (`amountStringToMinor` / `minorToAmountString` / `percentStringToBp` /
  `bpToPercentString`). The product form converts on load/submit; the API and DB
  only ever see integers. The Phase 3 renderer and Phase 4 line-item math use the
  same helpers — never `parseFloat` on a price anywhere.
- `4.1.2` (document rounding rules) inherits an all-integer pipeline; there is no
  float to round in the product layer.
- `4.2.7` (currency symbol / locale formatting) layers on top of
  `minorToAmountString` — it formats, it doesn't re-parse.

## D18 — Render engine: one isomorphic pure function in `packages/shared`

**Decided (settles where the 3.1.2 "single render engine" lives and how it is
shared):** `packages/shared/src/render/` — no fourth workspace (D7 stands). The
engine is a pure function `renderInvoice(templateConfig, invoiceData, options) →
{ html }` returning a **complete, self-contained HTML document**: inline `<style>`,
`@font-face`, no `<script>`, no external CSS/JS. It runs unchanged in the browser
(live preview) and in Node (Puppeteer PDF) — no React, no DOM APIs.

**Why in `shared`, not a new package:** it is pure TypeScript with one dependency
(`zod`, already there) and sits next to the data shapes it consumes. A separate
workspace would add a build target and a version boundary for no isolation
benefit.

**How the two consumers use the one output:**
- **Preview** — `media: 'screen'`, injected into `<iframe srcDoc sandbox>` so the
  invoice CSS is isolated from the app shell. What you see is byte-for-byte the DOM
  the PDF is made from (CLAUDE.md: one renderer).
- **PDF (4.3.1)** — `media: 'print'` (emits `@page`), fed to `page.setContent`.

**Fonts** are served by the API only (`/fonts/*.woff2`, from
`packages/shared/assets/fonts/`). The preview loads them cross-origin (the global
`cors()` covers it); the PDF loads them same-origin. `options.assetBaseUrl` selects
the origin and also resolves a root-relative logo URL. A hermetic data-URI font
mode can be added at 4.3.1 if the `networkidle0` wait proves flaky.

**Totals** are not computed inside the renderer — it receives precomputed integer
minor-unit amounts. `render/invoice-math.ts` `computeInvoiceTotals` is the single
calculator both the preview and (later) the server call; **4.1.2 owns the rounding
*policy*** and may change that one file (it currently rounds line-level, half-up).

**Consequences:**
- `InvoiceRenderData` (`render/invoice-data.ts`) is defined now; Phase 4's Invoice
  model (4.1.1) must produce that shape.
- Printed invoice labels are trilingual in `render/labels.ts` (EN/SQ/MK), separate
  from the app's react-i18next (X.1.1) — a Macedonian invoice is never
  English-labelled (spec §10).
- `schemaVersion` on every stored template config; bump + migrate, never read
  unparsed (3.3).

## D19 — Entitlements: one `entitlements.ts` seam that reads `user.tier` now, Phase 6 fills it in

**Decided (resolves the tension between `3.3.6` — "free tier: default template
only, enforced server-side" — and D14 / the `UserTier` schema note that nothing
should branch on `tier` outside Phase 6's future service):**

`apps/api/src/lib/entitlements.ts` is created now as the **single place** the app
reads `user.tier` to decide what an account may do. It currently reads the
`users.tier` column directly (which D14 already says *is* the answer until Phase
6). `6.1.2` swaps the bodies of its functions to resolve `Subscription` records
(Stripe + manual grants, decision D5) and returns the highest active tier — **no
call site changes**, because every tier check already goes through this file.

**Why this honours D14 rather than breaking it:** D14's actual concern is "one
place, not scattered `if (tier === …)` across the codebase". The seam *is* that one
place; building it now with a column read and a `TODO(6.1.2)` is cheaper and
safer than either scattering the check or leaving the `3.3.6` API unguarded
(spec §9: "enforced server-side, not just in the UI").

**Consequences:**
- First functions: `canManageTemplates(tier)` / `requireCanManageTemplates(userId)`
  — every `/templates` write goes through the latter (403 + upgrade message for
  `FREE`). Future gates (free-tier invoice limit `6.1.3`, AI monthly cap `7.1.6`)
  land in the same file.
- The web still uses `AuthUser.tier` for display/gating hints only (D14) — the
  server never trusts the client's view.

## D20 — Invoice data model: snapshot parties, per-type gapless sequences, line-level rounding

**Decided (settles the open choices in `4.1.1`–`4.1.5` that the spec leaves
implicit):**

**Party & line snapshot.** `Invoice` keeps live foreign keys
(`clientId` / `templateId` / `lineItems[].productId` — all nullable, `onDelete:
Restrict`, and they always resolve because those tables are soft-deleted, D4) **and**
copies the printed name / address / email / tax-id of both parties, plus every
line's text, onto the row at Save time (`businessName`, `clientAddress`,
`InvoiceLineItem.description`, …). Editing a Client, Product or the business
profile later never rewrites a document that is already issued — the legal record
is frozen. Duplicate (`4.4.4`) copies the snapshot. `X.7.22` (broken reference in
the UI) still applies to the *live* FK, e.g. for "open the client behind this
invoice".

**One sequence per document type.** Five independent gapless counters
(`InvoiceNumberSequence`, keyed `tenantId + documentType + year`): INVOICE,
PROFORMA, QUOTE, CREDIT_NOTE, RECEIPT. `4.1.3` only requires that proforma and
quotes not consume invoice numbers; giving *every* type its own counter is the
clean generalisation and lets each carry its own prefix (`INV-`, `PRO-`, `QUO-`,
`CN-`, `REC-`). Format, `{seq}` padding and the **yearly-reset toggle** are the
tenant's choice per type (`InvoiceNumberingSetting`, lazily seeded from
`DEFAULT_NUMBER_FORMATS`; default `resetYearly: true`, the MK/AL/XK + EU norm).
`year = 0` rows are the continuous-sequence bucket; `Invoice.numberYear` is null
then.

**Number assigned on first explicit Save.** A `DRAFT` invoice (the `4.2.6`
autosave buffer) has `number = null`; `status` flips to `ISSUED` and
`allocateInvoiceNumber` runs on the first real Save, inside the same transaction
as the invoice write so an abandoned draft leaves no gap. `InvoiceStatus` is
**not** payment state — paid/unpaid/overdue stay out of scope (spec §6).

**Rounding policy (`4.1.2`, formalising the D18 placeholder).** **Line-level,
half-up.** Each line: `subtotal = round(qty × unitPrice)`, then
`discount = round(subtotal × discountBp / 10000)`, then
`tax = round((subtotal − discount) × taxRateBp / 10000)`. Document totals are
plain integer sums of the already-rounded line amounts; the per-rate tax summary
sums line tax within each rate. This is the single implementation in
`packages/shared/src/render/invoice-math.ts` (`computeInvoiceTotals`) that both
the live preview and the server call — the server result is authoritative
(`4.2.3`). Document-level rounding (tax computed once on summed bases) was
rejected: it makes a line's printed tax not equal `base × rate`, which invoice
recipients query.

**Allocation bypasses the tenant-scope extension by design.**
`allocateInvoiceNumber` is the raw `INSERT … ON CONFLICT DO UPDATE … RETURNING`
that `db/tenant-scope.ts` anticipates; it carries an explicit `tenantId` and takes
the caller's transaction client.

**Consequences:**
- `packages/shared/src/invoice.ts` holds the wire shapes; `DOCUMENT_TYPE_FIELDS`
  there is the one table of per-type header/totals differences (`4.1.4`), shared
  by the form (`4.2.1`) and the validator.
- `InvoiceLineItem` carries no `tenantId` and is **not** in
  `TENANT_SCOPED_MODELS` — it is only ever reached through a tenant-scoped
  `Invoice` query, and is cascade-deleted with its parent (the parent is
  soft-deleted).
- Epic 4.2 builds the create/save service and the `POST /invoices` route on this
  model; Epic 4.5 the library list/query; a settings surface for
  `InvoiceNumberingSetting` is service-ready but unrouted until a consumer needs
  it.

---

## D21 — Invoice event log: what "created" and "edited" mean, and how append-only is enforced

**Decided (settles what `5.1.1`–`5.1.3` and spec §7 leave implicit — the spec
lists event kinds but not their timing against the draft→issued lifecycle):**

**`CREATED` fires at finalize, not at draft-row creation.** An invoice's draft
row is created lazily on the compose form's first autosave and may be discarded
without ever being issued; the user's mental model of "created" is the moment it
becomes a real, numbered document. `finalizeInvoice` emits `CREATED` — it is the
first entry in every issued invoice's timeline. There is deliberately no separate
"issued" event type (the `5.1.2` list has six, `CREATED` is it).

**`EDITED` fires only for an already-`ISSUED` invoice.** `saveInvoice` runs on
both a `DRAFT` (autosave, every ~1.2s while the form is open — `4.2.6`) and an
`ISSUED` invoice (a real post-issue edit / "start from scratch" re-design —
`4.4.2`). Only the latter is a user-meaningful edit; draft autosaves log nothing,
which also keeps the timeline from drowning in autosave noise.

**`DOWNLOADED` is one row per download.** Spec §7's "count" is `COUNT(*)` over the
rows, not a mutable counter — consistent with append-only. The what-if render from
the edit screen (`4.4.2`) still counts as a download; `metadata.withUnsavedEdits`
marks it.

**Append-only is enforced by module surface, not a DB trigger.** Consistent with
the other app-level invariants (the single default template, integer money):
`services/invoice-history-service.ts` is the only writer and exports insert-only.
A `BEFORE UPDATE OR DELETE` trigger was rejected because it would fight the
`onDelete: Cascade` used to clean a hard-deleted tenant's rows in tests/tooling.
Rows leave only by that cascade (invoices themselves are soft-deleted, D4).

**Logging is best-effort at the call site.** `tryRecordInvoiceEvent` swallows and
logs its errors: nothing branches on the event log for behaviour, so a missed
event is a display gap in the Epic 5.2 timeline, never a failed send / download /
save.

**Consequences:**
- `@invoice-saas/shared` `invoice-history.ts` owns `INVOICE_EVENT_TYPES` (mirrors
  the Prisma `InvoiceEventType` enum), the per-type `metadata` bag
  (`invoiceHistoryMetadataSchema`, `.strict()` — validated before every write),
  and `invoiceHistoryEventResponseSchema` for the Epic 5.2 read endpoints.
- `InvoiceHistoryEvent` is in `TENANT_SCOPED_MODELS`; `userId` is a plain column
  (not a `User` relation) so the write path stays a bare insert. Today
  `userId == tenantId` (D3) — kept distinct for a future multi-user tenant.
- Emit points wired in `invoice-service.ts` (`CREATED`, `EDITED`,
  `DUPLICATED_FROM/INTO`) and `pdf-service.ts` (`DOWNLOADED`, `SENT`).
  Smoke: `npm run history:check -w @invoice-saas/api`.
- **Epic 5.2 (done):** read side is `listInvoiceHistory` / `listActivity` /
  `summariseInvoiceHistory` in `invoice-history-service.ts`; `GET
  /invoices/:id/history` and a dedicated `GET /activity` router; web
  `features/history/`, `components/history/`, and
  `routes/dashboard/dashboard-page.tsx` (replaced the `/` placeholder). The
  dashboard is the activity feed only — **not** spec §7's fuller "library + trail"
  combined view, and the public-`/` + `/console/*` + `/admin/*` route restructure
  the user raised here is deferred to its own task (overlaps Epic 8).

---

## D22 — Entitlements resolution: Subscription rows are truth, `users.tier` is a cache

**Decided (Epic 6.1, resolves the open half of D14 — "column dropped or kept as a
cache"):** `Subscription` rows are the source of truth. `users.tier` is **kept**
as a denormalised cache that `lib/entitlements.ts` — and nothing else — writes.

`resolveEntitlements(userId)` is the one function (D19's seam, filled in):

1. Read every `Subscription` for the tenant on the unscoped client with an
   explicit `tenantId` (the seam also runs from auth/session contexts with no
   `req.db`; `Subscription` + `UsageCounter` are still in `TENANT_SCOPED_MODELS`
   as a guard against a stray `req.db` read).
2. Lazily flip `ACTIVE` rows whose `endDate` has passed to `EXPIRED` — the "do
   both" of `6.3.3`, so no scheduled job is required for correctness.
3. Effective tier = highest `tier` among rows that are `ACTIVE`, started, and not
   ended (decision D5, "most access wins"). No active row → `FREE`.
4. If `users.tier` differs, update it. Auth keeps reading the cache via
   `AuthUser.tier` with zero change; enforcement never trusts it.
5. Layer the `UsageCounter` meters: `lifetimeInvoicesGenerated` (monotonic,
   incremented in `finalizeInvoice`'s transaction — a soft delete never refunds
   a Free account's one invoice) and `aiGenerationsInPeriod` keyed by a
   `"YYYY-MM"` UTC month bucket (decision D6).

**Why a cache, not a drop:** dropping `users.tier` forces every session issue /
refresh to resolve subscriptions; keeping it means the write path is one `UPDATE`
inside a lookup that already had the tenant loaded, and `AuthUser` / the web's
gating hints keep working untouched. D14's real concern — "one reader, not
scattered `if (tier === …)`" — is satisfied either way.

**Config, not branches (decision D6):** the per-tier numbers live in `PLAN_RULES`
(`lib/entitlements.ts`) and `@invoice-saas/shared` `billing.ts`
(`PLAN_CATALOG`, `FREE_INVOICE_LIFETIME_LIMIT`, `PREMIUM_AI_MONTHLY_LIMIT`) — the
web reads the same catalog for the pricing table so a limit can't drift between
enforcement and display.

**Consequences:**
- `6.2` webhook handler and `6.3` admin grant flow only ever write `Subscription`
  rows; they never touch `users.tier` — the next entitlement lookup reconciles it.
- `GET /billing/entitlements` returns the shared `Entitlements` shape for the web.
- Gated endpoints: `requireCanCreateInvoice` (invoice create / finalize /
  duplicate), `requireCanManageTemplates` (`/templates` writes),
  `requireCanUseAi` (Phase 7 seam). Smoke: `npm run entitlements:check`.

---

## D23 — Stripe integration shape (Epic 6.2)

**Decided.** Card subscriptions run through a thin Stripe port and one webhook
handler; the rest of the app never touches Stripe.

- **Port:** `apps/api/src/lib/billing/` is the only place the `stripe` package is
  imported. `stripe.ts` builds one client, or `null` when `STRIPE_SECRET_KEY` is
  unset — the app still boots and `/billing/checkout` + `/billing/portal` return
  503 (same "degrade, don't crash" shape as the `Mailer` D13 / `Storage` D15
  ports). `GET /billing/config` tells the web whether to show or disable the
  checkout CTAs.
- **Catalog (6.2.1):** one Stripe Product per plan, one recurring EUR Price each
  with a stable `lookup_key`. `npm run stripe:setup` provisions them + a Customer
  Portal configuration, idempotently. Prices resolve by lookup_key at runtime;
  `STRIPE_PRICE_*` env vars optionally pin exact ids. Amounts come from
  `@invoice-saas/shared` `PLAN_CATALOG` (minor units).
- **Checkout (6.2.2):** `mode: 'subscription'` Checkout Session, no
  `payment_method_types` (dynamic methods), one `cus_` per tenant carrying
  `metadata.userId`. The subscription is created by the webhook, never trusted
  off the success page.
- **Webhook (6.2.3):** mounted with `express.raw` **before** `express.json()`, no
  auth — the signature is the auth (`stripe.webhooks.constructEvent`).
  Idempotent via a `processed_stripe_events` row claimed before any work.
  `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`,
  `invoice.{paid,payment_failed}` all funnel through one `upsertFromStripe` that
  writes a single `Subscription` row per `stripeSubscriptionId` and then calls
  `resolveEntitlements` to refresh the `users.tier` cache (D22). The handler
  bypasses the central `errorHandler`: Stripe needs specific status codes
  (2xx ack / 400 permanent / 5xx retry).
- **Grace period (6.2.5):** mirror Stripe dunning — no timer of our own.
  `invoice.payment_failed` → `PAST_DUE`, which **still grants access** (the
  entitlement service treats `ACTIVE` and `PAST_DUE` as granting). Stripe's Smart
  Retries schedule *is* the grace window; it ends with
  `customer.subscription.deleted` → `CANCELED`, and the next lookup drops the
  tenant to Free.
- **Plan changes / cancellation (6.2.4):** the Customer Portal, not our UI. Any
  account with a `stripeCustomerId` (`entitlements.canManageBilling`) gets a
  "Manage billing" button; plan-switch / downgrade CTAs route there rather than
  opening a second Checkout.
- **Schema:** `users.stripeCustomerId` (unique); `subscriptions` gains
  `stripeSubscriptionId` (unique), `stripePriceId`, `currentPeriodEnd`,
  `cancelAtPeriodEnd`; new `processed_stripe_events`. Migration
  `20260831000000_stripe_billing_linkage`.
- **API version:** left at the SDK default (no `apiVersion` pin) — pinning a
  string the installed SDK's types don't know breaks the build. A hardening pass
  can pin it once the SDK is upgraded in lockstep.
- **Verification:** `npm run stripe:check` drives the webhook service against real
  sandbox subscription objects (create → upgrade → past_due → cancel-at-period-end
  → deleted, idempotency, signature round-trip); a live `stripe listen` run
  confirmed the raw-body HTTP path.

---

## D24 — Manual (cash) grants: a Subscription row + a minimal admin API (Epic 6.3)

**Decided.**

- **A manual grant is just a `Subscription` row** with `source: MANUAL`,
  `status: ACTIVE`, and a fixed `[startDate, endDate]` window (anchored to full
  UTC days). No new table, no new resolution path — the entitlement service
  (D22) already picks the highest tier across every granting row, so a manual
  grant overlapping a Stripe sub "just works" (settles 6.3.5; both rows kept).
  Two new nullable columns: `note` (cash context) and `grantedByUserId` (the
  acting admin — a lightweight audit trail until 8.1.2's `AdminAuditLog`).
- **Admin surface = API only this epic** (user decision). `POST` / `PATCH` /
  `DELETE /admin/grants` + `GET /admin/grants?email=`, behind a new
  `requireAdmin` middleware (`users.role === 'ADMIN'`, re-read from the DB every
  call so a revoked admin loses access before their JWT expires — pulls 8.1.1
  forward, minimally). The grant *form* (6.3.2) is deferred to the Epic 8 admin
  center; `npm run grant` / `npm run set-admin` are the interim tools.
- **Tenant lookup by exact email** — no search endpoint (8.3.1 builds the real
  tenant list). Unknown email → 404.
- **Expiry: lazy + cron, no in-process timer.** `resolveEntitlements` flips
  lapsed granting rows to `EXPIRED` on read (correctness); `sweepExpiredGrants()`
  / `npm run grants:expire` is the crontab companion for dormant tenants. Only
  `source: MANUAL` rows — Stripe lifecycle stays the webhook's.
- **Revoke keeps the row** (`CANCELED` + `endDate: now`), never deletes it.
- **`manual-grant-service.ts`** is the only writer of `MANUAL` rows; it runs on
  the unscoped client with an explicit `tenantId`, like the rest of the billing
  seam. Smoke: `npm run grants:check`. Migration
  `20260831010000_manual_grant_fields`.

---

## D25 — AI drafting backend shape (Epic 7.1)

**Decided:** the AI invoice-drafting backend ships as a **port + null adapter**
plus all the surrounding logic; the concrete LLM provider (`7.1.1`) is deferred.

- **`AiDrafter` port** (`apps/api/src/lib/ai/`), same "pluggable adapter, degrade
  don't crash" shape as `Mailer` (D13), `Storage` (D15) and billing (D23). Only
  implementation today is `NullDrafter` → `/ai/draft-invoice` returns **503**
  (not a boot-throw: AI is a paid add-on, so unconfigured is a valid degraded
  state, like billing with no Stripe key). Wiring Anthropic or OpenAI later is one
  new class + a one-line swap in `lib/ai/index.ts`; `ai-draft-service.ts` never
  changes. Provider choice is in **Still open**.
- **Structured output** (`aiExtractionSchema`, `@invoice-saas/shared/ai.ts`)
  carries **no computed money** — no subtotal/tax/grand-total/line-total fields
  exist. The model returns raw stated numbers (`unitPriceAmount: 150`,
  `quantity: 3`, `taxRatePercent: 18` only when the prompt states a rate); the API
  converts to integer minor units / bp and every derived total stays with the
  normal save path (guardrail `7.1.3`). Unknown keys are stripped, not rejected —
  a model that bolts on `total` doesn't trigger a pointless retry and the API
  never reads it.
- **Relative dates are UTC** (`7.1.5`, user decision). The model returns
  `dueInDays` (an integer offset), never an invented calendar date; the API
  resolves it against **today in UTC**. There is no per-tenant timezone column —
  revisit when a tenant TZ setting actually exists.
- **Validation + one retry** (`7.1.2`): a reply that fails `aiExtractionSchema` is
  re-requested once with a repair hint; a second failure is a graceful `502` with
  **no usage charged** (`7.1.8`).
- **Metering** (`7.1.6` / D6): `recordAiGeneration` runs only on a fully
  successful, schema-valid generation. Provider failure / unusable output charge
  nothing. The `403` when the monthly cap is spent happens before any model call.
- **Cost logging** (`7.1.7`): a new `AiGenerationLog` table (migration
  `20260831020000_add_ai_generation_log`), **one row per attempt** — successes,
  `INVALID_OUTPUT` and `PROVIDER_ERROR` alike — so the admin view (`8.4.1`) sees
  wasted spend. `costMicros` is integer USD-millionths (D17 style); an unpriced
  model logs `0`, never crashes. Written by `ai-draft-service.ts` on the unscoped
  client with an explicit `tenantId`, like the usage seam; in
  `TENANT_SCOPED_MODELS` as a guard for admin reads.
- **Client matching** (`7.1.4`): normalised Levenshtein (`lib/ai/fuzzy.ts`, no
  dep) with legal-form stripping; ratio ≥ `AI_CLIENT_MATCH_THRESHOLD` (0.82) →
  `matched`, else `new` with prefilled fields, else `none`.
- Smoke: `npm run ai:check -w @invoice-saas/api` (fake `AiDrafter`, 40+
  assertions). Frontend (Epic 7.2) is untouched by this.

**Extension (2026-09-01, closes `L1.2.2` — concrete adapters, still no key wired):**
Two selectable adapters landed behind the same port; the default build is
unchanged (`NullDrafter`, `/ai/*` 503s). Provider is chosen by `AI_PROVIDER`:

- **`anthropic`** → `ClaudeDrafter` (`lib/ai/claude-drafter.ts`) — an existing
  hosted model, intended for Claude Haiku. Needs `ANTHROPIC_API_KEY` + `AI_MODEL`
  (e.g. `claude-haiku-4-5`). Plain `fetch` against `/v1/messages`, **no
  `@anthropic-ai/sdk` dependency**; structured output is a forced single-tool call
  whose `input_schema` is `z.toJSONSchema(aiExtractionSchema)` (Zod 4 native).
- **`custom`** → `CustomDrafter` (`lib/ai/custom-drafter.ts`) — a self-hosted or
  self-built model on an **OpenAI-compatible `POST {AI_BASE_URL}/chat/completions`**
  (vLLM / llama.cpp / Ollama `/v1` / bespoke). Needs `AI_BASE_URL` + `AI_MODEL`,
  optional `AI_API_KEY`. Schema is embedded in the prompt + `response_format:
  json_object`.
- Shared prompt/schema builder in `lib/ai/prompt.ts` so both providers ask for
  exactly the same thing; only the transport differs. All guardrails / retry /
  metering / cost stay in `ai-draft-service.ts` — untouched.
- `config/env.ts` refuses to boot if `AI_PROVIDER` is named without its required
  vars. New: `npm run ai:provider-check` (one real `draft()` call + schema check
  when configured; asserts `NullDrafter` otherwise).
- Deliberately **not** wired to a live key here (owner will add one). `cost.ts`
  now prices the `claude-haiku-4-5` alias too; an unpriced custom model logs `0`.

---

## D26 — App i18n (Epic X.1): react-i18next, `en` as source of truth, UI vs invoice language split

**Decided:**

- **Stack.** `i18next` + `react-i18next` + `i18next-browser-languagedetector`, one
  `translation` namespace, three bundled locales in
  `apps/web/src/i18n/resources/{en,sq,mk}.ts`. `en` is the source of truth;
  `sq`/`mk` are typed `: typeof en` so TypeScript rejects a missing/extra key.
  `types.ts` binds `t()` keys to `typeof en`. Detector order:
  `localStorage` (`ui-language`) → `navigator`; `useSyncAuthLanguage` overrides
  with the server value once a session loads. SQ/MK strings are model-authored and
  carry a `TODO(i18n): needs native review` header — same posture as
  `render/labels.ts`.
- **UI vs invoice language (X.1.4).** `users.preferredLanguage` is **renamed** to
  `invoiceLanguage` and a new `uiLanguage Language @default(EN)` column is added
  (migration `20260831060000_split_ui_invoice_language`; `UPDATE … SET uiLanguage
  = invoiceLanguage` backfills existing tenants to one consistent language).
  `invoiceLanguage` seeds the invoice form's per-document `language`, feeds the AI
  drafter, and is echoed by `/profile`, `/auth/*` and `/admin/tenants/:id`.
  `uiLanguage` drives react-i18next and the auth emails
  (`apps/api/src/mail/index.ts` — an email is app chrome, not a document).
- **Formatting (X.1.5).** App-chrome `Intl` formatting goes through
  `i18n/format.ts` `useFormatters()`, bound to the active UI language. The invoice
  *document* keeps `packages/shared/src/render/format.ts`, keyed on the invoice's
  own language — untouched.
- **Lint enforcement.** `i18next/no-literal-string` in `jsx-text-only` mode on
  `apps/web/src` (excluding `i18n/resources/**` and `routes/dev/**`). The broader
  modes false-positive on Radix `value=`, route `path=`, motion variant names, so
  attribute / toast / Zod-message copy was converted by hand and is covered by
  review, not the rule.
- **Gate.** `npm run i18n:check` (`apps/web/scripts/i18n-check.ts`, run via `tsx`)
  checks key parity + `{{token}}` parity across the three locales and that the D9
  marker grep over `apps/` is clean. D9 is resolved.

**Not done here:** Zod validation messages in `packages/shared` stay English —
that's Epic X.7.12, a separate cross-cutting change; the lint rule stays scoped to
`apps/web/src`.

---

## D27 — Responsiveness (Epic X.2): per-surface layouts at Tailwind breakpoints, no automated gate

**Decided:**

- **Breakpoints.** Tailwind defaults, unchanged. `lg` (1024px) is the app's
  primary desktop/laptop line — the app shell, invoice form, invoice detail and
  template editor all switch their side-by-side layouts to stacked/tabbed below
  it. `md` (768px) is where data tables become cards. `2xl`-ish wide screens are
  handled once, in the shell (`max-w-[1600px]` on `<main>`), not per route.
- **Tables → cards (X.2.4).** A shared presentational `<RecordCard>`
  (`apps/web/src/components/ui/record-card.tsx`) — title node + `{label,value}[]`
  `<dl>` + actions slot. Each list route keeps its `<Table>` behind `hidden
  md:block` and adds a `md:hidden` `<ul>` of `<RecordCard>`, both mapped from the
  same `data.items`. The base `<Table>` primitive stays dumb (its job is just to
  never overflow — horizontal scroll); the card conversion lives at the screen
  level because column-to-field mapping is per-surface. Existing column `t()`
  keys double as card field labels, so X.2 added **zero** i18n keys.
- **Line items (X.2.3).** `line-items-editor.tsx` runs two layouts off one
  `NUMERIC_FIELDS` descriptor array (key + `t()` label + inputMode + placeholder)
  so the dense `md:` grid and the sub-`md` card stack can't fall out of sync.
- **Touch targets (X.2.6).** New/reworked controls get ≥40px hit areas; the
  app-wide icon button stays 36px (`Button size="icon"`, established by the mobile
  nav) rather than a churny global bump. No hover-only affordances — row actions
  are click `<DropdownMenu>`s; the lone disabled-button tooltip has a
  `tabIndex={0}` focus fallback.
- **No check script.** Unlike `i18n:check` / `render:check`, responsiveness has no
  meaningful headless assertion. X.2.1 is an emulated-viewport audit at 375 / 768
  / 1024 / 1600; X.2.7 (physical devices) is deferred to a pre-launch manual pass.

**Deliberate exception:** the pricing page's `PlanComparison` keeps a
`min-w-[34rem]` horizontal scroll on phones — a multi-plan comparison table is
conventional UX and not a data list.

---

## D28 — Animation (Epic X.3): one Motion preset file, GSAP reserved for the landing page

**Decided:**

- **Motion everywhere in-app; GSAP only for the marketing landing.** `motion`
  (v13, `motion/react`) is the sole animation library inside the authed app —
  modals, toasts, page transitions, list stagger, the template editor's drag
  reorder and switch feedback. `gsap` stays a dependency but has **zero call
  sites** until Epic X.6 builds the landing page's scroll sequence
  (`ScrollTrigger`); that is the only place a hand-built timeline is justified.
- **All configs live in `lib/motion-presets.ts`.** Components import
  `modal*`/`page*`/`list*`/`toast*`/`switchThumbSpring` rather than writing
  `transition`/`variants` inline, so timing reads as one system. X.3 added one
  preset (`switchThumbSpring`) and one component wrapper (`<RecordCardList>` in
  `ui/record-card.tsx`, carrying the stagger container variants).
- **List stagger applies to feed- and card-shaped surfaces, not dense data
  tables.** The dashboard activity feed, the templates grid, the invoice history
  timeline and the sub-`md` `<RecordCard>` lists stagger their items in on mount.
  The desktop `<Table>` on Clients / Products / Invoices does **not** — per-row
  stagger on a table that refilters on every keystroke reads as jank, not polish
  (X.3.5), and a wide table is taken in at a glance anyway. Stagger is mount-only
  (`initial`/`animate`, no `AnimatePresence` exit); stable React keys mean a
  refetch reconciles in place without re-running it.
- **`prefers-reduced-motion` stays the 0.4.5 three-layer setup**, unchanged:
  `MotionConfig reducedMotion="user"` (every `motion.*`), `getTransition()` (the
  presets' own durations), the `index.css` media block (non-Motion CSS). A spring
  needs no `getTransition` — `MotionConfig` collapses it to an instant snap.
- **Performance:** transform/opacity only, no `width`/`height`/`top` animation,
  `<Reorder>` uses Motion's FLIP. No automated jank gate — a physical-device
  profiling pass rides along with X.2.7's manual round.

---

## D29 — Privacy, legal & security (Epic X.4)

**Decided:**

- **Legal pages (X.4.1 / X.4.2) — placeholder structure, English body, own module.**
  `/privacy` and `/terms` are public routes rendered by `<LegalPage>` from
  `apps/web/src/routes/legal/legal-content.ts`. Content is **English-only** and
  deliberately outside react-i18next (same call as `render/labels.ts`): an
  unreviewed machine translation of a privacy policy can misstate a reader's
  rights, so SQ/MK show the EN text with a "translation being prepared" notice;
  the page chrome is translated. The body is real section structure (what's
  collected, legal basis, retention, sharing, transfers, your rights, cookies,
  changes, contact) with bracketed placeholders — `[COMPANY]`, `[JURISDICTION]`,
  `[CONTACT EMAIL]`, `[EFFECTIVE DATE]`, `[COMPANY ADDRESS]` — plus a visible
  "working draft pending legal review" banner. The placeholders and a legal review
  are resolved at brand sign-off; the structure is the deliverable now.
- **Footer.** New `<AppFooter>` (privacy / terms links + copyright) at the bottom
  of the app shell, the auth pages and the legal pages — reachable before signup.
- **Cookie consent (X.4.3) — two categories, opt-in analytics, no vendor yet.**
  `useConsent()` (`features/consent/`) persists `all | essential` in
  `localStorage['cookie-consent']` via a `useSyncExternalStore` mini-store;
  `<CookieConsentBanner>` (mounted in `App`, shows until decided). Strictly
  necessary storage (session cookie, `ui-language`, the consent value itself) is
  always on. `lib/analytics.ts` `initAnalytics()` is the **single seam** for a
  future analytics vendor and is gated on `analyticsAllowed()` (`=== 'all'`); it's
  a no-op today. `App` re-runs it when the consent choice changes, so opting in
  needs no reload.
- **Account deletion (X.4.4) — immediate, re-auth gated.** `DELETE /profile`
  (`account-service.ts` `deleteOwnAccount`): validate `deleteAccountSchema`
  (password + `confirmEmail`), `assertReauth` (verify password, case-insensitive
  email match), **cancel every live Stripe subscription first** — a failure there
  aborts with a 502 and the account survives, rather than orphan a paying sub —
  then delete the logo asset and one cascade `prisma.user.delete` (every child
  table is `onDelete: Cascade`; support tickets `SetNull`; `AdminAuditLog`
  unlinked and retained). Mirrors the admin `deleteTenant` path;
  `lib/billing/index.ts` gained `cancelAllSubscriptions`. Web: Settings → danger
  zone modal → `/login?deleted=1`.
- **Data export (X.4.5) — synchronous JSON.** `GET /profile/export`
  (`exportOwnData`) streams one `Content-Disposition: attachment` JSON blob:
  account (no `passwordHash`), clients, products, templates, invoices (+ line
  items + history), numbering, subscriptions, usage counter, AI logs —
  soft-deleted rows included (still their data). A tenant's dataset is bounded, so
  no job/pagination. Web: Settings → "Export my data".
- **Security pass (X.4.6).**
  - **Headers:** `helmet()` in `index.ts` with `contentSecurityPolicy`,
    `crossOriginResourcePolicy` and `crossOriginEmbedderPolicy` disabled — the API
    serves JSON + assets, not HTML, and the `/fonts` route must keep its own
    `cross-origin` CORP for the sandboxed preview iframe and the PDF pipeline.
    `app.set('trust proxy', 1)` for correct `req.ip` behind the VPS proxy. HSTS
    only in production.
  - **Rate limiting:** broadened from auth-only. `apiLimiter` (300/min/IP) on
    every route except `/health` and `/billing/webhook`; `expensiveLimiter`
    (20/5min/IP) on `/profile/export` and `DELETE /profile` (and available for AI
    / PDF).
  - **Input sanitization:** the render engine already escapes every value through
    `render/html.ts` `esc` / `escMultiline` (36 call sites in `blocks.ts`, no raw
    interpolation) — verified, unchanged. Zod validates every request body.
  - **File upload:** already hardened (`logo-upload.ts` MIME allow-list + size +
    `files:1`; `profile-service.setLogo` re-encodes through sharp, capping
    dimensions and stripping metadata; SVG excluded). Verified, unchanged.
  - **Cross-tenant isolation:** new `npm run security:check`
    (`scripts/security-check.ts`) — two throwaway tenants, drives the real
    `scopedPrisma` client and asserts tenant B cannot read/update/delete tenant
    A's rows and has `tenantId` forced to its own on create, while the unscoped
    client can see A's data (proving the scope is the guard). Passes.
- **Backups & secrets (X.4.7) — runbook, ops-deferred.** No server exists yet
  (D1). `docs/backup-and-secrets-runbook.md` specifies encrypted nightly
  `pg_dump` (age, off-box, versioned bucket), asset tarball, restore-test
  cadence, the secret inventory (keyed to `env.ts`), `.env` handling (`0600`,
  never committed, password-manager as source of truth), least-privilege DB role,
  and `JWT_ACCESS_SECRET` rotation. Executed as part of `0.3.1` when the VPS is
  stood up.

**Not done here:** real legal copy and the brand/entity placeholders (legal
sign-off); an analytics vendor and its `initAnalytics()` body; wiring the backup
cron (needs the VPS). SQ/MK legal translations wait on a native + legal review,
same posture as the X.1.2 UI bundles.

---

## D30 — Testing & monitoring (Epic X.5)

**Decided:**

- **Vitest for unit + fast integration tests.** Added at the repo root
  (`vitest.config.ts`, projects `shared` + `api`). `npm test` = `vitest run`.
  Pure-logic tests are `*.test.ts` next to the source; DB-backed ones are
  `*.integration.test.ts` and hit the local Postgres in `apps/api/.env` (D2) —
  `apps/api/vitest.setup.ts` loads that env before `config/env.ts` validates it.
  The existing `apps/api/scripts/*-check.ts` scripts stay as-is (broader live-DB
  smoke checks); `npm run check:db` runs them in sequence. Not Node's built-in
  runner — Vitest resolves the workspace's `.js`-specifier TS imports and the
  `@invoice-saas/shared` alias (to source, not `dist`) with no extra config, and
  gives coverage.
- **What's tested (X.5.1 / X.5.2 / X.5.4).** money round-trips + rejection;
  `computeInvoiceTotals` rounding policy pinned to D20 (line-level half-up, order
  subtotal→discount→tax); `formatInvoiceNumber` rendering; the atomic number
  *allocation* proven gapless + per-`(type,year)` + gap-free on transaction
  rollback; the entitlement capability grid (FREE/BASIC/PREMIUM can/can't); PDF
  rendered for every `paperSize × language` and asserted on physical page
  dimensions + surviving localized text (structural snapshot, not pixel).
- **Playwright for E2E + a11y (X.5.3 / X.5.6).** `apps/web/playwright.config.ts`;
  `webServer` boots the API (`npm run dev:api`, real local Postgres) and the Vite
  dev server. One happy-path flow (signup → profile → client → invoice → download
  → send). A "setup project" (`e2e/auth.setup.ts`) signs up + onboards once and
  saves the session for the authed a11y scans. `global-teardown` deletes the
  `e2e-*@example.test` tenants. `PW_REUSE=1` skips the boot.
- **a11y gate scans the light theme**, failing on serious/critical axe violations
  only. The first run surfaced two real bugs, both fixed here:
  1. **The app rendered dark for everyone.** `index.css` wrapped a second `@theme`
     block in `@media (prefers-color-scheme: dark)`; Tailwind v4 hoists every
     `@theme` block's variables to `:root` unconditionally, so the media query did
     nothing. Fixed by making the dark palette a plain `:root` override inside the
     media query.
  2. **`--color-primary` (blue-600) failed WCAG AA** as `text-primary` on the
     `bg-primary/10` active-nav tint (4.48:1). Moved to blue-700 (`#1d4ed8`),
     which clears every use (button fill, links, tinted nav); blue-600 stays as
     the focus `ring`. A dark-mode contrast sweep is a tracked follow-up
     (`docs/testing.md`).
- **Monitoring (X.5.5) — Sentry SDK env-gated, uptime is ops.** `@sentry/node` /
  `@sentry/react` (MIT; Sentry Developer plan is free). `lib/observability.ts` in
  each app: no-op without a DSN, same shape as the Stripe/Mailer/Storage ports.
  API reports genuine 5xx from the central error handler; web dynamically imports
  the SDK only when `VITE_SENTRY_DSN` is set (no bundle cost otherwise) and the
  root error boundary forwards to it. No PII, errors only. Uptime monitoring is a
  free external probe of `/health` (exempt from rate limiting), wired when the VPS
  exists — documented in `docs/testing.md`.

**Not done here:** CI wiring (0.3.4 — needs Postgres + Chrome in CI); the
dark-mode a11y contrast pass; a real Sentry DSN / uptime monitor (need the
deploy).

---

## D31 — UI states per surface (Epic X.7)

**Context:** the five-state primitives (Epic 0.4b) plus the discipline of routing
every list/detail screen through `<QueryBoundary>` and every mutation through the
toast system meant most of X.7 was already satisfied as each feature shipped
(Phases 4–8, Epics X.1–X.5) — X.7.3/4, 10, 11, 14, 15, 17, 18, 21, 25 in
particular carry explicit `X.7.*` markers written at build time. This decision
records the gap-closing pass and the deliberate non-actions.

**Decided:**

- **404 / 403 (X.7.19) — one `RouteStatusPage`.** `components/state/route-status-page.tsx`,
  `status: 404 | 403`. i18n'd (`routeStatus.*`, en/sq/mk). Rendered *inside* the
  shell (the `*` route) so nav stays usable; offers "Go back" when
  `window.history.length > 1` and always "Go to dashboard". Distinct from
  `<ErrorState>` — a router/API *answer*, not a retryable failure, so recovery is
  navigation. The 403 variant has no in-app caller yet: the one permission gate
  (FREE tier reaching the template editor) deliberately redirects to the list with
  an upsell instead — a friendlier gate (X.7.17), not a wall.
- **Zero line items (X.7.7) — placeholder row in the shared renderer.**
  `render/blocks.ts` renders one muted centred row (`labels.lineItemsEmpty`,
  trilingual) spanning the table when `lineItems` is empty, rather than a bare
  `<tbody>`. Done in the shared render fn (D18), not the React preview, so preview
  and PDF can't diverge; a saved/issued invoice always has ≥ 1 line so the PDF
  path never reaches it.
- **Template editor loading (X.7.2) — `SkeletonTemplateEditor`.** A controls rail
  + a paper-proportioned `SkeletonInvoicePreview` at the editor's real `lg` split,
  replacing the `SkeletonForm` that made the screen collapse then jump to a
  two-pane layout. Controls mount only after the config resolves.
- **Dev state-forcing (X.7.27) — `?force=` URL param, not network throttling.**
  `components/state/force-state.ts` overrides a `<QueryBoundary>`'s result with
  `loading | error | empty | refetching`, globally or scoped `?force=empty:invoices`
  by a new optional `name` prop. Guarded by `import.meta.env.DEV` so it (and its
  `HttpError` import) drop from production. Documented on `/dev/states`. Chosen
  over a network-throttle helper because it also exercises the *empty* and
  *refetching* branches, which throttling can't, and needs no fixture wiring.
- **Per-screen audit (X.7.26) — `docs/ui-state-audit.md`.** Every screen × five
  states, a verified column, and explicit ➖ reasons. It's the checklist that
  gates a milestone ship.

**Deliberate non-actions:**

- **No in-app past-due / subscription-lapsed banner (X.7.16).** D23 put the
  past-due window on Stripe dunning; the web entitlements schema doesn't expose
  `PAST_DUE` and access simply continues, then drops to FREE on final
  cancellation. Adding a banner would mean a schema + resolver change against a
  settled decision. Checkout failure, cancellation and card-decline (returns as a
  cancel) are all handled.
- **X.7.24 partial CSV export → N/A.** `exportInvoicesCsv` serialises plain
  denormalised columns; there's no per-row operation that can partially fail.
  Flagged to revisit if an export ever gains per-row rendering.
- **Admin surfaces (X.7.1 tenant-list skeleton, X.7.8 no-data charts, X.7.9
  manual-grant success, X.7.20 admin overview) — deferred.** Phase 8 shipped
  backend only; these get rows in the audit when the admin UI exists.

**Verification:** `npm run typecheck`, `npm run lint`, `npm run i18n:check`
(615 keys), `npm test` (53), `npm run render:check` (18 combos) all green.

---

## D32 — Route restructure + marketing surface (Epic X.6)

**Context:** `/` was the authed dashboard; there was no public page. The user
asked for the split that had been deferred: **`/` public marketing · `/console/*`
signed-in app · `/admin/*` admin center.** Done here rather than as a separate
task because X.6 needs a home for the landing page anyway.

**Decided:**

- **Three areas, one `RequireAuth`.** `App.tsx`: `/` → `LandingPage` (public);
  a single `<Route element={<RequireAuth />}>` wraps `/onboarding`, `/console/*`
  (`ConsoleLayout` = the old `AuthedLayout`, shell + onboarding gate) and
  `/admin/*` (`AdminLayout` = shell-less, `role === 'ADMIN'` or a 403). Console
  children use **relative** paths under `/console`. Two `*` catch-alls: one inside
  `/console` (shelled 404), one top-level (bare 404). `docs/route-map.md` is the
  reference.
- **Every internal link repointed.** `nav-items.ts`, `<Link to>` / `navigate()` /
  `<Navigate>` across ~12 screens, the signup / verify-email / onboarding success
  redirects, and `RouteStatusPage`'s home button (now session-aware: `/console`
  vs `/`). `safeNextPath` default moved from `/` to `DEFAULT_AUTHED_PATH`
  (`/console`) and a bare `/` `next` collapses to it. **API paths untouched** —
  `apiFetch('/invoices')` etc. still hit the API origin.
- **`/admin` is real but empty.** Phase 8 shipped backend-only; `AdminHomePage`
  says so plainly and links back to `/console`. The route + role guard exist so
  the admin UI (future) has a home and a mistyped `/admin` reads clearly.
- **Landing page (X.6.1–X.6.4).** `routes/marketing/landing-page.tsx`, **lazy-
  loaded** so GSAP + the page land in a separate ~47 KB-gz chunk, never the app
  bundle. Sections: header (name + shared `<LanguageSwitcher>` + Log in / Get
  started), hero with a live default-preset `<TemplateThumbnail>`, 4-up feature
  strip, 3-preset showcase (real shared-render thumbnails), `PLAN_CATALOG`-driven
  3-tier pricing, closing CTA, `<AppFooter>`. All copy via react-i18next
  (`landing.*`, `admin.*` in en/sq/mk).
- **GSAP for scroll reveals (X.6.2), `motion` everywhere else.** `gsap` +
  `ScrollTrigger` registered in the landing module only (upholds the D28 "gsap
  reserved for the landing" line). A `<Reveal>` wrapper runs one `gsap.from` per
  section through `gsap.context()`; `disabled` is wired to `useReducedMotion()`
  so `prefers-reduced-motion` renders everything static with no GSAP at all.
- **SEO (X.6.3).** `useLandingSeo()` sets `document.title` + `description` /
  `og:*` / `twitter:*`, re-running on language change. `index.html` got a static
  `<title>` + description + `theme-color` for first paint / crawlers.
  **Update (L1.3, 2026-09-01):** `apps/web/public/og-image.png` (1200×630, on-brand
  placeholder) now exists, and `index.html` carries a **static** OG/Twitter block
  (EN copy) so non-JS social scrapers get a card — `useLandingSeo()` reuses those
  tags for per-locale copy on JS clients. Headless-Chrome verified across EN/SQ/MK;
  image resolves 200 · image/png · 1200×630. Real-platform card preview + an
  absolute image URL are `V1.5.4` (need the domain). A hand-designed image can
  still replace the placeholder.

**Verification:** `npm run typecheck` · `npm run lint` · `npm run i18n:check`
(661 keys) · `npm test` (53) · `npm run build` (landing splits to its own chunk) ·
e2e `happy-path` (full signup→onboarding→`/console`→invoice→send) and `a11y`
(13 screens incl. `/` and every `/console/*`) all green.

## D33 — Transactional email provider: Resend (closes D13 / `4.3.4` / L1.1.1)

**Decided:** the concrete `Mailer` (D13) is **Resend**. `ResendMailer`
(`apps/api/src/mail/resend-mailer.ts`) is the only file that imports the `resend`
SDK; `mail/index.ts` selects it when `RESEND_API_KEY` + `MAIL_FROM` are set and
falls back to `ConsoleMailer` otherwise. No call site changed.

**Why Resend over Postmark / SMTP:**
- **Permanent free tier** (3,000 emails/month, 100/day) — not a time-limited
  trial. Postmark's free tier is 100 test-only messages; SMTP needs a mail server
  we do not have.
- **Onboarding sandbox sending domain** (`onboarding@resend.dev`) works from
  localhost with no domain of our own — enough to build and verify L1.1.3 now.
- First-class **attachment** support (the invoice PDF rides along as
  `MailAttachment`), single HTTP call, `{ data, error }` return.
- Adequate deliverability for the Balkans + US on an authed domain; real
  SPF/DKIM/DMARC tuning on the production sending domain is **V1.5.3**.

**Consequences:**
- `RESEND_API_KEY` (`re_…`, optional) + `MAIL_FROM` (required whenever the key is
  set) added to `config/env.ts`, `.env.example`, backup-runbook §4. A
  `superRefine` fails boot if the key is present without `MAIL_FROM`.
- `mail/index.ts` still throws at boot under `NODE_ENV=production` when neither is
  set — the V1 config flip is just providing both.
- The Resend SDK reports failures via a returned `error` field, so `ResendMailer`
  throws on it; `sendInvoice` (pdf-service.ts) already turns any throw from
  `mailer.send()` into the "PDF generated but email could not be sent" 502
  (L1.1.4 / X.7.15) — no new code there.
- Switching provider later (e.g. to SMTP on the VPS) is still one new `Mailer`
  class + the `createMailer()` line.

---

## D34 — Admin center UI: charting library is `recharts`, lazy + theme-aware (closes open decision C / `L2.1.3`)

**Decided:** the admin center's time-series charts (overview signups/day + month-end
MRR, `L2.2.2`; usage volume charts, `L2.5`) render through **`recharts`** — the
library the Phase 8 backend notes already assumed.

**Why recharts over a hand-rolled SVG / Visx / Chart.js:**
- Declarative React components, SSR-safe, no imperative canvas lifecycle to manage
  inside the SPA. Matches how every other view in `apps/web` is written.
- `ResponsiveContainer` covers the `X.2` responsive requirement for free.
- Small enough to isolate in its own chunk; big enough that we do not want it in
  the base admin bundle.

**Consequences:**
- Added to `apps/web/package.json` (`recharts`). It is imported **only** from
  `apps/web/src/components/admin/admin-chart.tsx`, which is itself `React.lazy()`
  behind `<Suspense>` — so the chart bundle is code-split and never lands in the
  console or marketing chunks. `npm run build` emits it as a separate file.
- `admin-chart.tsx` is the single wrapper: it reads the active theme
  (`data-theme` / `prefers-color-scheme`, the same seam `X.5` set up) and passes
  CSS-variable-derived colours to recharts, so charts track light/dark like the
  rest of the app. Animation is disabled under `prefers-reduced-motion`
  (`isAnimationActive={!reduced}`).
- Every admin metric/list stays its own TanStack Query behind `<QueryBoundary>`
  (`X.7.20`), so a slow or failing chart series never blanks the headline numbers.

## D35 — Session strategy for launch: ratify `D12`, no changes (closes `1.1.1` / `L3.7.1`)

**Decided:** the model in `D12` (15-min access JWT + 30-day rotating opaque refresh
token, hashed at rest, reuse-detection, revoke on logout / password-reset / disable /
delete) **is the launch answer. Nothing changes for launch.** The four questions
`L3.7.1` left open are answered as follows:

- **Idle timeout → keep the effective 30-day sliding window.** A refresh token's
  `expiresAt` is fixed when it is issued, and every `POST /auth/refresh` mints a
  fresh 30-day token — so a session used at least once every 30 days lives on, and
  one untouched for 30 days is dead. That *is* the idle timeout. 30 days fits a B2B
  invoicing cadence (many tenants invoice monthly); a shorter idle window would log
  out legitimate monthly users. `JWT_ACCESS_TTL_SECONDS` (900) and `REFRESH_TTL_DAYS`
  (30) stay env vars, so either can be tightened per-environment with no code change.

- **Absolute maximum lifetime → adopt a 90-day cap, as a post-launch fast-follow
  (not launch-blocking).** Today rotation extends a session indefinitely. A cap that
  forces re-authentication 90 days after the *initial* login, regardless of activity,
  bounds the one case reuse-detection misses — a stolen refresh cookie whose holder
  rotates in lock-step with the victim and is never caught. Sketch: add
  `RefreshToken.sessionStartedAt` (set to `now()` at login/signup, copied forward
  unchanged on each rotation); in `rotateRefreshToken` return the normal
  "session expired" 401 once `now - sessionStartedAt > 90d`. ~20 LOC + one migration
  + a test. Launching without it is acceptable: the 15-min access token, rotation +
  reuse-detection, and full server-side revocation already cover the realistic
  threats, and the app stores invoices, not payment credentials or heavy PII.

- **"Remember me" → no.** One 30-day window for everyone. A B2B tool is used almost
  entirely from the user's own device; a per-login TTL toggle is a schema flag + UI
  for little real gain, and `POST /auth/logout` plus the `httpOnly` cookie already
  cover the shared-computer case. Revisit only if support signal shows kiosk usage.

- **Concurrent-session cap → no.** Single-user tenants (`D3`) legitimately run
  laptop + phone + tablet at once; a cap would break that. The better direction is
  an **"active sessions" screen with per-device revoke** — `refresh_tokens.userAgent`
  / `.ip` were added for exactly this (see the schema comment). Recorded as a
  post-launch feature, not a v1 requirement.

**Why ratify rather than harden now:** `D12`'s model is already stronger than a
typical v1 (rotation, reuse-detection, hash-at-rest, short stateless access token,
every revocation hook wired). The remaining gaps are defense-in-depth, and `L3` is
about verifying the launch posture, not expanding it. The 90-day cap is the one
change worth making early; it is written up above so it is a scoped follow-up, not
a fresh investigation.

## Still open

- **Nothing blocks `0.2.2` now.** Postgres is running locally and verified; the VPS
  checks from the earlier managed-hosting revision no longer apply — a VPS has root, so
  Postgres and Chrome are both just installed, not discovered.
- **Transactional email provider — decided (`D33`): Resend.** `ResendMailer` is
  wired behind `RESEND_API_KEY` + `MAIL_FROM`; `ConsoleMailer` stays the default
  for `npm run dev` + CI. Still owed: a real send verified against a test inbox
  (L1.1.3) and domain auth on the production sending domain (V1.5.3).
- **Cloud file storage backend:** S3 / Cloudflare R2 / VPS volume (D15). The `Storage`
  port and `LocalDiskStorage` are in place; the concrete cloud store is picked when
  single-box hosting stops being enough (not before deploy).
- **AI provider for drafting (`7.1.1`, D25) — adapters built (`L1.2.2`), no key
  wired.** Two selectable adapters exist behind the port: `AI_PROVIDER=anthropic`
  (`ClaudeDrafter`, for an existing hosted model like Claude Haiku) and
  `AI_PROVIDER=custom` (`CustomDrafter`, an OpenAI-compatible endpoint you run).
  Default build is still `NullDrafter`. Owner adds a key + `AI_MODEL` to switch it
  on; `npm run ai:provider-check` verifies the pick. Rate-limit / monthly-cap
  verification against a real provider (`L1.2.3`) and the failure-UX eyeball
  (`L1.2.4`) are still owed.
- **Route restructure — done (`D32`, Epic X.6).** Public marketing `/`,
  `/console/*` for the authed app, `/admin/*` for the admin center.
  `docs/route-map.md`. The `/admin/*` screen set is being built now (Phase L2) on
  top of the already-complete Phase 8 backend.
- **Admin charting library — decided (`D34`): `recharts`,** lazy-loaded and
  theme-aware, imported only from `components/admin/admin-chart.tsx`.
