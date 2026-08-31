import type { ProfileLanguage } from '@invoice-saas/shared';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '../features/auth/use-auth';
import { useBusinessProfile, useUpdateBusinessProfile } from '../features/profile/use-profile';
import i18n, { toProfileLanguage, toUiLanguageCode, UI_LANGUAGE_STORAGE_KEY } from './index';

/**
 * The single entry point for reading and changing the app-UI language (X.1.4).
 *
 * `setUiLanguage` switches i18next immediately (the detector mirrors it to
 * `localStorage`, so it survives a reload and works before login). For a signed-in
 * user it *also* persists to the business profile via the normal PATCH, so the
 * choice follows them to another device and outlives cleared site data.
 *
 * `invoiceLanguage` is exposed read-only here — it is only ever changed from the
 * Settings form, since it affects documents, not the app.
 */
export interface UseLocale {
  /** Active UI language as the app's enum. */
  uiLanguage: ProfileLanguage;
  /** The tenant's default invoice language, or `null` before a session loads. */
  invoiceLanguage: ProfileLanguage | null;
  setUiLanguage: (lang: ProfileLanguage) => void;
  isPersisting: boolean;
}

export function useLocale(): UseLocale {
  const { i18n: instance } = useTranslation();
  const { data: session } = useSession();
  const { data: profile } = useBusinessProfile({ enabled: !!session });
  const updateProfile = useUpdateBusinessProfile();

  const uiLanguage = toProfileLanguage(instance.resolvedLanguage ?? instance.language ?? 'en');

  const setUiLanguage = useCallback(
    (lang: ProfileLanguage) => {
      void i18n.changeLanguage(toUiLanguageCode(lang));
      try {
        window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, toUiLanguageCode(lang));
      } catch {
        // Private mode / storage disabled — the in-memory switch still took.
      }
      // Persist for signed-in users. A full-object PATCH is the only profile
      // write path (no partial updates by design), so send the cached profile
      // with just the language changed.
      if (session && profile && profile.uiLanguage !== lang) {
        updateProfile.mutate({
          businessName: profile.businessName,
          addressLine1: profile.addressLine1 ?? '',
          addressLine2: profile.addressLine2 ?? '',
          city: profile.city ?? '',
          postalCode: profile.postalCode ?? '',
          country: profile.country ?? '',
          taxId: profile.taxId ?? '',
          defaultCurrency: profile.defaultCurrency as never,
          defaultPaymentTermsDays: profile.defaultPaymentTermsDays,
          defaultPaperSize: profile.defaultPaperSize,
          uiLanguage: lang,
          invoiceLanguage: profile.invoiceLanguage,
        });
      }
    },
    [session, profile, updateProfile],
  );

  return {
    uiLanguage,
    invoiceLanguage: session?.invoiceLanguage ?? profile?.invoiceLanguage ?? null,
    setUiLanguage,
    isPersisting: updateProfile.isPending,
  };
}

/**
 * Applies the signed-in user's saved UI language once the session resolves, so the
 * server preference overrides whatever the detector guessed. Mounted once, high in
 * the tree (see `App.tsx`).
 */
export function useSyncAuthLanguage(): void {
  const { data: session } = useSession();
  const serverLang = session ? toUiLanguageCode(session.uiLanguage) : null;
  useEffect(() => {
    if (serverLang && i18n.resolvedLanguage !== serverLang) {
      void i18n.changeLanguage(serverLang);
    }
  }, [serverLang]);
}
