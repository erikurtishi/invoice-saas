import { ArrowLeft, LogOut, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useLogout, useSession } from '../../features/auth/use-auth';
import { cn } from '../../lib/cn';
import { LanguageSwitcher } from '../layout/language-switcher';
import { ADMIN_NAV_ITEMS } from './admin-nav';

/**
 * The `/admin/*` chrome (backlog `L2.1.1`) — deliberately *not* the console
 * `AppShell`: a slim top bar plus a horizontal section nav, no tenant sidebar. It
 * reads as a different place. Role gating lives in `AdminLayout` (`App.tsx`);
 * this only draws the frame and renders the matched section through `<Outlet>`.
 *
 * Responsive: the section nav scrolls horizontally below `sm`; the top bar
 * collapses the identity block. All copy via `admin.*` i18n keys.
 */
export function AdminShell() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const { mutate: logout, isPending } = useLogout();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-foreground">{t('admin.shellTitle')}</span>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {user && (
              <span className="hidden max-w-[14rem] truncate text-xs text-muted-foreground md:inline">
                {user.email}
              </span>
            )}
            <LanguageSwitcher className="hidden sm:block" />
            <Link
              to="/console"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium',
                'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <ArrowLeft className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t('admin.backToApp')}</span>
            </Link>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                logout(undefined, {
                  onSettled: () => void navigate('/login', { replace: true }),
                })
              }
              aria-label={t('nav.logOut')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium',
                'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <nav
          aria-label={t('admin.nav.primary')}
          className="mx-auto w-full max-w-[1400px] overflow-x-auto px-2 sm:px-4"
        >
          <ul className="flex min-w-max items-center gap-1 pb-px">
            {ADMIN_NAV_ITEMS.map(({ to, labelKey, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" />
                  {t(labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
