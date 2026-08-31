import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { en } from './resources/en';
import { mk } from './resources/mk';
import { sq } from './resources/sq';

/**
 * App-UI internationalization (Epic X.1.1). One `translation` namespace, three
 * bundled locales — `en` is the source of truth and the fallback; `sq`/`mk` mirror
 * its key shape exactly (`npm run i18n:check` enforces that).
 *
 * This is deliberately separate from the *invoice document* localisation, which
 * lives with the renderer (`@invoice-saas/shared` `render/labels.ts`, X.1.3) and is
 * keyed on the invoice's own language, not the app UI.
 *
 * The detector picks up a returning visitor's choice from `localStorage`
 * (`ui-language`), then the browser's `navigator.language`. Once a session loads,
 * `useSyncAuthLanguage` (features/auth) calls `changeLanguage` with the server
 * value so the stored profile preference always wins.
 */

export const SUPPORTED_UI_LANGUAGES = ['en', 'sq', 'mk'] as const;
export type UiLanguageCode = (typeof SUPPORTED_UI_LANGUAGES)[number];

/** `localStorage` key the detector reads/writes — also used by the quick switcher. */
export const UI_LANGUAGE_STORAGE_KEY = 'ui-language';

export const resources = {
  en: { translation: en },
  sq: { translation: sq },
  mk: { translation: mk },
} as const;

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_UI_LANGUAGES,
    lowerCaseLng: true,
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    // Resources are bundled and init is synchronous, so there is nothing to
    // suspend on — keeping Suspense off avoids a needless boundary requirement.
    react: { useSuspense: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: UI_LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export default i18next;

/** Maps the app's `EN | SQ | MK` enum (from `@invoice-saas/shared`) to an i18next
 * locale code, and back. The two casings exist because the DB/enum is uppercase
 * and BCP-47 / `Intl` want lowercase. */
export function toUiLanguageCode(lang: 'EN' | 'SQ' | 'MK'): UiLanguageCode {
  return lang.toLowerCase() as UiLanguageCode;
}

export function toProfileLanguage(code: string): 'EN' | 'SQ' | 'MK' {
  const upper = code.slice(0, 2).toUpperCase();
  return upper === 'SQ' || upper === 'MK' ? upper : 'EN';
}
