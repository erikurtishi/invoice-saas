import type { en } from './resources/en';

/**
 * Binds `t()` and `<Trans>` to the `en` resource shape so every translation key is
 * checked at compile time and autocompleted. `en` is the source of truth; `sq`/`mk`
 * are structurally typed against it in their own modules.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
