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
  /** TODO(X.1.1): hardcoded placeholder copy, see decision D9. */
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Only `/` needs `true` (an exact match) — every other route matches by prefix. */
  end: boolean;
}

/** Primary navigation, shared by the desktop sidebar and the mobile drawer so the
 * two never drift out of sync (backlog 0.4.3). Routes are placeholders until each
 * phase builds the real screen — see `routes/`. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices', label: 'Invoices', icon: FileText, end: false },
  { to: '/clients', label: 'Clients', icon: Users, end: false },
  { to: '/products', label: 'Products', icon: Package, end: false },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate, end: false },
  { to: '/pricing', label: 'Plan', icon: CreditCard, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];
