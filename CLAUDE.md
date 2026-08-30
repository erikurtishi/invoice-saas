# CLAUDE.md

## Project

Multi-tenant invoice-generation SaaS for the Balkans (MK/AL/XK) + US market.
Full product spec: docs/invoice-saas-spec.md
Full phased backlog: docs/invoice-saas-backlog.md
Read both before starting any feature work.

## Structure

- apps/web — React + TypeScript + Vite, Tailwind, TanStack Query, lucide-react, Motion (GSAP only for complex/landing animations)
- apps/api — Node + Express + TypeScript
- packages/shared — Zod schemas/types imported by both apps, single source of truth for data shapes

## Package manager

npm workspaces. Run installs from the repo root, not inside individual app folders.

## Conventions

- Every screen implements all 5 UI states (loading/empty/success/error/partial) — see backlog Epic 0.4b and X.7
- Money is always integer minor units, never floats
- Multi-tenant: every DB query scoped by tenant_id via middleware, never per-route
- i18n: no hardcoded UI strings — English/Albanian/Macedonian
- One shared render function powers both the live template preview and the server PDF — never two renderers
