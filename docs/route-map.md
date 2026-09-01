# Route map

Decision `D32` (Epic X.6). The web app is split into three top-level areas.

| Area | Prefix | Shell | Guard |
|---|---|---|---|
| Marketing | `/` | none (own header + `AppFooter`) | public; a signed-in visitor is redirected on |
| Signed-in app | `/console/*` | `AppShell` (sidebar / mobile nav) | `RequireAuth` + onboarding gate |
| Admin center | `/admin/*` | none yet (own minimal chrome) | `RequireAuth` + `role === 'ADMIN'` (else 403) |

## Public (no auth)

| Path | Screen |
|---|---|
| `/` | `LandingPage` — value prop, showcase, pricing, CTA (lazy-loaded; pulls GSAP) |
| `/login` `/signup` `/forgot-password` `/reset-password` `/verify-email` | auth screens |
| `/privacy` `/terms` | legal pages |
| `*` (unmatched, public) | `RouteStatusPage status={404}` |

## `/console/*` — signed-in app (`RequireAuth`)

`/onboarding` sits just outside the console (authed, its own focused layout); the
console redirects there until `onboardingCompleted`.

| Path | Screen |
|---|---|
| `/console` | Dashboard (activity feed) |
| `/console/invoices` · `/invoices/new` · `/invoices/:id` · `/invoices/:id/edit` | invoice library / create / detail / edit |
| `/console/clients` · `/console/products` | list pages |
| `/console/templates` · `/templates/new` · `/templates/:id` | template gallery / editor |
| `/console/pricing` | plan & billing |
| `/console/settings` | business profile + account |
| `/console/dev/states` · `/console/dev/template-editor` | dev-only (`import.meta.env.DEV`) |
| `/console/*` (unmatched) | `RouteStatusPage status={404}` (inside the shell) |

## `/admin/*` — admin center (`RequireAuth` + `ADMIN`)

`AdminLayout` gates on `role === 'ADMIN'` and renders `<AdminShell>` (its own
minimal chrome — top bar + horizontal section nav, distinct from `AppShell`).
Screens are built on the already-complete Phase 8 backend (backlog Phase L2).

| Path | Screen |
|---|---|
| `/admin` | `AdminOverviewPage` — MRR / subs / signups / churn / conversion + signups-per-day and month-end-MRR charts (L2.2) |
| `/admin/tenants` | `AdminTenantsPage` — tenant list + detail + disable/enable/delete (L2.3) |
| `/admin/grants` | `AdminGrantsPage` — manual subscription grant / extend / revoke (L2.4) |
| `/admin/usage` | `AdminUsagePage` — AI / email / storage / anomalies (L2.5) |
| `/admin/billing` | `AdminBillingPage` — unified Stripe + manual subscriptions, "needs attention" (L2.6) |
| `/admin/support` | `AdminSupportPage` — ticket list (L2.7) |
| `/admin/support/:id` | `AdminSupportDetailPage` — thread + reply + status transitions (L2.7) |
| `/admin/audit-log` | `AdminAuditLogPage` — filterable admin action trail (L2.3.5) |
| `/admin/*` (unmatched) | `RouteStatusPage status={404}` (inside `AdminShell`) |
| any `/admin*` as a non-admin | `RouteStatusPage status={403}` |

All of Phase L2 shipped — every `/admin/*` section above is a real screen, none are
placeholders. Charts use `recharts`, lazy-loaded and theme-aware, imported only from
`components/admin/admin-chart.tsx` (decision `D34`).

## Redirects

| From | To | When |
|---|---|---|
| `/` | `/console` or `/admin` | visitor already has a session |
| `/console/**` | `/onboarding` | session but `onboardingCompleted === false` |
| `/onboarding` | `/console` | onboarding already done |
| any authed route | `/login?next=<path>` | no session (`RequireAuth`) — `next` restores the exact path after login |
| signup / verify-email success | `/console` | — |
| `safeNextPath(raw)` default | `/console` (`DEFAULT_AUTHED_PATH`) | no / invalid / bare-`/` `next` |

## Notes

- `RouteStatusPage`'s "home" button is session-aware: `/console` ("Go to dashboard")
  for a signed-in user, `/` ("Go to homepage") for a visitor.
- API endpoints are unaffected — `apiFetch('/invoices')` etc. still hit the API
  origin; only React Router paths moved.
- The `/admin/*` screen set (backlog Phase L2, on the complete Phase 8 backend) is
  **done** — every section is a real screen.
