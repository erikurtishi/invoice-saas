import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '@invoice-saas/shared';

import { HttpError } from '../../lib/http-error';
import {
  fetchCurrentUser,
  login,
  logout,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  signup,
  verifyEmail,
} from './auth-api';

/**
 * Auth state as TanStack Query (backlog 1.1.4): the current user is just a cached
 * query, so every screen reads it the same way it reads any other server data and
 * the five UI states come for free. Mutations write the result straight into that
 * cache so the UI updates without a refetch round-trip.
 */

export const authKeys = {
  session: ['auth', 'session'] as const,
};

/** The signed-in user, or an error (401 when there is no session). `<RequireAuth>`
 * turns the error into a redirect; other callers can assume `data` is present. */
export function useSession() {
  return useQuery<AuthUser, HttpError>({
    queryKey: authKeys.session,
    queryFn: fetchCurrentUser,
    // A 401 here means "not logged in", not "try again" — never retry it.
    retry: false,
    staleTime: 5 * 60 * 1000,
    // Don't re-probe the session on every window refocus. Mid-session expiry is
    // still caught by the global 401 handler on the next real request.
    refetchOnWindowFocus: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (session) => qc.setQueryData(authKeys.session, session.user),
  });
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: signup,
    onSuccess: (session) => qc.setQueryData(authKeys.session, session.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Drop the session and every other cached query so no tenant data from this
      // account is visible to whoever logs in next on this browser.
      qc.setQueryData(authKeys.session, null);
      qc.clear();
    },
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: verifyEmail,
    onSuccess: (user) => {
      // Only patch the cache if this browser is the verified user's session.
      qc.setQueryData?.(authKeys.session, (prev: AuthUser | null | undefined) =>
        prev && prev.id === user.id ? user : prev,
      );
    },
  });
}

export function useResendVerificationEmail() {
  return useMutation({ mutationFn: resendVerificationEmail });
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: requestPasswordReset });
}

export function useResetPassword() {
  return useMutation({ mutationFn: resetPassword });
}
