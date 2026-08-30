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

- **Nothing blocks `0.2.2` now.** Postgres is running locally and verified; the VPS
  checks from the earlier managed-hosting revision no longer apply — a VPS has root, so
  Postgres and Chrome are both just installed, not discovered.
- **Transactional email provider:** Resend vs Postmark vs Hostinger SMTP (`4.3.4`).
- **Session strategy:** cookie session vs JWT + refresh (`1.1.1`).
