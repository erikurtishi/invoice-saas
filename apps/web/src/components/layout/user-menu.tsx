import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useLogout, useSession } from '../../features/auth/use-auth';
import { cn } from '../../lib/cn';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = { logOut: 'Log out' } as const;

/**
 * The signed-in identity + logout control, in the sidebar / mobile drawer footer.
 * Logout clears the session and every cached query (`useLogout`) then sends the
 * user to /login.
 */
export function UserMenu({ className }: { className?: string }) {
  const { data: user } = useSession();
  const { mutate: logout, isPending } = useLogout();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <div className={cn('border-t border-border p-3', className)}>
      <div className="px-1 pb-2">
        <p className="truncate text-sm font-medium text-foreground">{user.businessName}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          logout(undefined, { onSettled: () => void navigate('/login', { replace: true }) })
        }
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          'text-muted-foreground hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        <LogOut className="size-4 shrink-0" aria-hidden />
        {COPY.logOut}
      </button>
    </div>
  );
}
