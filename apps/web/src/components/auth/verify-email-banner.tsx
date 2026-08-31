import { MailWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useResendVerificationEmail, useSession } from '../../features/auth/use-auth';
import { useToast } from '../../hooks/use-toast';

/**
 * Persistent nudge shown inside the app shell while `emailVerified` is false
 * (backlog 1.1.2). The verification flow itself lives on `/verify-email`; this is
 * just the always-visible entry point plus a resend action.
 */
export function VerifyEmailBanner() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const resend = useResendVerificationEmail();
  const toast = useToast();

  if (!user || user.emailVerified) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200"
      role="status"
    >
      <MailWarning className="size-4 shrink-0" aria-hidden />
      <span>{t('auth.bannerMessage')}</span>
      <button
        type="button"
        disabled={resend.isPending}
        onClick={() =>
          resend.mutate(undefined, {
            onSuccess: () => toast.success(t('auth.bannerSent')),
            onError: () => toast.error(t('auth.bannerFailed')),
          })
        }
        className="font-medium underline underline-offset-2 hover:no-underline disabled:opacity-50"
      >
        {t('auth.bannerResend')}
      </button>
    </div>
  );
}
