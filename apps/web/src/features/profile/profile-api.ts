import type { AuthUser, BusinessProfileInput, BusinessProfileResponse } from '@invoice-saas/shared';

import { apiFetch } from '../../lib/api-client';

/**
 * Thin wrappers over the `/profile` and `/onboarding` endpoints (backlog Epic 1.2).
 * Same shape as `features/auth/auth-api.ts` — a plain function per endpoint, the
 * TanStack Query wiring lives in `use-profile.ts`.
 */

export function fetchBusinessProfile(): Promise<BusinessProfileResponse> {
  return apiFetch<BusinessProfileResponse>('/profile');
}

export function updateBusinessProfile(
  input: BusinessProfileInput,
): Promise<BusinessProfileResponse> {
  return apiFetch<BusinessProfileResponse>('/profile', { method: 'PATCH', body: input });
}

export function uploadLogo(file: File): Promise<BusinessProfileResponse> {
  const form = new FormData();
  form.append('logo', file);
  return apiFetch<BusinessProfileResponse>('/profile/logo', { method: 'POST', body: form });
}

export function removeLogo(): Promise<BusinessProfileResponse> {
  return apiFetch<BusinessProfileResponse>('/profile/logo', { method: 'DELETE' });
}

export function completeOnboarding(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/onboarding/complete', { method: 'POST' });
}
