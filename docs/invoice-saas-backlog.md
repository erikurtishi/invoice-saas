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
  - *Decided (`D1` hosting, `D2` database): Postgres, VPS deferred until the local build is
    ready to deploy. **Partial**: the app runs against local Postgres now; the VPS itself
    isn't provisioned, so nothing about it is verified yet — that happens at `0.3.1`, see
    `puppeteer-hosting-runbook.md`.*
- [x] `0.2.2` (M) Migration tooling (Prisma or Knex); initial schema for Tenant, User
  - *Prisma 6.19.3 (`D11`; pinned below Prisma 7's driver-adapter rewrite — see the note
    on `D11`). `User` schema per `D3`: one `users` table, business profile + credentials
    together. First migration (`init_users`) applied and verified against local Postgres.*
- [x] `0.2.3` (S) Express/NestJS skeleton, health endpoint, request logging, CORS
  - *Express skeleton, `GET /health`, CORS locked to `WEB_ORIGIN`, `morgan` request logging
    (`dev` format locally, `combined` in production; health checks excluded as noise).*
- [x] `0.2.4` (M) Multi-tenant strategy: every table carries `tenant_id`; a middleware injects the current tenant and every query is scoped to it. Write this once, centrally — never per-route.
  - *`db/tenant-scope.ts`: a Prisma client extension that injects `tenantId` into every
    `where`/`data` for models listed in `TENANT_SCOPED_MODELS` — verified with a throwaway
    model that cross-tenant reads see nothing and writes can't omit the scope, then reverted.
    `middleware/tenant.ts` attaches a scoped client to `req.db`. The list is empty until
    `2.1` adds `Client` — the mechanism exists ahead of its first caller, per the backlog's
    own instruction not to retrofit this.*
- [x] `0.2.5` (S) Standard API error shape + validation middleware using shared Zod schemas
  - *`apiErrorBodySchema` in `@invoice-saas/shared`; `ApiError` class, `validate()` request
    middleware, and a central `errorHandler` in `apps/api` covering `ApiError`, `ZodError`,
    malformed JSON, and unknown errors (generic message in production, real one in dev).
    Verified end-to-end: validation failure, thrown `ApiError`, and an unhandled error all
    produced the right shape and status.*

## Epic 0.3 — Deployment
- [ ] `0.3.1` (M) Hostinger deployment for Node backend (PM2 or equivalent process manager)
- [ ] `0.3.2` (S) Frontend static build + serve; SPA fallback routing
- [ ] `0.3.3` (S) Domain, SSL, environment separation (staging vs production)
- [ ] `0.3.4` (M) CI: lint + typecheck + build on push; deploy on merge to main
- [ ] `0.3.5` (S) Automated DB backups — do this before you have real customer data, not after

## Epic 0.4 — Design system
- [x] `0.4.1` (M) Design tokens: colors, spacing, radii, shadows, typography scale in Tailwind config
  - *`index.css` `@theme` block: semantic color tokens (background/foreground/card/popover/
    muted/border/primary/secondary/destructive/success/warning) with light + dark values,
    radius scale, elevation shadows, app-chrome font stack. Spacing and breakpoints are
    Tailwind's untouched defaults — they already match the backlog's own breakpoint table,
    documented as a deliberate choice rather than left unexplained.*
- [x] `0.4.2` (M) Base components: Button, Input, Select, Modal, Toast, Card, Table, Tabs, Dropdown, Tooltip, Skeleton — all lucide-react icons, all responsive
  - *All eleven in `components/ui/`. Select/Modal/Tabs/Dropdown/Tooltip build on Radix
    primitives (unstyled, accessible — focus trap, portal, roving tabindex) styled with
    Tailwind + the 0.4.1 tokens; Button/Input/Card/Table/Skeleton are plain Tailwind.
    Toast here is the presentational card only — the queue/provider/`aria-live` system is
    0.4b.6. Button's `isLoading` is the primitive 0.4b.8 builds its fuller pattern on.*
- [x] `0.4.3` (S) Layout shell: sidebar (desktop) / bottom nav or drawer (mobile), max-width container for wide screens
  - *`AppShell` + `Sidebar` (`lg:` and up) + `MobileNav` (drawer, not bottom nav — six nav
    items don't fit a bottom bar above the 44px touch-target minimum). `react-router-dom`
    installed and wired (stack table's locked choice, not a new decision) with placeholder
    routes per nav item so routing and active-link state are real, not simulated. Content
    wrapped in a `max-w-[1600px]` container per X.2.5. Verified with Puppeteer screenshots
    at desktop and mobile widths, nav-link clicks, and the drawer open — all correct, zero
    console errors.*
- [x] `0.4.4` (S) Motion presets: shared transition configs (modal enter/exit, page fade, list stagger) so animation feels consistent
  - *`lib/motion-presets.ts`: modal/page/list-stagger/toast variants + transitions, plus
    `getTransition()` collapsing any preset to near-instant under `prefers-reduced-motion`
    (0.4.5 still owns the full audit, but nothing here needs retrofitting for it). Modal
    actually uses Motion (`AnimatePresence` + Radix `forceMount`), matching the stack
    table's "Use for: modals..." — not left as a CSS-transition substitute.*
- [x] `0.4.5` (S) `prefers-reduced-motion` global handling
  - *Three layers: `MotionConfig reducedMotion="user"` in `main.tsx` (app-wide backstop
    for every `motion.*` element, present and future); `index.css`'s `@media
    (prefers-reduced-motion: reduce)` block for everything that isn't Motion (Radix's
    CSS `data-state` transitions, Tailwind's `animate-pulse`) — `animate-spin` (loading
    spinners) deliberately excluded, a frozen spinner reads as broken rather than
    reduced; and every 0.4.4 preset's own `getTransition()`. Verified empirically, not
    just by code review: sampled the mobile drawer's transform every animation frame
    with and without the media feature emulated — normal motion interpolates over
    ~200ms of eased frames, reduced motion jumps straight to the settled state in one
    frame (~9ms). Per-surface enforcement (X.3.4) is a later cross-cutting pass; this
    is the global mechanism that makes that pass find nothing to fix by default.*

### Epic 0.4b — UI state primitives (build these before any feature screen)

These are the reusable building blocks for the five states. Building them first means every
later feature gets correct states for free instead of ad-hoc ones per screen.

Overview of the whole epic, with import paths and usage examples, lives in
`docs/ui-state-primitives.md`. Live gallery: `/dev/states` (dev builds only).

- [x] `0.4b.1` (M) `<QueryBoundary>` wrapper: takes a TanStack Query result and renders loading / error / empty / success automatically, with slots to override each. Every list and detail page uses it.
  - *`components/state/query-boundary.tsx`. Reads `isPending`/`isError`/`data`/`isFetching`
    off the query — no parallel booleans. Precedence: error-with-no-data → first load →
    empty → success; on success a background refetch shows a thin top bar instead of
    collapsing to a skeleton (X.7.25). `loading`/`empty`/`error` slots overridable;
    default `isEmpty` handles `null`, `[]`, `{items:[]}`, `{data:[]}`.*
- [x] `0.4b.2` (M) Skeleton components matched to real layouts: SkeletonTable, SkeletonCard, SkeletonForm, SkeletonInvoicePreview — same dimensions as the real content so nothing shifts on load
  - *`components/state/skeletons.tsx`, built on the `Skeleton` primitive (0.4.2). Plus
    `SkeletonList` as the generic `<QueryBoundary>` fallback. `SkeletonInvoicePreview`
    holds true A4 proportions via `aspect-ratio` so the preview pane never jumps (X.7.2).*
- [x] `0.4b.3` (M) `<EmptyState>` component: icon (lucide), heading, description, primary CTA — with two documented variants, "nothing yet" and "nothing found"
  - *`components/state/empty-state.tsx`. `nothing-yet` (onboarding tone, primary CTA via
    `action`, inbox icon) vs `nothing-found` (neutral tone, `onClearFilters` renders the
    standard button, search-x icon) — documented as non-interchangeable. Per-surface copy
    stays at the call site (X.7.5/X.7.6).*
- [x] `0.4b.4` (M) `<ErrorState>` component: inline and full-page variants, plain-language message, retry action
  - *`components/state/error-state.tsx`. `inline` (one widget failed, retries in place —
    used by `<QueryBoundary>` and per-widget on partial surfaces) and `page` variants.
    Message from the shared `toUserMessage` (`lib/error-message.ts`); raw error shown only
    in dev, never in production.*
- [x] `0.4b.5` (M) Global error boundary with a recoverable fallback UI (not a white screen)
  - *Reusable `ErrorBoundary` (`components/state/error-boundary.tsx`) with `fallbackRender`.
    Two mounts: `AppErrorBoundary` (root, standalone full-page fallback on 0.4 tokens — no
    shell, since the shell could be what broke) and a second instance inside `AppShell`
    around the router, keyed on pathname, so a route crash keeps the nav usable and
    navigating away clears it. Runtime-verified via `/dev/states` "Trigger render error":
    boundary catches, shows the recoverable fallback, "Try again" restores the subtree.*
- [x] `0.4b.6` (M) Toast system: success / error / info / loading→resolved transitions, Motion-animated, queued, dismissible, accessible (`aria-live`)
  - *`components/state/toast-viewport.tsx` (`ToastProvider`, mounted once in `main.tsx`) +
    `hooks/use-toast.ts` (`useToast`). Queue capped at 4 (oldest non-loading dropped),
    ~5s auto-dismiss (`loading` never), Motion `layout` enter/exit, polite `aria-live`.
    `toast.promise()` flips one toast id loading→success/error and re-throws.*
- [x] `0.4b.7` (M) Inline field validation pattern (Zod → React Hook Form → error text under input), consistent across every form
  - *`lib/use-zod-form.ts` (`useZodForm` — shared resolver + `mode: onBlur` /
    `reValidateMode: onChange`) + `components/form/field.tsx` (`<FormField>`, owns
    id/`aria-invalid`/`aria-describedby` wiring, error text under the input, never a
    top-of-form summary — X.7.12).*
- [x] `0.4b.8` (S) Button loading state: disabled + inline spinner + preserved width so buttons don't resize mid-action
  - *`Button` `isLoading`: disables, sets `aria-busy`, overlays the spinner on the label
    while the label stays mounted but `invisible` — width is preserved, no reflow.*
- [x] `0.4b.9` (S) Offline detection banner ("You're offline — changes won't save")
  - *`components/state/offline-banner.tsx`, mounted in `AppShell`. `navigator.onLine` via
    `useSyncExternalStore` (no effect-fetch, correct under StrictMode). Motion slide-in,
    warning tokens, `aria-live`.*
- [x] `0.4b.10` (S) Optimistic update + rollback pattern (TanStack Query mutations) documented once and reused
  - *`lib/optimistic-mutation.ts` — `optimisticUpdate(qc, key, apply)` returns
    `{ onMutate, onError, onSettled }`: `cancelQueries` guard, snapshot + restore on
    error, `invalidateQueries` on settle so the server stays source of truth (4.2.3).
    Pattern documented in `docs/ui-state-primitives.md`.*
- [x] `0.4b.11` (S) **States storybook/gallery page** (dev-only route) showing every state of every primitive — makes review and QA of states trivial
  - *`routes/dev/state-gallery.tsx` at `/dev/states`, gated by `import.meta.env.DEV` so it
    tree-shakes out of production. Every primitive in every state on one page (X.7.26).*

---

# PHASE 1 — Auth & tenant setup

Goal: a user can sign up, log in, and configure their business.

## Epic 1.1 — Authentication
- [x] `1.1.1` (L) Email/password signup + login; hashed passwords, secure session or JWT with refresh
  - *Access JWT (15m, `Authorization: Bearer`, HS256) + opaque refresh token (30d,
    httpOnly `refresh_token` cookie scoped to `/auth`, SHA-256 hashed at rest,
    rotated every `/auth/refresh` with reuse detection that revokes the chain — see
    decision D12). Passwords: Node `scrypt` (N=2^17), self-describing
    `scrypt$N$r$p$salt$hash` string, opportunistic rehash on login
    (`apps/api/src/lib/password.ts`). Service layer `services/auth-service.ts`;
    thin routes `routes/auth.ts` (`/signup /login /refresh /logout /me`). Web:
    in-memory access token (never `localStorage`), `lib/api-client.ts` does
    refresh-and-replay on 401. Shared Zod in `@invoice-saas/shared` (`auth.ts`).*
- [x] `1.1.2` (M) Email verification flow
  - *`OneTimeToken` table (`purpose=EMAIL_VERIFICATION`, 24h, single-use, SHA-256
    hashed, issuing a new one invalidates older). Sent on signup + `POST
    /auth/verify-email/resend`; consumed at `POST /auth/verify-email`. Mailer is a
    pluggable port (`mail/mailer.ts`) with a `ConsoleMailer` dev transport that
    logs the link — real provider is still open (D13). Web: `/verify-email` page
    (auto-submits token) + persistent `VerifyEmailBanner` in the app shell.*
- [x] `1.1.3` (M) Password reset flow (request → emailed token → reset)
  - *`OneTimeToken` (`purpose=PASSWORD_RESET`, 1h). `POST /auth/password/request-reset`
    always 202 (no account enumeration — X.4.6); `POST /auth/password/reset`
    consumes the token, sets the new hash, and revokes every refresh token for the
    user. Web: `/forgot-password` + `/reset-password` pages.*
- [x] `1.1.4` (S) Protected route wrapper on frontend; auth state via TanStack Query
  - *`useSession()` = `useQuery(['auth','session'])` hitting `/auth/me`.
    `<RequireAuth>` (`components/auth/require-auth.tsx`) gates the whole authed
    route subtree: spinner while pending, `<Navigate to="/login?next=…">` when
    absent, `<Outlet/>` when present. Login/signup pages bounce an already-authed
    user away.*
- [x] `1.1.5` (S) Logout, session expiry handling, 401 → redirect to login globally
  - *`/auth/logout` revokes the presented refresh token + clears the cookie;
    `useLogout` also `queryClient.clear()`s so no tenant data survives into the next
    session on that browser. `api-client` fires `onSessionExpired` when a refresh
    ultimately fails; `<RequireAuth>` subscribes and redirects to `/login?next=…`.*
- [x] `1.1.6` (M) Rate limiting on auth endpoints (brute-force protection)
  - *`express-rate-limit`, in-memory store (single API process — D1), per-IP:
    credentials (login/signup/reset) 10 / 15 min, refresh 120 / 15 min, email-
    dispatch (verify-resend, reset-request) 5 / hour. Trips return the standard
    `RATE_LIMITED` error body. `middleware/rate-limit.ts`.*

## Epic 1.2 — Tenant creation & business profile
- [x] `1.2.1` (M) Signup creates Tenant + User; assigns Free tier automatically
  - *No separate tenant — the user *is* the tenant (D3). Signup (`1.1.1`) already
    creates the `users` row; this adds a `tier` enum column (`FREE`/`BASIC`/
    `PREMIUM`, default `FREE`) so every account is Free from creation with no code
    path. Decision **D14**: minimal column now, superseded by Phase 6's
    `Subscription` table + entitlement service (`6.1.2`) as the read path — nothing
    branches on `tier` yet.*
- [x] `1.2.2` (M) Business profile form: name, address, tax ID, default currency, default payment terms, default paper size, preferred language
  - *`businessProfileSchema` in `@invoice-saas/shared` (single source for the form
    resolver and `PATCH /profile` validation). `GET`/`PATCH /profile` in
    `routes/profile.ts` → `services/profile-service.ts`, operating on the `users`
    row via raw `prisma` (not `req.db` — that scopes child models, of which the
    profile has none). `PATCH` is a full replace, not a partial, so "cleared a
    field" is unambiguous. Web: `BusinessProfileForm` (shared by settings +
    onboarding) with all five states via `<QueryBoundary>` + `useZodForm` +
    `<FormField>`; curated Selects for currency / paper size / language.*
- [x] `1.2.3` (M) Logo upload: file validation (type/size), image processing, storage, delete/replace
  - *`Storage` port (`lib/storage/`, mirrors the D13 `Mailer` port) with a
    `LocalDiskStorage` impl served read-only at `/uploads`; decision **D15** — cloud
    object store swaps in at `storage/index.ts` with no call-site change.
    `POST`/`DELETE /profile/logo`: multer memory upload (2 MB / one file / PNG-JPEG-
    WebP allow-list, its errors mapped to the standard `VALIDATION_ERROR` body),
    then `sharp` re-encodes to a ≤512px WebP (strips EXIF/metadata, normalises
    format). Stored key carries a random token so a replaced logo gets a fresh URL;
    the previous file is best-effort deleted. Web: `LogoField` — its own mutations
    and feedback, deliberately outside the RHF form so a failed upload never blocks
    saving the profile (Partial state).*
- [x] `1.2.4` (M) Onboarding wizard after first login — profile → optional first client → "create your first invoice" CTA
  - *`onboardingCompletedAt` column on `users` (null → not done). `POST
    /onboarding/complete` stamps it (idempotent) and returns the refreshed public
    user. Web: `/onboarding` route — authed but outside the app shell, its own
    focused layout; `AuthedLayout` redirects any authed user with
    `onboardingCompleted === false` there until it's done. Three steps: business
    profile (reuses `BusinessProfileForm` in `onboarding` variant) → first-client
    step (placeholder + skippable until Phase 2 builds Clients) → "create your first
    invoice" CTA. Existing accounts backfilled to done in the migration.*
- [x] `1.2.5` (S) Settings page to edit all of the above later
  - *`/settings` → `BusinessProfilePage`: the same `BusinessProfileForm` in its
    default `settings` variant (inline "saved" `<FormBanner>` + toast, submit
    disabled until dirty). Replaced the placeholder route.*

---

# PHASE 2 — Core data: clients & products

Goal: reusable data that makes invoice creation fast.

## Epic 2.1 — Clients
- [x] `2.1.1` (M) Client CRUD API (tenant-scoped)
  - *`Client` model (`tenantId` → `users.id`, decision D3) registered in
    `db/tenant-scope.ts`'s `TENANT_SCOPED_MODELS` — the first tenant-scoped model,
    so every query is confined by the extension, no `where` clause in the route.
    `routes/clients.ts` (behind `authenticate` + `requireTenant`) → `services/
    client-service.ts` (takes the scoped `req.db` as a param). Shared shapes in
    `packages/shared/src/client.ts`. `middleware/validate.ts` gained an Express-5
    fix: `req.query` is a getter with no setter, so the parsed value is installed
    with `Object.defineProperty` instead of a discarded `Object.assign`.*
- [x] `2.1.2` (M) Client list page: search, sort, pagination, empty state
  - *`routes/clients/clients-list-page.tsx` → `features/clients/use-clients.ts`
    (TanStack Query, `keepPreviousData` so paging doesn't flash a skeleton).
    Debounced search over name / email / tax ID; sort name/-name/newest/oldest;
    offset pagination (`CLIENT_PAGE_SIZE` = 25). All five states via
    `<QueryBoundary>` + `<SkeletonTable>`: distinct `nothing-yet` (CTA opens the
    create dialog) vs `nothing-found` (Clear filters) empty states.*
- [x] `2.1.3` (M) Client create/edit form: name, address, email, tax ID, currency override, notes
  - *`components/clients/client-form.tsx` — shared RHF form (`useZodForm`
    (`clientInputSchema`), inline `<FormField>` errors, server 422s mapped back via
    `applyFieldErrors`). Address is per-client `STRUCTURED` (line1/line2/city/
    postal/country) **or** `FREE_TEXT` (one blob) — see decision D16. Currency
    override reuses `PROFILE_CURRENCIES` + a "Use business default" choice that
    stores `null`. Notes are a textarea (new `components/ui/textarea.tsx`).*
- [x] `2.1.4` (S) Delete client with confirmation; decide behavior for clients referenced by existing invoices (recommend soft delete so historical invoices don't break)
  - *Soft delete (decision D4): `Client.deletedAt` stamped, never removed; every
    read filters `deletedAt: null`. Confirmation via a new reusable
    `components/ui/confirm-dialog.tsx`.*
- [x] `2.1.5` (S) Inline "add new client" from within the invoice form (modal, no navigation away)
  - *`components/clients/client-form-dialog.tsx` wraps the shared `ClientForm` in
    the `Modal` primitive with an `onSaved(client)` callback. The list page uses it
    for "New client" and row-edit today; Phase 4's invoice form drops in the same
    component to add-and-select without leaving the form.*

## Epic 2.2 — Products / services
- [x] `2.2.1` (M) Product CRUD API (name, description, default price, unit, default tax rate)
  - *`Product` model (`tenantId` → `users.id`, D3) registered in
    `TENANT_SCOPED_MODELS`. `routes/products.ts` → `services/product-service.ts`
    (scoped `req.db`), shapes in `packages/shared/src/product.ts`. Money as
    integers (decision D17): `defaultPriceMinor` (minor units, tenant default
    currency, nullable), `defaultTaxRateBp` (basis points, default 0). New
    `packages/shared/src/money.ts` holds the decimal⇆integer conversions the form
    uses. Search covers name + description.*
- [x] `2.2.2` (M) Product list page with search + empty state
  - *`routes/products/products-list-page.tsx` → `features/products/use-products.ts`.
    Debounced search; offset pagination (API always paginates, no sort control per
    the lighter spec here). Five states via `<QueryBoundary>` + `<SkeletonTable>`;
    `nothing-yet` (CTA → create dialog) vs `nothing-found` (Clear filters). Price
    column shows the tenant's default currency code from `useBusinessProfile`.*
- [x] `2.2.3` (M) Product create/edit form
  - *`components/products/product-form.tsx` — shared RHF form. Price and tax rate
    are decimal-string inputs (`priceInput` / `taxRateInput`) validated for format
    + range, converted to minor units / bp on submit via `money.ts`. Inline
    `<FormField>` errors + `applyFieldErrors` for server 422s.*
- [x] `2.2.4` (S) Soft delete; inline add from invoice form
  - *Soft delete (D4): `Product.deletedAt`, every read filters `deletedAt: null`,
    confirm via the shared `<ConfirmDialog>`. Inline add =
    `components/products/product-form-dialog.tsx` (shared `ProductForm` in a
    `Modal`, `onSaved(product)` callback) — list page uses it now; Phase 4's
    line-item editor drops in the same component.*
- [x] `2.2.5` (S) Product picker component: typeahead search, inserts a line item on select
  - *`components/products/product-picker.tsx` — dependency-free combobox (input +
    positioned listbox, keyboard nav, `aria-*`). Debounced `GET /products?search=`,
    compact `nothing-found` row with a Clear action (X.7.6). `onSelect(product)` is
    the whole API; the Phase 4 editor maps the selection onto a new line. No host
    screen yet — built ready, same as the dialogs.*

---

# PHASE 3 — Template engine & editor

The hardest and most differentiating part. Budget the most time here.

## Epic 3.1 — Template data model & renderer
- [x] `3.1.1` (L) Define the template config schema (JSON): block order, visibility toggles, accent color, font pairing, paper size, logo position. Zod-validated, versioned (add a `schemaVersion` field now so future changes don't break saved templates).
  - *`packages/shared/src/render/template-config.ts` — `templateConfigSchema`:
    `schemaVersion` literal (=1), `blockOrder` (refined permutation of the 10
    blocks), `visibility` (7 toggles incl. the line-item columns), `accentColor`
    (hex; `TEMPLATE_ACCENT_PRESETS` for the 3.2.5 palette), `fontPairing`
    (3 curated Noto pairs), `paperSize` (reuses `PAPER_SIZES`), `logo`
    position/size. Fully defaulted → `defaultTemplateConfig()`. Stored as `jsonb`
    (D2), always parsed before use.*
- [x] `3.1.2` (XL → split) Build the **single render engine**: takes `(templateConfig, invoiceData)` → HTML. This same function powers the live preview and the server-side PDF. Never write two renderers.
  - *`render/render.ts` — `renderInvoice(config, data, { media, assetBaseUrl })` →
    self-contained `<!doctype html>` (inline `<style>`, `@font-face`, no scripts).
    Framework-agnostic pure function (decision D18). `media:'screen'` = shadowed
    page box for the preview iframe; `media:'print'` = `@page` rules for Puppeteer.
    Inputs re-parsed through Zod at the boundary. Web: `components/template/
    invoice-preview.tsx` (`<iframe srcDoc sandbox>`); dev harness at
    `/dev/template-preview`. `render-check.mjs` proves preview HTML === PDF DOM.
    `render/invoice-math.ts` (`computeInvoiceTotals`) is the one totals calculator
    both sides call — 4.1.2 will formalise the rounding policy.*
- [x] `3.1.3` (L) Implement all invoice blocks: header/logo, business info, client info, invoice meta (number/dates), line items table, totals/tax summary, notes, bank details, signature line, footer
  - *`render/blocks.ts` — one renderer per block, returns `''` when toggled off /
    empty; `render.ts` walks `config.blockOrder`. Document-type behaviour (spec §5)
    lives in the meta + totals blocks: due date / "valid until" / "paid on" +
    method / credit-note ref, and "Amount due" vs "Amount credited" vs "Total".
    All text escaped via `render/html.ts`.*
- [x] `3.1.4` (M) Paper size handling: A4, US Letter, Legal, A5 — exact dimensions, correct margins, correct print CSS
  - *`render/paper.ts` — mm dimensions + `@page size` keyword + per-size margin
    (A5 tighter). `render/styles.ts` emits `@page{size;margin}` for print and a
    `.page` box at true mm for screen. Verified against `pdf-smoke`'s expected pt
    sizes (A4 595×842, Letter 612×792).*
- [x] `3.1.5` (M) Multi-page handling: long line-item lists paginate correctly, table headers repeat, totals never orphan on their own page
  - *CSS-only in `styles.ts`: `thead{display:table-header-group}` repeats the
    line-item header per page; `tr`, `.totals`, `.signature-block` carry
    `break-inside:avoid`. `render-check.mjs` confirms the `formal` / `statement`
    presets paginate to 2 pages cleanly.*
- [x] `3.1.6` (M) Font loading: Noto Sans + Noto Serif (full Latin Extended + Cyrillic) self-hosted; verify Macedonian renders correctly in every template
  - *Real woff2 subsets (latin + latin-ext + cyrillic, 400/700) committed at
    `packages/shared/assets/fonts/`, served by the API at `/fonts` (CORS-covered
    for the cross-origin preview; same-origin for the PDF). `render/fonts.ts`
    builds the `@font-face` rules and the D10-safe stacks (Noto → Helvetica/Georgia
    → generic; **never `system-ui`**). `apps/api/scripts/render-check.mjs`
    (`npm run render:check`) renders all 6 presets × EN/SQ/MK to PDF via Puppeteer
    and extracts the text back out — Cyrillic (`Фактура`, `Дизајн на бренд
    идентитет`, `Износ за плаќање`) and Albanian (`Faturë`, `të`) survive in all 18.*
- [x] `3.1.7` (M) Ship 4–6 curated base templates as starting presets
  - *`render/presets.ts` — 6 full configs (`classic`, `modern`, `minimal`,
    `formal`, `compact`, `statement`), each a valid `TemplateConfig`.
    `DEFAULT_TEMPLATE_PRESET_ID = 'classic'` is the free-tier default (spec §9,
    3.3.6). `render/sample.ts` provides the trilingual sample invoice used by the
    presets preview, the dev route and the font check.*

## Epic 3.2 — Visual template editor
- [x] `3.2.1` (L) Editor layout: controls panel + live preview side-by-side (desktop), tabbed (mobile/tablet)
  - *`components/template/template-editor.tsx` — `<TemplateEditor config onChange
    toolbar>`. `lg:grid lg:grid-cols-[minmax(320px,380px)_1fr]` side-by-side;
    `<Tabs>` (Design / Preview) below `lg`. State lives in the parent so the same
    editor serves 3.3 "New template" and the 4.2.4 inline flow. Dev host at
    `/dev/template-editor` (replaces the 3.1 preview harness).*
- [x] `3.2.2` (L) **Live preview**: pixel-matched HTML rendering at true page proportions, updates instantly on change (debounced). Real PDF is only generated on download/send.
  - *`components/template/invoice-preview.tsx` — the shared `renderInvoiceHtml`
    (`media:'screen'`) into `<iframe srcDoc sandbox="">`; page box sized to true mm
    (→px at 96dpi). Verified in a real headless browser: the sandboxed iframe
    loads the self-hosted Noto woff2 cross-origin and renders `Фактура` in Noto
    Serif (needed a wildcard `Access-Control-Allow-Origin` on `/fonts` — a
    sandboxed frame sends `Origin: null`). No PDF on change.*
- [x] `3.2.3` (M) Block visibility toggles: tax column, discount column, unit price, notes, bank details, signature, footer — every field in the spec
  - *`editor-controls.tsx` — all 7 `visibility` keys as `<Switch>` rows (new
    `components/ui/switch.tsx`), grouped "Line-item columns" vs "Optional
    sections". Hidden blocks show a "Hidden" badge in the reorder list.*
- [x] `3.2.4` (L) Block reordering (drag and drop) — use Motion's layout animations for smooth reorder
  - *`block-order-control.tsx` — Motion `Reorder.Group`/`Reorder.Item` +
    `useDragControls` (drag from the grip handle); layout animation honours
    `prefers-reduced-motion` via the app-wide `MotionConfig`. Every row also has
    ↑/↓ buttons — the no-pointer / reduced-motion path (X.3.2). Reorders the full
    10-block `blockOrder`; result stays a valid permutation.*
- [x] `3.2.5` (M) Accent color picker with sensible constrained palette + custom hex
  - *8-swatch palette from `TEMPLATE_ACCENT_PRESETS` + native `<input type=color>`
    + a hex text field (only a valid `#rrggbb` propagates).*
- [x] `3.2.6` (M) Font pairing selector (curated pairs only, all Cyrillic-safe)
  - *Radio list over `FONT_PAIRINGS` (`noto-sans`, `noto-serif-headings`,
    `noto-serif`) with `FONT_PAIRING_LABELS`. All three resolve to Noto — Cyrillic
    safe by construction (3.1.6).*
- [x] `3.2.7` (M) Logo position/size controls
  - *Segmented controls: position left/center/right (with align icons), size
    Small/Medium/Large → `config.logo`.*
- [x] `3.2.8` (S) Zoom/fit controls on preview
  - *`use-preview-zoom.ts` — `fit` (ResizeObserver scales the page to container
    width) plus `−`/`%`/`+` stepping through `ZOOM_STEPS`. Applied as a CSS
    `transform: scale()` on the iframe with the wrapper sized to the scaled box.*
- [x] `3.2.9` (M) Editor performance: preview must stay smooth while typing — memoize, debounce, avoid full re-render per keystroke
  - *`InvoicePreview` is `memo`'d; HTML is `useMemo`'d on `config`/`data`, then the
    `srcDoc` is debounced (~180ms) so holding a key in the hex field doesn't thrash
    the iframe. Controls emit whole-config immutably; the render call itself is
    sub-millisecond string building.*

## Epic 3.3 — Template management
- [x] `3.3.1` (M) Template CRUD API (tenant-scoped)
  - *`Template` model (`tenantId` → `users.id` D3, `config Json`, `isDefault`,
    `deletedAt`) in `TENANT_SCOPED_MODELS`. `routes/templates.ts` →
    `services/template-service.ts` (scoped `req.db`); stored `config` is re-parsed
    through `templateConfigSchema` on read. Shapes in
    `packages/shared/src/template.ts`. A tenant with no templates is lazily seeded
    the `classic` preset as its default.*
- [x] `3.3.2` (M) Templates list page: visual thumbnail previews, not just names
  - *`routes/templates/templates-list-page.tsx` — card grid, each card a
    `components/template/template-thumbnail.tsx` (the shared renderer scaled into a
    `pointer-events:none` iframe — real designs, not names). `useTemplates()`,
    `<QueryBoundary>` + `<SkeletonCard>`. Default badge; row-actions menu.*
- [x] `3.3.3` (S) Duplicate template
  - *`POST /templates/:id/duplicate` (optional name override; default
    `"<name> (copy)"`, `isDefault:false`). List-page action → duplicates then opens
    the copy in the editor.*
- [x] `3.3.4` (S) Set default template for the tenant
  - *`isDefault` boolean; `POST /templates/:id/default` swaps it inside a
    transaction (unset others → set this). Exactly one live default is a service
    invariant, not a DB constraint. First template a tenant creates auto-becomes
    the default.*
- [x] `3.3.5` (S) Delete template; handle templates referenced by existing invoices
  - *Soft delete (D4): `deletedAt` set, row kept so a historical invoice's
    reference still resolves (X.7.22). `DELETE` returns the fresh list; refuses
    (409) the tenant's last template; auto-promotes the oldest remaining to default
    if the deleted one was default. UI only offers Delete on non-default cards.*
- [x] `3.3.6` (M) Free tier restriction: default template only, editor locked with upgrade prompt
  - *New `apps/api/src/lib/entitlements.ts` — the single tier-reading seam
    (decision D19); `requireCanManageTemplates(userId)` gates every template write
    with a 403 + upgrade message for `FREE`. Web: `useSession().tier` hides "New
    template" / card actions and shows an upgrade banner (X.7.17 friendly gate) for
    free; `/templates/new` and `/templates/:id` redirect free users to the list.*

---

# PHASE 4 — Invoices

## Epic 4.1 — Invoice data model
- [x] `4.1.1` (M) Schema: Invoice header (number, type, dates, currency, paper size, template ref, client ref, notes) + InvoiceLineItem (description, qty, unit, unit price, tax rate, discount)
  - *Prisma `Invoice` + `InvoiceLineItem` (+ `InvoiceNumberSequence`,
    `InvoiceNumberingSetting`), migration `20260830184216_add_invoices`. `Invoice`
    added to `TENANT_SCOPED_MODELS`; `InvoiceLineItem` is reached only via the
    scoped parent (no `tenantId`, cascade-deleted). Live FKs to
    client/template/product AND a name/address/line-text snapshot frozen at Save
    (decision D20). Wire shapes in `packages/shared/src/invoice.ts`.*
- [x] `4.1.2` (M) **Money handling**: store all amounts as integer minor units. Never floats. Define and document rounding rules (line-level vs document-level tax rounding) once, apply everywhere.
  - *All `*Minor` / `*Bp` / `quantityMilli` integer columns (D17). Rounding policy
    settled in decision D20: **line-level, half-up**, implemented once in
    `packages/shared/src/render/invoice-math.ts` (`computeInvoiceTotals`) — the
    one calculator the preview and the server both call; server is source of
    truth (4.2.3).*
- [x] `4.1.3` (M) Invoice numbering: sequential per tenant, configurable prefix/format, gapless. Proforma and quotes use a separate sequence and do not consume invoice numbers.
  - *`apps/api/src/services/invoice-numbering.ts`. Five independent gapless
    counters (one per document type, keyed `tenantId + documentType + year`).
    `allocateInvoiceNumber` = atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`
    (the sanctioned raw path from `tenant-scope.ts`, explicit `tenantId`), run in
    the caller's txn. Per-type `InvoiceNumberingSetting` (format tokens
    `{prefix}{YYYY}{YY}{seq}`, `{seq}` padding, tenant's yearly-reset toggle),
    lazily seeded. Number assigned on first explicit Save, never on draft autosave
    (`status` DRAFT→ISSUED). `npm run numbering:check -w @invoice-saas/api` proves
    25 concurrent allocations stay gapless.*
- [x] `4.1.4` (M) Document type field driving label/field differences: Invoice, Proforma, Quote/Estimate, Credit Note, Receipt
  - *`DocumentType` enum (mirrors the renderer's `DOCUMENT_TYPES`).
    `DOCUMENT_TYPE_FIELDS` in `shared/src/invoice.ts` is the single table of
    per-type header/totals differences (secondary date = due / valid-until / none,
    paid-date, payment-method, credit-note ref, closing amount line) — consumed by
    the form (4.2.1), the shared validator, and `render/labels.ts`.*
- [x] `4.1.5` (S) Credit note reference field linking to an original invoice
  - *`Invoice.creditNoteRef` (free-text original number, always printed) +
    `creditNoteOfId` self-relation (hard link when the original is one of this
    tenant's). `invoiceInputSchema.superRefine` requires one of them when
    `documentType === CREDIT_NOTE`.*

## Epic 4.2 — Invoice creation
- [x] `4.2.1` (L) Invoice form: client picker, document type selector, template picker, date fields, currency, paper size
  - *`routes/invoices/invoice-create-page.tsx` (`/invoices/new`) → `components/
    invoices/invoice-form.tsx`. Plain-state form (same pattern as the template
    editor page), inline errors via `<FormField>`, `DOCUMENT_TYPE_FIELDS` drives
    which header fields show per type. `client-picker.tsx` is a typeahead over
    `/clients` with inline "add client" (reuses `<ClientFormDialog>`).
    `POST/PATCH /invoices` + `POST /invoices/:id/finalize` in
    `services/invoice-service.ts` / `routes/invoices.ts`.*
- [x] `4.2.2` (L) Line item editor: add/remove/reorder rows, product picker or free text, qty/price/tax/discount, live-calculated totals
  - *`components/invoices/line-items-editor.tsx` (+ pure row model/conversions in
    `line-items.ts`). Add from `<ProductPicker>` or a blank row; reorder with
    up/down; per-row live amount via the shared `computeLineItem`. Money binds to
    decimal strings, converts through `money.ts` (D17). X.7.7 empty placeholder.*
- [x] `4.2.3` (M) Totals panel: subtotal, per-rate tax breakdown, discounts, grand total — calculated **server-side as source of truth**, frontend calculation for display only
  - *`components/invoices/totals-panel.tsx`. Server is authoritative:
    `POST /invoices/calculate` (stateless) and every draft-save echo carry
    `computeInvoiceTotals` output incl. the per-rate `taxLines`; the form computes
    locally only to avoid a stale flash between saves (`syncing`).*
- [x] `4.2.4` (M) "Start from scratch" flow: design a new template inline while creating the invoice → on save, both the invoice **and** the reusable template are saved
  - *Template picker has a "Start from scratch…" option → embeds `<TemplateEditor>`
    in a modal; its config travels in the payload as `newTemplate {name, config}`.
    `finalizeInvoice` persists it via `createTemplate(db, …)` first, then links the
    invoice — one request. `invoiceInputSchema` refuses `templateId` + `newTemplate`
    together.*
- [x] `4.2.5` (M) Live preview panel alongside the form (same renderer)
  - *`components/invoices/invoice-preview-panel.tsx` builds an `InvoiceRenderData`
    from the form value + profile + chosen client and renders `<InvoicePreview>` —
    the same shared `renderInvoice` the PDF (4.3) will use. Split form|preview on
    `lg`, preview sticky.*
- [x] `4.2.6` (S) Draft autosave while composing (before first explicit save)
  - *`features/invoices/use-invoice-draft.ts`: the form pushes its whole value to
    `queueSave`; a 1.2s debounce `POST`s a `DRAFT` on the first real edit, `PATCH`es
    after. Serialised writes + mid-save chase live in one `setTimeout` closure (no
    setState-in-effect). `finalize()` is the first explicit Save → number + `ISSUED`
    (decision D20). Never creates a row for a form the user only glanced at.*
- [x] `4.2.7` (M) Multi-currency per invoice, with correct symbol/format per locale
  - *`invoice.currency` (any ISO 4217, wider than the profile list) frozen on the
    row; the renderer's `formatMoney` already does per-locale symbol/grouping via
    `Intl`. Form currency select defaults from the profile; totals/preview reflect
    the choice.*

## Epic 4.3 — Preview, download, send
- [x] `4.3.1` (L) Server-side PDF generation (Puppeteer) from the shared renderer; correct page size, embedded fonts, selectable text
  - *`services/pdf-service.ts` → shared `renderInvoice` (`media:'print'`) →
    `lib/pdf/browser-pool.ts`. `preferCSSPageSize` honours the renderer's `@page`;
    fonts/logo served from disk via request interception (no real network);
    `document.fonts.ready` awaited before `page.pdf()`. `npm run pdf:check
    -w @invoice-saas/api` parses the output: A4 = 595×842pt, text selectable,
    Cyrillic survives.*
- [x] `4.3.2` (M) PDF generation performance: browser instance pooling, timeout handling, queue if slow. This is your heaviest server operation — plan for it.
  - *`lib/pdf/browser-pool.ts`: one lazily-launched Chrome for the process,
    auto-relaunch on `disconnected`; a FIFO semaphore caps concurrent pages at 2,
    the rest queue; 20s `PdfTimeoutError` via `Promise.race`. `closeBrowserPool()`
    for shutdown/tests.*
- [x] `4.3.3` (M) **Download** action: generates fresh PDF from current data, correct filename (`INV-2026-001_ClientName.pdf`)
  - *`POST /invoices/:id/pdf` streams `application/pdf` with `Content-Disposition`
    (plain + `filename*=UTF-8''`) and `Cache-Control: no-store` — always
    regenerated, never cached (spec §6). Filename from shared `invoicePdfFilename`
    (`INV-2026-0001_ClientName.pdf`). Body `{ draft }` renders unsaved edits
    (4.4.2); `{ draft: null }` the saved row. Web: `apiFetchBlob` (same
    auth/refresh as `apiFetch`) → `useDownloadInvoicePdf` triggers an
    `<a download>`. Draft invoice → 409.*
- [x] `4.3.4` (M) **Send** action: transactional email provider integration (Resend/Postmark), PDF attached, localized email body
  - *`POST /invoices/:id/send` → `sendInvoice` renders the PDF and calls
    `mailer.send({ …, attachments:[pdf] })`. The `Mailer` port now carries
    `attachments`; transport stays `ConsoleMailer` (writes the PDF to a temp file,
    logs it) — the concrete provider is still the one-line swap in
    `mail/index.ts` (decisions.md open item). Recipient is the client's saved
    email (spec §91).*
- [x] `4.3.5` (S) Send disabled with tooltip when client has no email; download always available
  - *`<InvoiceActions>`: Send `disabled` + a `<Tooltip>` (wrapper `<span>` so the
    disabled button still gets hover) when `invoice.client.email` is null; server
    also 422s. Download has no such gate.*
- [x] `4.3.6` (M) Email template design (the covering email, in the tenant's language)
  - *`mail/invoice-email.ts` — trilingual EN/SQ/MK covering email (subject + text +
    minimal HTML), keyed off `invoice.language` (spec §10), document-type word from
    `renderLabels`, amount via shared `formatMoney`.*
- [x] `4.3.7` (S) Email delivery failure handling and user feedback
  - *Mailer failure → 502 with an explicit "PDF was generated but the email could
    not be sent" message; `<InvoiceActions>` renders that as a distinct panel with
    "Download instead" + "Try again" (X.7.15), separate from the send-success panel
    that shows recipient + timestamp (X.7.10). Slow (>3s) note on both buttons
    (X.7.3); a download failure never implies success (X.7.14).*

## Epic 4.4 — Editing, saving, duplicating
- [x] `4.4.1` (M) Open saved invoice in edit mode with all data loaded
  - *`/invoices/:id/edit` → `routes/invoices/invoice-edit-page.tsx` →
    `components/invoices/invoice-edit-form.tsx`. Hydrates from the `InvoiceResponse`
    via `invoice-form-state.ts` (`headerFromInvoice` / `rowsFromInvoice` /
    `syntheticClientFromInvoice` — the last builds a stand-in `ClientResponse` from
    the frozen snapshot so a deleted client still shows). Form body
    (`<InvoiceFormFields>`) is shared with the create flow.*
- [x] `4.4.2` (M) **Save / Cancel semantics**: Save explicitly persists; Cancel discards and reverts; Download/Send from an edit screen use current edited data **without** auto-saving
  - *Edit form has no autosave. Save → `PATCH /invoices/:id` (`saveInvoice`) which
    keeps `number`/`status`/`issuedAt`, re-snapshots parties, recomputes totals;
    **document type is locked** after issue (server 422s a change — user's choice).
    Cancel → confirm + navigate back, nothing written. Download/Send →
    `<InvoiceActions draft={payload}>` POSTs `{ draft }` to `/pdf` and `/send`;
    `buildPreviewResponse` renders those unsaved edits as this invoice (keeps its
    number) without persisting.*
- [x] `4.4.3` (S) Unsaved-changes warning on navigate away
  - *`hooks/use-before-unload.ts` — `beforeunload` prompt while `dirty` (baseline
    = `JSON.stringify(payload)` at open). In-app nav is covered by the Cancel
    confirm dialog; a full router blocker needs a data router this app doesn't use.*
- [x] `4.4.4` (M) **Duplicate**: copies client, line items, template, type, paper size into a new invoice with new ID, new number, blank history
  - *`POST /invoices/:id/duplicate` → `duplicateInvoice` maps the source row to an
    `InvoiceInput` and calls `createDraft` — new id, `DRAFT`, no number, parties
    re-snapshotted from current data. A since-deleted client is dropped rather than
    failing. Web: `<InvoiceRecordActions>` → opens the copy at `/invoices/:id/edit`.*
- [x] `4.4.5` (S) Delete invoice with confirmation
  - *`DELETE /invoices/:id` → soft delete (D4); the number stays consumed (never
    reused). Web: `<InvoiceRecordActions>` `<ConfirmDialog>` → navigate to
    `/invoices` on success.*

## Epic 4.5 — Invoice library
- [x] `4.5.1` (M) List page: search by client/number, filter by type/date range, sort, pagination
  - *`GET /invoices` (`invoiceListQuerySchema`) → `listInvoices`. Filters: `search`
    (number OR snapshot `clientName`), `status` (all/issued/**draft**, default
    `issued` — Epic 4.5 decision: status filter, default issued), `documentType`,
    `dateFrom`/`dateTo` on `issueDate`, `sort` (newest/oldest/client/total ±),
    page/pageSize. Rows are scalar columns only (stored `grandTotalMinor`, no line
    items). Web: `routes/invoices/invoices-list-page.tsx` — same `<QueryBoundary>`
    + `<SkeletonTable>` shape as the client/product lists, `keepPreviousData`.*
- [x] `4.5.2` (M) Row actions: open, duplicate, download, delete
  - *`<DropdownMenu>` per row → open (`/invoices/:id`), duplicate
    (`useDuplicateInvoice` → opens the copy at `/edit`), download (issued only,
    `useDownloadInvoicePdf`), delete (`<ConfirmDialog>` → `useDeleteInvoice`,
    steps back a page if it emptied the last one).*
- [x] `4.5.3` (S) Empty state with clear CTA
  - *`nothing-yet` (no filters, 0 total) → "Create your first invoice" → `/invoices/new`;
    `nothing-found` (any filter active) → "No invoices match" + Clear filters.*
- [x] `4.5.4` (M) **CSV export** of the invoice list (filtered set), with all key fields for the user's bookkeeping
  - *`GET /invoices/export.csv` (registered before `/:id`) → `exportInvoicesCsv`:
    same filters, no pagination. Number, type, status, dates, client name/email/
    tax-id, currency, subtotal/discount/tax/total as **decimal strings** for
    bookkeeping; UTF-8 BOM + CRLF so Excel opens Cyrillic/Albanian correctly;
    fields with `,"`↵ quoted. Web: `apiFetchBlob(..., 'text/csv')` →
    `useExportInvoicesCsv` triggers the download; "Export CSV" button uses the
    current filter set. Verified live: BOM present, `"Акме, Ко"` quoted.*

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
| 1 | Hostinger VPS vs shared hosting | **VPS, deferred.** Build and test locally against real Postgres now; provision the VPS at `0.3.1` | `D1`, `D2` |
| 2 | AI generation monthly limit on Premium | 50 successful generations per calendar month | `D6` |
| 3 | Teammates later? | No — single `users` table, one row per business. Child tables still carry `tenant_id` so the split stays cheap if it is ever needed | `D3` |
| 4 | Soft vs hard delete | Soft delete for clients and products | `D4` |
| 5 | Manual grant + Stripe conflict | Most access wins; both records preserved | `D5` |

Decided since, not on the original list: `D7` monorepo layout · `D8` TypeScript pinned to
6.0.x · `D9` placeholder English copy until `X.1.1` · `D10` `system-ui` banned from any
surface that reaches a PDF · `D11` Prisma for migrations and data access.

**Still open, deliberately deferred:** transactional email provider (`4.3.4`), session
strategy (`1.1.1`), and the two D1 verification checks above.
