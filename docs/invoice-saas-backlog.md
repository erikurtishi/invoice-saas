# Invoice Generator SaaS — Project Backlog

Companion to `invoice-saas-spec.md`. Every feature in the spec is broken into epics and
tasks with acceptance criteria, ordered into phases that each end in something shippable.

---

## 0. Conventions

**Progress markers:** `[x]` done · `[~]` partially done, see the note on the line ·
`[ ]` not started. Architecture decisions referenced as `D1`…`D11` live in
`decisions.md`.

**Task ID format:** `PHASE.EPIC.TASK` — e.g. `2.3.4`
**Sizes:** S = under half a day · M = 1–2 days · L = 3–5 days · XL = over a week (should be split)
**Every task is done when:** code merged, works on all four breakpoints, strings passed
through i18n (no hardcoded English), and **all five UI states are implemented** (see below).

### The five UI states — mandatory on every data-bearing surface

No screen, list, form, panel, or async action ships with only its happy path. Every one of
these must be designed and built:

| State | What it is | Rule for this project |
|---|---|---|
| **Loading / Static** | Initial placeholder while data is fetching | **Skeleton loaders** that match the real content's shape — not centered spinners. Spinners only for actions inside a button (saving, sending). Never a blank screen, never a layout that jumps when data arrives. |
| **Empty (Blank)** | Valid screen with zero data — new account, no search results, no clients yet | Distinguish **"nothing yet"** (onboarding tone + primary CTA: "Create your first client") from **"nothing found"** (search/filter tone + "Clear filters" action). These are different states with different copy — never reuse one for the other. |
| **Success** | Confirmation that an action completed | Toast for transient actions (saved, duplicated, deleted), inline banner for form saves, explicit confirmation screen/state after Send. Always says *what* succeeded, never just "Success." |
| **Error** | Network failure, server error, invalid input, permission denied | Red/warning styling, plain-language message, and a **recovery action** (Retry, Go back, Fix field). Never a raw error code or stack trace. Distinguish: field validation (inline, under the input), request failure (in-place with retry), fatal (error boundary). |
| **Partial / Imperfect** | Some content loaded, some didn't; or data is degraded | Render what succeeded, mark what failed in place with its own retry — never fail the whole page because one widget errored. Also covers: AI returned incomplete fields, PDF generated but email send failed, dashboard where one metric couldn't load. |

**Implementation rule:** TanStack Query gives you `isPending` / `isError` / `data` /
`isFetching` / `isPlaceholderData` for free. Wire the states off those — do not invent
parallel loading booleans. Every list/detail surface uses a shared state-wrapper component
so states look and behave identically across the app.

### Frontend stack decisions (locked)

| Concern | Choice | Notes |
|---|---|---|
| Framework | React + TypeScript + Vite | |
| Styling | Tailwind CSS | |
| Server state | **TanStack Query** | All API reads/writes. No manual `useEffect` fetching anywhere. |
| Client state | React state / Context | Only for UI state (modals, editor draft). Never duplicate server state. |
| Forms | React Hook Form + Zod | Zod schemas shared with backend validation |
| Icons | **lucide-react** | Single icon source. No mixed icon libraries. |
| Routing | React Router | |
| Animation — UI | **Motion (motion.dev)** | Primary. React-native API, layout animations, gestures, small bundle. Use for: modals, page transitions, list reorder, toasts, micro-interactions. |
| Animation — complex | **GSAP** | Only where Motion is awkward: timeline-sequenced marketing/landing animations, ScrollTrigger, SplitText. Free for commercial use since April 2025, including all former Club plugins. (License note: prohibited use is building a *no-code visual animation builder* competing with Webflow — your template editor is a document designer, not an animation tool, so this doesn't apply.) |

**Animation rule:** do not use both libraries on the same component. Motion is the default;
GSAP is the exception, justified per use. All animation respects
`prefers-reduced-motion`.

### Responsive breakpoints (Tailwind)

| Target | Range | Priority |
|---|---|---|
| Phone | < 640px (`base`) | Must work — invoice creation and download |
| Tablet / iPad | 768–1024px (`md`/`lg`) | Must work well — editor usable |
| **Laptop** | **1024–1536px (`lg`/`xl`)** | **Primary target — must look great** |
| Wide / desktop | > 1536px (`2xl`) | Must look great — no stretched full-width layouts; max-width containers |

**Rule:** the template editor is the hardest responsive surface. On phone it collapses to
a stacked "edit panel → preview" tabbed view rather than side-by-side.

---

# PHASE 0 — Foundation

Goal: an empty but correctly wired app deployed to Hostinger.

## Epic 0.1 — Repo & tooling
- [x] `0.1.1` (S) Monorepo or two-repo decision; init Vite React TS frontend + Node backend
- [x] `0.1.2` (S) ESLint, Prettier, TypeScript strict mode, Husky pre-commit hooks
- [x] `0.1.3` (S) `.env` handling and config module for both apps; no secrets in repo
- [x] `0.1.4` (S) Install and configure: TanStack Query (with devtools), lucide-react, Motion, GSAP, Tailwind, React Hook Form, Zod
- [x] `0.1.5` (S) Set up TanStack Query `QueryClient` with sane defaults (retry, staleTime, error handling) and global error boundary

## Epic 0.2 — Database & backend skeleton
- [~] `0.2.1` (M) Choose Hostinger plan; VPS strongly preferred → Postgres. Shared hosting → MySQL. Document the decision.
  - *Decided and documented (`D1` hosting, `D2` database). **Partial**: hosting is the managed
    deploy-from-GitHub Node environment, not a VPS, so two things are decided but unverified —
    whether the plan offers Postgres, and whether it can run headless Chrome. Both are answered by
    deploying once; see `D1` and `puppeteer-hosting-runbook.md`.*
- [ ] `0.2.2` (M) Migration tooling (Prisma or Knex); initial schema for Tenant, User
- [~] `0.2.3` (S) Express/NestJS skeleton, health endpoint, request logging, CORS
  - *Done: Express skeleton, `GET /health`, CORS locked to `WEB_ORIGIN`. **Missing: request logging.***
- [ ] `0.2.4` (M) Multi-tenant strategy: every table carries `tenant_id`; a middleware injects the current tenant and every query is scoped to it. Write this once, centrally — never per-route.
- [ ] `0.2.5` (S) Standard API error shape + validation middleware using shared Zod schemas

## Epic 0.3 — Deployment
- [ ] `0.3.1` (M) Hostinger deployment for Node backend (PM2 or equivalent process manager)
- [ ] `0.3.2` (S) Frontend static build + serve; SPA fallback routing
- [ ] `0.3.3` (S) Domain, SSL, environment separation (staging vs production)
- [ ] `0.3.4` (M) CI: lint + typecheck + build on push; deploy on merge to main
- [ ] `0.3.5` (S) Automated DB backups — do this before you have real customer data, not after

## Epic 0.4 — Design system
- [ ] `0.4.1` (M) Design tokens: colors, spacing, radii, shadows, typography scale in Tailwind config
- [ ] `0.4.2` (M) Base components: Button, Input, Select, Modal, Toast, Card, Table, Tabs, Dropdown, Tooltip, Skeleton — all lucide-react icons, all responsive
- [ ] `0.4.3` (S) Layout shell: sidebar (desktop) / bottom nav or drawer (mobile), max-width container for wide screens
- [ ] `0.4.4` (S) Motion presets: shared transition configs (modal enter/exit, page fade, list stagger) so animation feels consistent
- [ ] `0.4.5` (S) `prefers-reduced-motion` global handling

### Epic 0.4b — UI state primitives (build these before any feature screen)

These are the reusable building blocks for the five states. Building them first means every
later feature gets correct states for free instead of ad-hoc ones per screen.

- [ ] `0.4b.1` (M) `<QueryBoundary>` wrapper: takes a TanStack Query result and renders loading / error / empty / success automatically, with slots to override each. Every list and detail page uses it.
- [ ] `0.4b.2` (M) Skeleton components matched to real layouts: SkeletonTable, SkeletonCard, SkeletonForm, SkeletonInvoicePreview — same dimensions as the real content so nothing shifts on load
- [ ] `0.4b.3` (M) `<EmptyState>` component: icon (lucide), heading, description, primary CTA — with two documented variants, "nothing yet" and "nothing found"
- [ ] `0.4b.4` (M) `<ErrorState>` component: inline and full-page variants, plain-language message, retry action
- [~] `0.4b.5` (M) Global error boundary with a recoverable fallback UI (not a white screen)
  - *Baseline shipped in `0.1.5` (`AppErrorBoundary`, wired to TanStack Query's reset). **Remaining**:
    the designed fallback on `0.4` tokens, and a runtime test — a boundary that has never actually
    caught anything is not verified.*
- [ ] `0.4b.6` (M) Toast system: success / error / info / loading→resolved transitions, Motion-animated, queued, dismissible, accessible (`aria-live`)
- [ ] `0.4b.7` (M) Inline field validation pattern (Zod → React Hook Form → error text under input), consistent across every form
- [ ] `0.4b.8` (S) Button loading state: disabled + inline spinner + preserved width so buttons don't resize mid-action
- [ ] `0.4b.9` (S) Offline detection banner ("You're offline — changes won't save")
- [ ] `0.4b.10` (S) Optimistic update + rollback pattern (TanStack Query mutations) documented once and reused
- [ ] `0.4b.11` (S) **States storybook/gallery page** (dev-only route) showing every state of every primitive — makes review and QA of states trivial

---

# PHASE 1 — Auth & tenant setup

Goal: a user can sign up, log in, and configure their business.

## Epic 1.1 — Authentication
- [ ] `1.1.1` (L) Email/password signup + login; hashed passwords, secure session or JWT with refresh
- [ ] `1.1.2` (M) Email verification flow
- [ ] `1.1.3` (M) Password reset flow (request → emailed token → reset)
- [ ] `1.1.4` (S) Protected route wrapper on frontend; auth state via TanStack Query
- [ ] `1.1.5` (S) Logout, session expiry handling, 401 → redirect to login globally
- [ ] `1.1.6` (M) Rate limiting on auth endpoints (brute-force protection)

## Epic 1.2 — Tenant creation & business profile
- [ ] `1.2.1` (M) Signup creates Tenant + User; assigns Free tier automatically
- [ ] `1.2.2` (M) Business profile form: name, address, tax ID, default currency, default payment terms, default paper size, preferred language
- [ ] `1.2.3` (M) Logo upload: file validation (type/size), image processing, storage, delete/replace
- [ ] `1.2.4` (M) Onboarding wizard after first login — profile → optional first client → "create your first invoice" CTA
- [ ] `1.2.5` (S) Settings page to edit all of the above later

---

# PHASE 2 — Core data: clients & products

Goal: reusable data that makes invoice creation fast.

## Epic 2.1 — Clients
- [ ] `2.1.1` (M) Client CRUD API (tenant-scoped)
- [ ] `2.1.2` (M) Client list page: search, sort, pagination, empty state
- [ ] `2.1.3` (M) Client create/edit form: name, address, email, tax ID, currency override, notes
- [ ] `2.1.4` (S) Delete client with confirmation; decide behavior for clients referenced by existing invoices (recommend soft delete so historical invoices don't break)
- [ ] `2.1.5` (S) Inline "add new client" from within the invoice form (modal, no navigation away)

## Epic 2.2 — Products / services
- [ ] `2.2.1` (M) Product CRUD API (name, description, default price, unit, default tax rate)
- [ ] `2.2.2` (M) Product list page with search + empty state
- [ ] `2.2.3` (M) Product create/edit form
- [ ] `2.2.4` (S) Soft delete; inline add from invoice form
- [ ] `2.2.5` (S) Product picker component: typeahead search, inserts a line item on select

---

# PHASE 3 — Template engine & editor

The hardest and most differentiating part. Budget the most time here.

## Epic 3.1 — Template data model & renderer
- [ ] `3.1.1` (L) Define the template config schema (JSON): block order, visibility toggles, accent color, font pairing, paper size, logo position. Zod-validated, versioned (add a `schemaVersion` field now so future changes don't break saved templates).
- [ ] `3.1.2` (XL → split) Build the **single render engine**: takes `(templateConfig, invoiceData)` → HTML. This same function powers the live preview and the server-side PDF. Never write two renderers.
- [ ] `3.1.3` (L) Implement all invoice blocks: header/logo, business info, client info, invoice meta (number/dates), line items table, totals/tax summary, notes, bank details, signature line, footer
- [ ] `3.1.4` (M) Paper size handling: A4, US Letter, Legal, A5 — exact dimensions, correct margins, correct print CSS
- [ ] `3.1.5` (M) Multi-page handling: long line-item lists paginate correctly, table headers repeat, totals never orphan on their own page
- [ ] `3.1.6` (M) Font loading: Noto Sans + Noto Serif (full Latin Extended + Cyrillic) self-hosted; verify Macedonian renders correctly in every template
- [ ] `3.1.7` (M) Ship 4–6 curated base templates as starting presets

## Epic 3.2 — Visual template editor
- [ ] `3.2.1` (L) Editor layout: controls panel + live preview side-by-side (desktop), tabbed (mobile/tablet)
- [ ] `3.2.2` (L) **Live preview**: pixel-matched HTML rendering at true page proportions, updates instantly on change (debounced). Real PDF is only generated on download/send.
- [ ] `3.2.3` (M) Block visibility toggles: tax column, discount column, unit price, notes, bank details, signature, footer — every field in the spec
- [ ] `3.2.4` (L) Block reordering (drag and drop) — use Motion's layout animations for smooth reorder
- [ ] `3.2.5` (M) Accent color picker with sensible constrained palette + custom hex
- [ ] `3.2.6` (M) Font pairing selector (curated pairs only, all Cyrillic-safe)
- [ ] `3.2.7` (M) Logo position/size controls
- [ ] `3.2.8` (S) Zoom/fit controls on preview
- [ ] `3.2.9` (M) Editor performance: preview must stay smooth while typing — memoize, debounce, avoid full re-render per keystroke

## Epic 3.3 — Template management
- [ ] `3.3.1` (M) Template CRUD API (tenant-scoped)
- [ ] `3.3.2` (M) Templates list page: visual thumbnail previews, not just names
- [ ] `3.3.3` (S) Duplicate template
- [ ] `3.3.4` (S) Set default template for the tenant
- [ ] `3.3.5` (S) Delete template; handle templates referenced by existing invoices
- [ ] `3.3.6` (M) Free tier restriction: default template only, editor locked with upgrade prompt

---

# PHASE 4 — Invoices

## Epic 4.1 — Invoice data model
- [ ] `4.1.1` (M) Schema: Invoice header (number, type, dates, currency, paper size, template ref, client ref, notes) + InvoiceLineItem (description, qty, unit, unit price, tax rate, discount)
- [ ] `4.1.2` (M) **Money handling**: store all amounts as integer minor units. Never floats. Define and document rounding rules (line-level vs document-level tax rounding) once, apply everywhere.
- [ ] `4.1.3` (M) Invoice numbering: sequential per tenant, configurable prefix/format, gapless. Proforma and quotes use a separate sequence and do not consume invoice numbers.
- [ ] `4.1.4` (M) Document type field driving label/field differences: Invoice, Proforma, Quote/Estimate, Credit Note, Receipt
- [ ] `4.1.5` (S) Credit note reference field linking to an original invoice

## Epic 4.2 — Invoice creation
- [ ] `4.2.1` (L) Invoice form: client picker, document type selector, template picker, date fields, currency, paper size
- [ ] `4.2.2` (L) Line item editor: add/remove/reorder rows, product picker or free text, qty/price/tax/discount, live-calculated totals
- [ ] `4.2.3` (M) Totals panel: subtotal, per-rate tax breakdown, discounts, grand total — calculated **server-side as source of truth**, frontend calculation for display only
- [ ] `4.2.4` (M) "Start from scratch" flow: design a new template inline while creating the invoice → on save, both the invoice **and** the reusable template are saved
- [ ] `4.2.5` (M) Live preview panel alongside the form (same renderer)
- [ ] `4.2.6` (S) Draft autosave while composing (before first explicit save)
- [ ] `4.2.7` (M) Multi-currency per invoice, with correct symbol/format per locale

## Epic 4.3 — Preview, download, send
- [ ] `4.3.1` (L) Server-side PDF generation (Puppeteer) from the shared renderer; correct page size, embedded fonts, selectable text
- [ ] `4.3.2` (M) PDF generation performance: browser instance pooling, timeout handling, queue if slow. This is your heaviest server operation — plan for it.
- [ ] `4.3.3` (M) **Download** action: generates fresh PDF from current data, correct filename (`INV-2026-001_ClientName.pdf`)
- [ ] `4.3.4` (M) **Send** action: transactional email provider integration (Resend/Postmark), PDF attached, localized email body
- [ ] `4.3.5` (S) Send disabled with tooltip when client has no email; download always available
- [ ] `4.3.6` (M) Email template design (the covering email, in the tenant's language)
- [ ] `4.3.7` (S) Email delivery failure handling and user feedback

## Epic 4.4 — Editing, saving, duplicating
- [ ] `4.4.1` (M) Open saved invoice in edit mode with all data loaded
- [ ] `4.4.2` (M) **Save / Cancel semantics**: Save explicitly persists; Cancel discards and reverts; Download/Send from an edit screen use current edited data **without** auto-saving
- [ ] `4.4.3` (S) Unsaved-changes warning on navigate away
- [ ] `4.4.4` (M) **Duplicate**: copies client, line items, template, type, paper size into a new invoice with new ID, new number, blank history
- [ ] `4.4.5` (S) Delete invoice with confirmation

## Epic 4.5 — Invoice library
- [ ] `4.5.1` (M) List page: search by client/number, filter by type/date range, sort, pagination
- [ ] `4.5.2` (M) Row actions: open, duplicate, download, delete
- [ ] `4.5.3` (S) Empty state with clear CTA
- [ ] `4.5.4` (M) **CSV export** of the invoice list (filtered set), with all key fields for the user's bookkeeping

---

# PHASE 5 — History

## Epic 5.1 — Event log
- [ ] `5.1.1` (M) `InvoiceHistoryEvent` table: append-only, `invoice_id`, `event_type`, `timestamp`, `metadata` (e.g. recipient email), `user_id`
- [ ] `5.1.2` (M) Emit events on: created, edited, downloaded, sent, duplicated-from, duplicated-into
- [ ] `5.1.3` (S) Events are never edited or deleted — append only

## Epic 5.2 — History UI
- [ ] `5.2.1` (M) Per-invoice history timeline in the invoice detail view
- [ ] `5.2.2` (M) Dashboard: global activity view across all invoices, filterable by action type, client, date range
- [ ] `5.2.3` (S) Download count and last-sent-to display on invoice rows
- [ ] `5.2.4` (S) Motion-animated timeline entries (subtle stagger on load)

> Explicitly **not** included: paid/unpaid status, overdue flags, payment reminders.

---

# PHASE 6 — Billing & subscriptions

## Epic 6.1 — Plan model & enforcement
- [ ] `6.1.1` (M) Subscription schema: `tenant_id`, `tier`, `status`, `source` (stripe | manual), `start_date`, `end_date`
- [ ] `6.1.2` (L) **Central entitlement service**: one function answers "can this tenant do X right now?" Checks Stripe subs and manual grants identically. Every gated action calls this — never scatter tier checks through the codebase.
- [ ] `6.1.3` (M) Usage counters: invoices created (lifetime for Free, unlimited for paid), AI generations this month
- [ ] `6.1.4` (M) **Server-side enforcement** on every gated endpoint — the UI hiding a button is not enforcement
- [ ] `6.1.5` (M) Free tier rule: **1 invoice generation, lifetime, per account**; no AI; default template only
- [ ] `6.1.6` (S) Upgrade prompts at limit boundaries — clear, not obnoxious

## Epic 6.2 — Stripe integration
- [ ] `6.2.1` (L) Stripe products/prices for Basic (€10/mo) and Premium (€30/mo)
- [ ] `6.2.2` (L) Checkout flow; subscription created on success
- [ ] `6.2.3` (L) Webhook handling: created, updated, cancelled, payment_failed — idempotent, signature-verified
- [ ] `6.2.4` (M) Customer portal link for self-serve plan change/cancel/card update
- [ ] `6.2.5` (M) Failed payment → grace period → downgrade to Free
- [ ] `6.2.6` (S) Invoice/receipt emails for your own subscription billing (Stripe handles)
- [ ] `6.2.7` (M) Pricing page with tier comparison

## Epic 6.3 — Manual (cash) subscription grants
- [ ] `6.3.1` (M) Admin API: grant tier to tenant with explicit `start_date` and `end_date`, `source: manual`, optional note (e.g. "€20 cash, 2 months")
- [ ] `6.3.2` (M) Admin UI: grant form with tier selector, date range picker, quick presets (1 / 2 / 3 / 6 / 12 months from today), amount-received note field
- [ ] `6.3.3` (M) Automatic expiry: scheduled job (or lazy check on entitlement lookup — do both) reverts tenant to Free when `end_date` passes. No manual revocation step needed.
- [ ] `6.3.4` (S) Extend / shorten / revoke an active manual grant
- [ ] `6.3.5` (S) Conflict handling: what happens if a tenant with a manual grant also subscribes via Stripe (recommend: whichever gives more access wins, both records preserved)
- [ ] `6.3.6` (S) Manual grants listed in admin clearly labeled by source, with expiry date and days remaining
- [ ] `6.3.7` (S) User-facing: tenant sees their plan and expiry date, doesn't need to know it was a manual grant

---

# PHASE 7 — AI drafting (Premium)

## Epic 7.1 — Backend
- [ ] `7.1.1` (L) LLM API integration with a strict structured output schema (client name, line items with description/qty/unit price, dates, currency)
- [ ] `7.1.2` (M) Prompt design + Zod validation of the model's response; reject and retry malformed output
- [ ] `7.1.3` (M) **Guardrails**: AI never computes totals or tax — it returns only the raw numbers, your code calculates everything. Uncertain fields come back empty, never guessed.
- [ ] `7.1.4` (M) Client matching: fuzzy-match extracted name against existing clients; flag as new if no confident match
- [ ] `7.1.5` (M) Relative date parsing ("due in 15 days" → actual date in tenant's timezone)
- [ ] `7.1.6` (M) Rate limiting per tenant (e.g. 30–50/month), counter increments only on successful generation
- [ ] `7.1.7` (S) Cost logging per generation for admin monitoring
- [ ] `7.1.8` (S) Graceful failure: API down or malformed → clear message, no counter increment

## Epic 7.2 — Frontend
- [ ] `7.2.1` (M) AI input box above the invoice form, Premium-gated with upgrade prompt for others
- [ ] `7.2.2` (M) Loading state with Motion animation; result populates the normal form fields
- [ ] `7.2.3` (M) Visual indication of AI-filled fields so the user knows what to verify; nothing auto-sends or auto-saves
- [ ] `7.2.4` (S) Remaining-generations counter display
- [ ] `7.2.5` (S) Example prompts / placeholder text to teach the format

---

# PHASE 8 — Admin center

Internal only, gated by admin role, never visible to tenants.

## Epic 8.1 — Access
- [ ] `8.1.1` (M) Admin role on user model; separate route namespace; all admin endpoints double-check the role
- [ ] `8.1.2` (S) Admin actions are audit-logged (who granted what, when)

## Epic 8.2 — Overview
- [ ] `8.2.1` (M) Metrics dashboard: MRR, active subs by tier, new signups (day/week/month), churn, Free→paid conversion rate
- [ ] `8.2.2` (M) Charts for signups and revenue over time

## Epic 8.3 — Tenant management
- [ ] `8.3.1` (M) Tenant list: search, signup date, tier, source, invoices created, last active
- [ ] `8.3.2` (M) Tenant detail: usage summary, subscription history, view-only data access for support
- [ ] `8.3.3` (M) **Grant/extend/revoke manual subscription** (links to Epic 6.3)
- [ ] `8.3.4` (S) Disable / re-enable an account
- [ ] `8.3.5` (S) Delete a tenant and all its data (GDPR-style deletion request)

## Epic 8.4 — Cost & usage monitoring
- [ ] `8.4.1` (M) AI generations consumed vs. limits, per tenant and in aggregate, with estimated cost
- [ ] `8.4.2` (S) Email send volume
- [ ] `8.4.3` (S) Storage usage (PDFs, logos)
- [ ] `8.4.4` (S) Alerting when AI cost or send volume spikes unexpectedly

## Epic 8.5 — Billing view
- [ ] `8.5.1` (M) Stripe subscriptions list, failed payments, upcoming renewals
- [ ] `8.5.2` (S) Manual grants listed alongside, labeled by source, sorted by expiry

## Epic 8.6 — Support
- [ ] `8.6.1` (M) Simple ticket/message inbox tied to tenant records for context

---

# CROSS-CUTTING (runs through all phases, not a phase of its own)

## Epic X.1 — Internationalization
- [ ] `X.1.1` (M) i18n library setup (react-i18next); no hardcoded strings anywhere, enforced by lint rule
- [ ] `X.1.2` (L) Full UI translation: English, Albanian, Macedonian
- [ ] `X.1.3` (M) **Invoice content labels translated too** (Total, Due date, Amount Due, Invoice, Proforma...) — per the invoice's language, not just app UI
- [ ] `X.1.4` (M) Language switcher; persisted per user; separate setting for invoice language vs UI language
- [ ] `X.1.5` (M) Locale-correct number, currency, and date formatting per language
- [ ] `X.1.6` (S) Verify Cyrillic renders correctly in the app UI, live preview, **and generated PDF** — test all three separately

## Epic X.2 — Responsiveness
- [ ] `X.2.1` (M) Responsive audit and fixes: phone, tablet/iPad, laptop (primary), wide desktop
- [ ] `X.2.2` (L) Template editor mobile/tablet adaptation: stacked tabbed layout instead of side-by-side
- [ ] `X.2.3` (M) Invoice form mobile adaptation: line item rows become stacked cards, not a cramped table
- [ ] `X.2.4` (M) Tables → card layouts on small screens across all list pages
- [ ] `X.2.5` (S) Wide-screen handling: max-width containers, no stretched-out layouts above 1536px
- [ ] `X.2.6` (S) Touch target sizing, tap states, no hover-only interactions
- [ ] `X.2.7` (S) Real-device testing on iPhone, Android, iPad

## Epic X.3 — Animation
- [ ] `X.3.1` (S) Motion presets applied consistently: modals, toasts, page transitions, list stagger
- [ ] `X.3.2` (M) Template editor micro-interactions: toggle feedback, drag reorder (Motion layout animations)
- [ ] `X.3.3` (M) GSAP only where justified — landing page scroll sequence (ScrollTrigger), any complex timeline
- [ ] `X.3.4` (S) `prefers-reduced-motion` respected everywhere
- [ ] `X.3.5` (S) Animation performance check — no jank on mid-range phones

## Epic X.4 — Privacy, legal, security
- [ ] `X.4.1` (M) Privacy policy page (what's collected, why, retention, rights)
- [ ] `X.4.2` (M) Terms of service page
- [ ] `X.4.3` (M) Cookie consent banner: essential vs analytics categories, choice persisted, analytics blocked until consent
- [ ] `X.4.4` (M) Account deletion flow: deletes tenant data including stored PDFs and logos
- [ ] `X.4.5` (M) Data export for a tenant (their own data, on request)
- [ ] `X.4.6` (M) Security pass: rate limiting, input sanitization, secure headers, file upload validation, no tenant data leakage across tenants (test this explicitly)
- [ ] `X.4.7` (S) Encrypted backups, secrets management

## Epic X.5 — Quality
- [ ] `X.5.1` (M) Unit tests for money math, tax calculation, rounding, invoice numbering — the logic where bugs cost your users real money
- [ ] `X.5.2` (M) Integration tests for entitlement checks (each tier can/can't do the right things)
- [ ] `X.5.3` (M) E2E happy paths (Playwright): signup → profile → client → invoice → download; and → send
- [ ] `X.5.4` (M) PDF snapshot tests across all paper sizes and languages
- [ ] `X.5.5` (S) Error monitoring (Sentry) and uptime monitoring
- [ ] `X.5.6` (S) Accessibility pass: keyboard navigation, focus states, labels, contrast

## Epic X.7 — UI states per surface

The primitives are built in Epic 0.4b. These tasks apply them to the specific screens where
the state is non-obvious or has product-specific behavior.

**Loading**
- [ ] `X.7.1` (M) Skeletons for: client list, product list, invoice library, template gallery (thumbnail skeletons), dashboard history feed, admin tenant list
- [ ] `X.7.2` (M) Template editor loading: preview area shows a page-shaped skeleton at correct paper proportions, controls panel disabled until config loads
- [ ] `X.7.3` (M) PDF generation loading: this is the slowest action in the app — dedicated progress state on Download/Send buttons, with a message if it exceeds ~3s, and a timeout path
- [ ] `X.7.4` (S) AI generation loading: Motion-animated state on the AI panel, with the ability to cancel

**Empty**
- [ ] `X.7.5` (M) "Nothing yet" empty states with CTAs: no clients, no products, no templates, no invoices, no history — each with its own copy and primary action
- [ ] `X.7.6` (M) "Nothing found" empty states: filtered invoice library, client search, product picker typeahead — each with a "Clear filters" action
- [ ] `X.7.7` (S) Invoice with zero line items: preview shows a helpful placeholder rather than a broken-looking empty table
- [ ] `X.7.8` (S) Admin dashboard with no data yet (pre-launch/first users) doesn't render broken charts

**Success**
- [ ] `X.7.9` (M) Success feedback for: invoice saved, invoice duplicated, template saved, client/product created, settings saved, subscription activated, manual grant issued
- [ ] `X.7.10` (M) **Send success** is its own confirmation state — shows recipient email and timestamp, since there's no delivery tracking afterward this is the user's only confirmation
- [ ] `X.7.11` (S) Download success: subtle confirmation (browsers hide downloads, users need to know it worked)

**Error**
- [ ] `X.7.12` (M) Form validation errors on every form, inline, i18n'd, with correct field focus
- [ ] `X.7.13` (M) Request failure states with retry on every list/detail surface
- [ ] `X.7.14` (M) **PDF generation failure**: clear message, retry, and never leaves the user thinking their invoice was sent when it wasn't
- [ ] `X.7.15` (M) **Email send failure**: explicitly distinguish "PDF made, email failed" — offer Download as fallback and retry send
- [ ] `X.7.16` (M) Payment failure states: Stripe checkout failure, card declined, subscription lapsed
- [ ] `X.7.17` (M) Limit-reached states as friendly gates, not errors: free tier invoice used, AI monthly limit hit, template locked — each with an upgrade path
- [ ] `X.7.18` (S) AI failure: model unavailable or malformed output → clear message, generation counter **not** decremented
- [ ] `X.7.19` (S) 404 and 403 pages, i18n'd, with navigation back

**Partial / Imperfect**
- [ ] `X.7.20` (M) Dashboard and admin overview: each metric/widget loads and fails independently — one broken query never blanks the page
- [ ] `X.7.21` (M) **AI partial results**: model returns some fields confidently and leaves others blank → visually mark which fields were AI-filled vs. left for the user, prompt them to complete the gaps. This is the expected normal case, not an edge case.
- [ ] `X.7.22` (M) Invoice referencing a deleted client or template: render gracefully with a clear notice and a fix action, never crash
- [ ] `X.7.23` (S) Logo fails to load in preview/PDF: fall back to business name text, don't render a broken image
- [ ] `X.7.24` (S) Partial CSV export (some rows failed): export what succeeded and report what didn't
- [ ] `X.7.25` (S) Slow/stale data: use TanStack Query's `isFetching` to show a subtle refreshing indicator over existing data rather than replacing it with a skeleton (avoids flicker on refetch)

**Verification**
- [ ] `X.7.26` (M) State audit checklist per screen, reviewed before each milestone ships — every screen signed off on all five states
- [ ] `X.7.27` (S) Test tooling to force each state in dev (network throttle, forced error, empty fixture) so states are actually testable, not theoretical

## Epic X.6 — Marketing surface
- [ ] `X.6.1` (M) Landing page: value prop, template showcase, pricing, CTA
- [ ] `X.6.2` (S) GSAP scroll animations on landing (the one place complex sequencing is worth it)
- [ ] `X.6.3` (S) SEO basics, meta tags, OG images
- [ ] `X.6.4` (S) Trilingual landing page

---

# Suggested delivery order

| Milestone | Contains | Ships |
|---|---|---|
| **M1 — Walking skeleton** | Phase 0, 1 | Deployed app, signup, business profile |
| **M2 — First invoice** | Phase 2, 4.1–4.3 (with one hardcoded template) | A user can create and download a real invoice |
| **M3 — Templates** | Phase 3 | The differentiating feature — visual editor + live preview |
| **M4 — Full invoice lifecycle** | Phase 4.4–4.5, Phase 5 | Edit/save/cancel, duplicate, library, history |
| **M5 — Money** | Phase 6 | Stripe, tiers, free-tier limit, manual cash grants |
| **M6 — AI** | Phase 7 | Premium differentiator |
| **M7 — Admin** | Phase 8 | You can actually run the business |
| **M8 — Polish & launch** | X.1–X.6 completion, landing page | Public launch |

**Do not defer to the end:** i18n (X.1), responsiveness (X.2), UI state primitives (0.4b)
and their per-surface application (X.7), and multi-tenant scoping (0.2.4). Retrofitting any
of these is far more expensive than building them in from the start. Everything else in the
cross-cutting section can accumulate as you go.

**On UI states specifically:** build Epic 0.4b in Phase 0, before the first feature screen.
Every screen built afterward then inherits correct states by default. If you build ten
screens first and add states later, you are rewriting ten screens — and in practice, the
states get skipped and the app feels broken on slow connections.

---

# Top risks

| Risk | Mitigation |
|---|---|
| Template editor scope creep — it can absorb infinite time | Ship a constrained toggle-based editor first (Epic 3.2), not a freeform canvas. Curated fonts/colors, not unlimited choice. |
| PDF rendering is slow/heavy on shared hosting | Test Puppeteer on your actual Hostinger plan **early** (in Phase 0/1, not Phase 4). If shared hosting can't run headless Chrome, you need a VPS — find out before you've built around it. |
| Preview and PDF don't match | Single shared render function (3.1.2), enforced by snapshot tests (X.5.4). This is the #1 source of "looks fine, prints wrong" bugs. |
| Money rounding bugs | Integer minor units, documented rounding rule, unit tested (4.1.2, X.5.1). |
| AI cost overrun | Hard server-side rate limits (7.1.6), cost logging (7.1.7), admin alerting (8.4.4). |
| Cyrillic breaks in PDF but not on screen | Self-hosted Noto fonts, embedded in PDF, tested separately (X.1.6). |
| Free tier abused via repeat signups | Lifetime limit tracked per verified email; email verification required before the free generation. |
| UI states skipped under deadline pressure — app feels broken on slow connections | Primitives built in Phase 0 (0.4b) so states are the default, not extra work. Per-screen audit checklist (X.7.26) gates each milestone. |
| Send appears to succeed when the email actually failed | PDF generation and email dispatch are separate steps with separate feedback (X.7.15). Never show one success message covering both. |

---

# Open decisions to make before building

All five are decided. Full reasoning and consequences in `decisions.md`.

| # | Decision | Outcome | Ref |
|---|---|---|---|
| 1 | Hostinger VPS vs shared hosting | **Neither** — managed deploy-from-GitHub Node environment. Postgres availability and Chrome support both still need verifying on the real plan | `D1`, `D2` |
| 2 | AI generation monthly limit on Premium | 50 successful generations per calendar month | `D6` |
| 3 | Teammates later? | No — single `users` table, one row per business. Child tables still carry `tenant_id` so the split stays cheap if it is ever needed | `D3` |
| 4 | Soft vs hard delete | Soft delete for clients and products | `D4` |
| 5 | Manual grant + Stripe conflict | Most access wins; both records preserved | `D5` |

Decided since, not on the original list: `D7` monorepo layout · `D8` TypeScript pinned to
6.0.x · `D9` placeholder English copy until `X.1.1` · `D10` `system-ui` banned from any
surface that reaches a PDF · `D11` Prisma for migrations and data access.

**Still open, deliberately deferred:** transactional email provider (`4.3.4`), session
strategy (`1.1.1`), and the two D1 verification checks above.
