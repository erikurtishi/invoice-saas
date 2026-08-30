import { NavLink } from 'react-router-dom';

import { cn } from '../../lib/cn';
import { NAV_ITEMS } from './nav-items';
import { UserMenu } from './user-menu';

/** Desktop only (`lg:` and up) — see `MobileNav` for the phone/tablet equivalent. */
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        {/* TODO(X.1.1): hardcoded placeholder copy, see decision D9. Real product
            name/logo pending brand decisions. */}
        <span className="text-sm font-semibold">Invoice SaaS</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Primary">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <UserMenu />
    </aside>
  );
}
