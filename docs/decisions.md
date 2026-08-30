# Architecture Decisions

Answers to "Open decisions to make before building" in `invoice-saas-backlog.md`, plus
anything else locked in along the way. Backlog task `0.2.1` requires the hosting/DB
decision to be documented — this is that document.

---

## D1 — Hosting: Hostinger VPS

**Decided:** Hostinger VPS (not shared hosting).

**Consequences:**
- Postgres is available (see D2).
- Puppeteer / headless Chrome can run server-side, so the PDF pipeline in Epic 4.3 is
  viable as specified. Still verify it on the actual VPS in Phase 0/1, not Phase 4 —
  this is the #1 risk in the backlog's risk table. Chrome needs its system libraries
  installed on the box; a working `npm install puppeteer` is not proof it will launch.
- Process management via PM2 (`0.3.1`), staging/production separation via environments
  on the same VPS or separate ports/domains (`0.3.3`).

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
- Migration tool (Prisma vs Knex) still open — see "Still open" below.

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

---

## Still open

- **Migration tooling:** Prisma vs Knex (`0.2.2`). Prisma gives typed access and easy
  migrations; Knex gives full control over the `FOR UPDATE` numbering transaction. Both
  workable — decide before the first migration is written.
- **Transactional email provider:** Resend vs Postmark vs Hostinger SMTP (`4.3.4`).
- **Session strategy:** cookie session vs JWT + refresh (`1.1.1`).
