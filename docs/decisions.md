# Architecture Decisions

Answers to "Open decisions to make before building" in `invoice-saas-backlog.md`, plus
anything else locked in along the way. Backlog task `0.2.1` requires the hosting/DB
decision to be documented — this is that document.

---

## D1 — Hosting: Hostinger, deploy-from-GitHub Node environment

**Decided (revised 2026-08-30):** Hostinger's managed "deploy app from GitHub" Node
environment. **No VPS**, no SSH-administered box.

**Supersedes:** the earlier D1, which chose a Hostinger VPS. That decision is void; the
consequences below replace it entirely.

**Consequences:**
- Deployment (`0.3.1`) is a git push, not PM2 on a box we administer. PM2 drops out of
  the plan; the platform owns process supervision and restarts.
- `0.3.4` (CI) shrinks: GitHub Actions runs lint/typecheck/build, the platform does the
  deploy. No deploy keys or rsync step to write.
- `0.3.3` (staging vs production) becomes two apps fed from two branches, not two ports
  on one machine.
- `0.3.5` (backups) can no longer be a cron job we own. Whatever the managed database
  offers is what we get, plus a scheduled logical dump run from CI if it is not enough.

**Two things this decision puts at risk. Both must be checked on the real plan before
`0.2.2` writes a migration and before Epic 4.3 is planned:**

1. **Postgres availability (blocks D2).** The backlog's own rule is "VPS → Postgres,
   shared hosting → MySQL". Managed Node hosting on Hostinger has historically paired
   with MySQL; Postgres has been a VPS feature. If Postgres is not offered on this plan,
   either D2 flips to MySQL — losing `jsonb` for the template config (`3.1.1`), which
   then becomes a `JSON` column with weaker querying — or the database is hosted
   externally (Neon, Supabase, Railway) and only the app runs on Hostinger.
   **Check:** does the plan expose a Postgres instance or a `postgres://` connection
   string? If not, decide database-elsewhere vs MySQL before the first migration.

2. **Puppeteer / headless Chrome (the backlog's #1 risk, Epic 4.3).** A managed Node
   environment typically forbids installing Chrome's system libraries
   (`libnss3`, `libgbm1`, `libasound2`, …), and `npm install puppeteer` succeeding is
   not proof Chrome will launch. This is precisely the risk row "if shared hosting
   can't run headless Chrome, you need a VPS — find out before you've built around it."
   **Check:** deploy the repo and run `npm run pdf:smoke` in the platform's shell or as
   a one-off command. See `puppeteer-hosting-runbook.md`.
   **If it fails,** the fallback is not a VPS-shaped retreat: PDF generation moves to a
   separate service that can run Chrome (a small container host, or a rendering API),
   called over HTTP by the API. The shared render function (`3.1.2`) stays the single
   source of HTML either way, so this stays an infrastructure swap and never becomes a
   second renderer.

**Why this is still a reasonable call:** everything in Phases 0–3 is a plain Node app
plus a database, none of which needs root. Only PDF generation does. Trading a box we
have to patch, secure and babysit for a git-push deploy is worth it if the one heavy
operation can be isolated — and it can, because it is one function behind one interface.

## D2 — Database: Postgres

**Decided:** Postgres.

**Consequences:**
- `jsonb` is available for the template config blob (`3.1.1`) — schema-versioned JSON,
  queryable if we ever need it.
- Integer minor units for money map to `bigint` / `integer` columns; never `float` or
  `money`. Rounding rules documented once in `4.1.2`.
- Gapless per-tenant invoice numbering (`4.1.3`) uses a sequence table row locked with
  `SELECT ... FOR UPDATE` inside the same transaction as the insert — not a Postgres
  `SEQUENCE`, which is explicitly gappy on rollback.
- Migration tool: **Prisma** — see D11.
- **Conditional on D1's check #1.** Postgres is the choice; whether the chosen
  Hostinger plan provides one is unverified. Prisma (D11) is what keeps that
  question cheap to answer late.

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

---

## Still open

- **Does the chosen Hostinger plan provide Postgres, and can it run headless Chrome?**
  The two checks in D1. Both are answered by deploying once and looking — neither needs a
  design decision first. Blocks the first migration (`0.2.2`) and the Epic 4.3 plan.
- **Transactional email provider:** Resend vs Postmark vs Hostinger SMTP (`4.3.4`).
- **Session strategy:** cookie session vs JWT + refresh (`1.1.1`).
