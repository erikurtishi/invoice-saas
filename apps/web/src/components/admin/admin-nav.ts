import { BarChart3, CreditCard, Gauge, LifeBuoy, ScrollText, Ticket, Users } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * The admin center's navigation (backlog `L2.1.1`). Deliberately its own list,
 * not `nav-items.ts` — the admin area carries minimal chrome distinct from the
 * console `AppShell`, and its sections map to the Phase 8 backend, not the
 * tenant-facing app.
 *
 * `labelKey` resolves under the `admin.nav.*` i18n area (en source of truth,
 * `sq`/`mk` mirrored, gated by `npm run i18n:check`).
 */
export interface AdminNavItem {
  to: string;
  labelKey:
    | 'admin.nav.overview'
    | 'admin.nav.tenants'
    | 'admin.nav.grants'
    | 'admin.nav.usage'
    | 'admin.nav.billing'
    | 'admin.nav.support'
    | 'admin.nav.auditLog';
  icon: ComponentType<{ className?: string }>;
  /** Only `/admin` (the overview index) needs an exact match. */
  end: boolean;
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { to: '/admin', labelKey: 'admin.nav.overview', icon: BarChart3, end: true },
  { to: '/admin/tenants', labelKey: 'admin.nav.tenants', icon: Users, end: false },
  { to: '/admin/grants', labelKey: 'admin.nav.grants', icon: Ticket, end: false },
  { to: '/admin/usage', labelKey: 'admin.nav.usage', icon: Gauge, end: false },
  { to: '/admin/billing', labelKey: 'admin.nav.billing', icon: CreditCard, end: false },
  { to: '/admin/support', labelKey: 'admin.nav.support', icon: LifeBuoy, end: false },
  { to: '/admin/audit-log', labelKey: 'admin.nav.auditLog', icon: ScrollText, end: false },
];
