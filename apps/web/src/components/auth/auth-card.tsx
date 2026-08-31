import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AppFooter } from '../layout/app-footer';
import { LanguageSwitcher } from '../layout/language-switcher';

/**
 * Shared frame for the unauthenticated pages (login, signup, password reset,
 * verify email). No app shell — these render before there is a session — just a
 * centered card on a plain ground. Carries the language switcher so a visitor can
 * read these pages in their language before they have an account (X.1.4).
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            {/* Real brand mark pending brand decisions. */}
            <span className="text-base font-semibold">{t('app.name')}</span>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            {subtitle != null && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-5">{children}</div>
          </div>

          {footer != null && (
            <p className="mt-4 text-center text-sm text-muted-foreground">{footer}</p>
          )}

          <div className="mt-6 flex justify-center">
            <LanguageSwitcher className="w-40" />
          </div>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}

/** A form-wide error line (e.g. "email or password is incorrect") — distinct from
 * the per-field errors `<FormField>` renders. Kept small and local to the auth
 * pages; a credentials mismatch has no single field to attach to. */
export function AuthFormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
    >
      {children}
    </p>
  );
}
