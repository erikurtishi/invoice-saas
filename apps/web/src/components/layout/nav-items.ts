import {
  CreditCard,
  FileText,
  LayoutDashboard,
  LayoutTemplate,
  Package,
  Settings,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';

export interface NavItem {
  to: string;
  /** Key into the `nav` translation area — resolved with `t()` at render. */
  labelKey:
    | 'nav.dashboard'
    | 'nav.invoices'
    | 'nav.clients'
    | 'nav.products'
    | 'nav.templates'
    | 'nav.pricing'
    | 'nav.settings';
  icon: ComponentType<{ className?: string }>;
  /** Only `/` needs `true` (an exact match) — every other route matches by prefix. */
  end: boolean;
}

/** Primary navigation, shared by the desktop sidebar and the mobile drawer so the
 * two never drift out of sync (backlog 0.4.3). */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/console', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/console/invoices', labelKey: 'nav.invoices', icon: FileText, end: false },
  { to: '/console/clients', labelKey: 'nav.clients', icon: Users, end: false },
  { to: '/console/products', labelKey: 'nav.products', icon: Package, end: false },
  { to: '/console/templates', labelKey: 'nav.templates', icon: LayoutTemplate, end: false },
  { to: '/console/pricing', labelKey: 'nav.pricing', icon: CreditCard, end: false },
  { to: '/console/settings', labelKey: 'nav.settings', icon: Settings, end: false },
];
