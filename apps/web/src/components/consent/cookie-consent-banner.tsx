import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useConsent } from '../../features/consent/use-consent';
import { getTransition, toastTransition } from '../../lib/motion-presets';
import { Button } from '../ui';

/**
 * Cookie consent banner (backlog X.4.3). Shows until the visitor picks a category
 * set; "Accept all" opts into analytics, "Essential only" declines. The choice is
 * persisted by `useConsent` and gates `lib/analytics.ts`. Rendered app-wide
 * (including the public pages) from `App`.
 */
export function CookieConsentBanner() {
  const { t } = useTranslation();
  const { decided, acceptAll, essentialOnly } = useConsent();

  return (
    <AnimatePresence>
      {!decided && (
        <motion.div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-4 shadow-lg backdrop-blur"
          role="dialog"
          aria-label={t('consent.ariaLabel')}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={getTransition(toastTransition)}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t('consent.message')}{' '}
              <Link to="/privacy" className="font-medium text-primary hover:underline">
                {t('consent.learnMore')}
              </Link>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={essentialOnly}>
                {t('consent.essentialOnly')}
              </Button>
              <Button size="sm" onClick={acceptAll}>
                {t('consent.acceptAll')}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
