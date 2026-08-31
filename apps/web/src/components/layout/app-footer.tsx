import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { cn } from '../../lib/cn';

/**
 * Site footer (backlog X.4.1 / X.4.2) — the always-present route to the legal
 * pages. Rendered at the bottom of the app shell and on the public auth / legal
 * pages, so a visitor can reach the privacy policy before signing up too.
 */
export function AppFooter({ className }: { className?: string }) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer
      className={cn('border-t border-border px-4 py-4 text-xs text-muted-foreground', className)}
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center justify-between gap-2 sm:flex-row">
        <span>{t('footer.copyright', { year, name: t('app.name') })}</span>
        <nav className="flex items-center gap-4" aria-label={t('footer.legalNav')}>
          <Link
            to="/privacy"
            className="rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('footer.privacy')}
          </Link>
          <Link
            to="/terms"
            className="rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('footer.terms')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
