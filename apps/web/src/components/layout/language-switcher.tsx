import { LANGUAGE_ENDONYMS, PROFILE_LANGUAGES, type ProfileLanguage } from '@invoice-saas/shared';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '../../i18n/use-locale';
import { cn } from '../../lib/cn';
import { Select } from '../ui/select';

const OPTIONS = PROFILE_LANGUAGES.map((code) => ({
  value: code,
  label: LANGUAGE_ENDONYMS[code],
}));

/**
 * Quick app-language switcher (X.1.4). Changes i18next immediately and, for a
 * signed-in user, persists to the business profile via `useLocale`. Used in the
 * sidebar footer and on the auth pages — it works before login too, storing the
 * choice in `localStorage`.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { uiLanguage, setUiLanguage, isPersisting } = useLocale();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Languages className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <Select
        aria-label={t('language.switcherLabel')}
        className="h-8 w-full"
        options={OPTIONS}
        value={uiLanguage}
        disabled={isPersisting}
        onValueChange={(value) => setUiLanguage(value as ProfileLanguage)}
      />
    </div>
  );
}
