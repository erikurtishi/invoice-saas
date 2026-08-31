import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, BusinessProfileResponse } from '@invoice-saas/shared';

import i18n, { toUiLanguageCode } from '../../i18n';
import { HttpError } from '../../lib/http-error';
import { authKeys } from '../auth/use-auth';
import {
  completeOnboarding,
  fetchBusinessProfile,
  removeLogo,
  updateBusinessProfile,
  uploadLogo,
} from './profile-api';

/**
 * Business profile as TanStack Query (backlog Epic 1.2). The profile is server
 * state like any other — one query, read through `<QueryBoundary>`, mutations write
 * the fresh response straight back into the cache.
 *
 * A few profile fields (`businessName`, `uiLanguage`, `invoiceLanguage`) are also
 * mirrored on the cached auth session, so those mutations patch `authKeys.session`
 * too and the sidebar / banners update without a refetch.
 */

export const profileKeys = {
  profile: ['profile'] as const,
};

export function useBusinessProfile(options?: { enabled?: boolean }) {
  return useQuery<BusinessProfileResponse, HttpError>({
    queryKey: profileKeys.profile,
    queryFn: fetchBusinessProfile,
    staleTime: 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

function patchSession(
  qc: ReturnType<typeof useQueryClient>,
  patch: (user: AuthUser) => AuthUser,
): void {
  qc.setQueryData<AuthUser | null>(authKeys.session, (prev) => (prev ? patch(prev) : prev));
}

export function useUpdateBusinessProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateBusinessProfile,
    onSuccess: (profile) => {
      qc.setQueryData(profileKeys.profile, profile);
      patchSession(qc, (user) => ({
        ...user,
        businessName: profile.businessName,
        uiLanguage: profile.uiLanguage,
        invoiceLanguage: profile.invoiceLanguage,
      }));
      // Settings is where the UI language is normally changed — apply it now so
      // the whole app re-renders in the saved language without a reload.
      void i18n.changeLanguage(toUiLanguageCode(profile.uiLanguage));
    },
  });
}

export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadLogo,
    onSuccess: (profile) => qc.setQueryData(profileKeys.profile, profile),
  });
}

export function useRemoveLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeLogo,
    onSuccess: (profile) => qc.setQueryData(profileKeys.profile, profile),
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: completeOnboarding,
    onSuccess: (user) => qc.setQueryData(authKeys.session, user),
  });
}
