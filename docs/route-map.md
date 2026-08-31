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

Phase 8 shipped backend-only, so this is currently one page.

| Path | Screen |
|---|---|
| `/admin` | `AdminHomePage` — "backend endpoints exist, console UI not built yet" |
| `/admin/*` (unmatched) | `RouteStatusPage status={404}` |
| any `/admin*` as a non-admin | `RouteStatusPage status={403}` |

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
- The full `/admin/*` screen set is future work (Phase 8 UI); the structure and
  guard are in place now.
