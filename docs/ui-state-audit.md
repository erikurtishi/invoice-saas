# UI state audit — Epic X.7.26

Every screen signed off on all five mandatory states (loading / empty / success /
error / partial). This is the checklist that gates a milestone ship: re-run it
before each release and update the "verified" column.

- **Primitives:** `apps/web/src/components/state/` (Epic 0.4b) — `QueryBoundary`,
  `Skeleton*`, `EmptyState`, `ErrorState`, `ErrorBoundary`, `OfflineBanner`,
  toast system. See `docs/ui-state-primitives.md`.
- **Force any state in dev (X.7.27):** append `?force=loading|error|empty|refetching`
  to a URL, optionally scoped `?force=empty:invoices`. See the `/dev/states`
  gallery. Reload after changing the param.
- **Legend:** ✅ implemented & verified · ➖ not applicable (with reason) · 🔷 handled
  by a shared primitive with no screen-specific behaviour needed.
- **Paths:** the signed-in app moved under `/console/*` in `D32` (Epic X.6). The
  route names below (e.g. "`/invoices`") are unprefixed for brevity; the live path
  is `/console/invoices`. See `docs/route-map.md`.

---

## Authenticated app

### Dashboard (`/` — `routes/dashboard/dashboard-page.tsx`)

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | `SkeletonList rows={10}` via `QueryBoundary name="dashboard"`. |
| Empty | ✅ | `nothing-yet` (CTA → `/invoices`) vs `nothing-found` (Clear filters) split on `filtersActive`. |
| Success | ✅ | Activity feed with list-stagger; pagination status is `role="status"`. |
| Error | ✅ | `QueryBoundary` inline `ErrorState` + retry. |
| Partial | ✅ | Single feed query, so "one widget fails" (X.7.20) doesn't apply — it's one surface. Background refetch shows the `QueryBoundary` refreshing bar (X.7.25). Client-filter dropdown degrades to "All clients" if its own query fails. |

### Invoice library (`/invoices` — `routes/invoices/invoices-list-page.tsx`)

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | `SkeletonTable rows={8} columns={6}` (`name="invoices"`). |
| Empty | ✅ | `nothing-yet` (New invoice CTA) vs `nothing-found` (Clear filters) on `filtersActive` (X.7.5 / X.7.6). |
| Success | ✅ | Table ≥ md, `RecordCard` stack below; CSV export disabled when `total === 0`. |
| Error | ✅ | `QueryBoundary` + retry (X.7.13). Row actions (duplicate/download/delete) toast on failure. |
| Partial | ✅ | Placeholder-data page swaps dim to `opacity-60`; refreshing bar on refetch. Partial CSV export → X.7.24 (below). |

### Invoice detail (`/invoices/:id` — `routes/invoices/invoice-detail-page.tsx`)

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | `SkeletonForm fields={8}` (`name="invoice-detail"`). |
| Empty | ➖ | A single record — 404 handled by `RouteStatusPage` when the id is unknown (`useInvoice` → `QueryBoundary` error). |
| Success | ✅ | Shared render preview (byte-identical to PDF); Download / Send in `InvoiceActions`. |
| Error | ✅ | `QueryBoundary` page-level; `InvoiceActions` has its own download/send failure states. |
| Partial | ✅ | `invoice.templateMissing` → in-place notice (X.7.22). Deleted client is soft-delete (D4) so the client block still renders from the invoice's own snapshot — no broken state. Logo: `<img alt={businessName}>` + no-URL fallback `doc-logo-fallback` (X.7.23). History timeline loads/fails independently of the invoice body. |

### Invoice create (`/invoices/new` — `routes/invoices/invoice-create-page.tsx`)

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | `SkeletonForm` per dependency (profile, templates). |
| Empty | ➖ | Form screen. Zero line items in the live preview → placeholder row (X.7.7, `render/blocks.ts` + `labels.lineItemsEmpty`). |
| Success | ✅ | Issue → toast + navigate to detail. |
| Error | ✅ | `QueryBoundary` on each dependency; field validation inline (X.7.12); server limit re-checked (6.1.4). |
| Partial | ✅ | Free-tier limit reached → `UpgradeCallout` gate, not an error (X.7.17). "Last invoice" soft warning. Entitlements query failing → form still shown, server enforces. AI panel partial fill → `AiFilledBadge` (X.7.21). |

### Invoice edit (`/invoices/:id/edit` — `routes/invoices/invoice-edit-page.tsx`)

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | `SkeletonForm` per dependency (invoice, profile, templates). |
| Empty | ➖ | Form screen. |
| Success | ✅ | Save → toast + navigate; edit-screen Download / Send render unsaved edits. |
| Error | ✅ | `QueryBoundary` per dependency; inline validation; `InvoiceActions` failure states. |
| Partial | ✅ | Same template-missing / logo fallbacks as detail. |

### Clients (`/clients` — `routes/clients/clients-list-page.tsx`)

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | `SkeletonTable rows={8} columns={4}` (`name="clients"`). |
| Empty | ✅ | `nothing-yet` (Create your first client) vs `nothing-found` (Clear filters). |
| Success | ✅ | Table ≥ md / `RecordCard` below; create + edit via dialog with inline validation. |
| Error | ✅ | `QueryBoundary` + retry; delete failure keeps the confirm dialog open + toasts. |
| Partial | ✅ | Refreshing bar on refetch; pagination auto-steps back when the last row on a page is deleted. |

### Products (`/products` — `routes/products/products-list-page.tsx`)

Same shape as Clients. `name="products"`. Price/tax formatting degrades to `—`
when the profile currency query hasn't resolved. ✅ all five.

### Templates (`/templates` — `routes/templates/templates-list-page.tsx`)

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | 3× `SkeletonCard` grid (`name="templates"`). |
| Empty | ➖ | The tenant always has ≥ 1 template (the seeded default, which can't be deleted), so `isEmpty={() => false}` is deliberate. |
| Success | ✅ | Thumbnail card grid with list-stagger; default badge; row menu (edit/duplicate/set-default/delete). |
| Error | ✅ | `QueryBoundary` + retry; row actions toast on failure. |
| Partial | ✅ | Free tier: whole page is read-only with a locked "New template" tooltip + an upgrade banner (X.7.17), not an error. |

### Template editor (`/templates/new`, `/templates/:id` — `routes/templates/template-editor-page.tsx`)

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | `SkeletonTemplateEditor` — controls rail + page-shaped `SkeletonInvoicePreview` at the editor's real `lg` split, so it doesn't collapse to a form skeleton then jump (X.7.2). Controls only mount after the config loads. |
| Empty | ➖ | Editor screen. `/templates/new` starts from `defaultTemplateConfig()`. |
| Success | ✅ | Live preview (debounced shared render); Save → toast + navigate. |
| Error | ✅ | Load failure → `QueryBoundary` inline error + retry; save failure → toast; name validation inline with focus. |
| Partial | ✅ | Free tier can't reach this route (`<Navigate>` to the list, which carries the upsell). Preview logo/asset failure → text fallback. |

### Pricing / plan (`/pricing` — `routes/pricing/pricing-page.tsx`)

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | `SkeletonCard` for the entitlements panel; the static plan comparison renders immediately. |
| Empty | ➖ | Always has content (plan grid). |
| Success | ✅ | "Your plan" panel; checkout return `?checkout=success` → toast + entitlements refetch (twice, for the webhook lag). |
| Error | ✅ | Entitlements query error is inline (page still useful — partial); `checkout`/`portal` mutation errors → toast (X.7.16). |
| Partial | ✅ | `?checkout=cancelled` → info toast (covers card-declined, which returns from Stripe's hosted page as a cancel). **Subscription lapsed:** by design (D23) Stripe dunning handles the past-due window and the tenant silently keeps access; when Stripe finally cancels, entitlements drop to FREE and the normal FREE gates / `UpgradeCallout`s take over. No separate in-app past-due banner — the web entitlements schema deliberately doesn't expose `PAST_DUE`. |

### Settings / business profile (`/settings` — `routes/settings/business-profile-page.tsx`)

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | `SkeletonForm fields={8}`. |
| Empty | ➖ | Always a form (new tenants get defaults from onboarding). |
| Success | ✅ | Save → toast; logo upload/remove → toast; data export → file. |
| Error | ✅ | `QueryBoundary` + retry; inline field validation with focus; logo type/size errors inline; export error → toast. |
| Partial | ✅ | Logo section fails independently of the profile form. Delete-account flow is its own confirm + destructive path. |

### Onboarding (`/onboarding` — `routes/onboarding/onboarding-page.tsx`)

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | `SkeletonForm fields={8}` for the profile prefetch. |
| Empty | ➖ | Wizard. |
| Success | ✅ | Completes → redirect into the shell. |
| Error | ✅ | `QueryBoundary` + step-level validation. |
| Partial | ➖ | Single-surface wizard. |

---

## Auth (public, no shell)

`routes/auth/*` — login, signup, forgot-password, reset-password, verify-email.

| State | Verified | Notes |
|---|---|---|
| Loading | ✅ | Submit buttons use `isLoading` (width preserved); `verify-email` has a dedicated "Confirming…" state. |
| Empty | ➖ | Forms. |
| Success | ✅ | Each has an explicit success screen (e.g. `forgotSentTitle`, `verifySuccessTitle`, `resetUpdated`). |
| Error | ✅ | Inline field errors, i18n'd, with focus (X.7.12); bad-credentials / expired-link / missing-token each get their own copy. |
| Partial | ✅ | `verify-email-banner` is the persistent "confirm your address" partial state across the whole app; resend has sent/failed sub-states. |

---

## Cross-cutting

| Item | Verified | Notes |
|---|---|---|
| 404 (X.7.19) | ✅ | `RouteStatusPage status={404}` on the `*` route, inside the shell, i18n'd, "Go back" (when there's history) + "Go to dashboard". |
| 403 (X.7.19) | ✅ | `RouteStatusPage status={403}` component ready; no in-app surface currently 403s (FREE-tier template editor redirects to the list with an upsell — a deliberately friendlier gate, X.7.17). |
| Offline (0.4b.9) | 🔷 | `OfflineBanner` at the top of the shell, `navigator.onLine` via `useSyncExternalStore`. |
| Route crash (0.4b.5) | 🔷 | `ErrorBoundary` around the router keeps nav usable; `key={location.pathname}` clears a stuck error on navigation. |
| Slow / stale data (X.7.25) | 🔷 | `QueryBoundary` renders a thin indeterminate bar on `isFetching` over existing data instead of a skeleton. |
| PDF generation (X.7.3 / X.7.14) | ✅ | `InvoiceActions`: progress state on Download/Send, "still working" note past ~3s, failure that never implies success. |
| Send success / failure (X.7.10 / X.7.15) | ✅ | Send has its own confirmation (recipient + timestamp); 502 → distinct "PDF made, email failed" branch offering Download + retry. |
| AI generation (X.7.4 / X.7.18 / X.7.21) | ✅ | Motion loading panel with Cancel (AbortController); AbortError filtered; failure shows a message and the server does not decrement the counter; partial fills marked by `AiFilledBadge`. |
| Limit-reached gates (X.7.17) | ✅ | `UpgradeCallout` (free invoice used), AI monthly counter, template lock — all framed as upgrade paths, not errors. |
| Partial CSV export (X.7.24) | ➖ | `exportInvoicesCsv` serialises plain denormalised columns off each invoice row (`number`, `clientName`, money as decimal strings) — there is no per-row sub-operation that can fail, so "some rows failed" doesn't arise. The request as a whole either succeeds or 500s → error toast. If a future export gains per-row rendering (e.g. an accounting-format transform), revisit. |

---

## Not applicable / deferred

- **Admin console screens** (X.7.1 admin tenant list, X.7.8 admin no-data charts,
  X.7.20 admin overview widgets, X.7.9 manual-grant success): Phase 8 shipped
  **backend only** — there is no admin UI yet (see `docs/decisions.md` D-notes for
  Epic 8). When the admin UI is built it inherits the same primitives; these rows
  get added then.
