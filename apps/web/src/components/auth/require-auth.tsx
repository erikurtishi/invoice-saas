import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { onSessionExpired } from '../../lib/api-client';
import { authKeys, useSession } from '../../features/auth/use-auth';

/**
 * Route guard for everything behind a login (backlog 1.1.4). Reads the session
 * query:
 *   - still loading  → a centered spinner (not a redirect — avoids a flash of the
 *     login page on every hard refresh while `/auth/me` is in flight)
 *   - no session     → redirect to /login, remembering where we were headed
 *   - authenticated  → render the nested routes
 *
 * Also wires the global 401 handler (1.1.5): if a token refresh ever fails
 * mid-session, `api-client` fires `onSessionExpired` and we bounce to /login from
 * wherever the user was.
 */
export function RequireAuth() {
  const { data: user, isPending } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    return onSessionExpired(() => {
      queryClient.setQueryData(authKeys.session, null);
      const next = encodeURIComponent(location.pathname + location.search);
      void navigate(`/login?next=${next}`, { replace: true });
    });
  }, [navigate, queryClient, location.pathname, location.search]);

  if (isPending) {
    return (
      <div
        className="flex min-h-svh items-center justify-center text-muted-foreground"
        role="status"
        aria-label="Loading"
      >
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <Outlet />;
}
