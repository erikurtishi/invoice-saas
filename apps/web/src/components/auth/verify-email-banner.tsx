import { MailWarning } from 'lucide-react';

import { useResendVerificationEmail, useSession } from '../../features/auth/use-auth';
import { useToast } from '../../hooks/use-toast';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  message: 'Confirm your email address to keep full access.',
  resend: 'Resend link',
  sent: 'Verification link sent — check your inbox.',
  failed: "Couldn't send the link. Try again in a moment.",
} as const;

/**
 * Persistent nudge shown inside the app shell while `emailVerified` is false
 * (backlog 1.1.2). The verification flow itself lives on `/verify-email`; this is
 * just the always-visible entry point plus a resend action.
 */
export function VerifyEmailBanner() {
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
      <span>{COPY.message}</span>
      <button
        type="button"
        disabled={resend.isPending}
        onClick={() =>
          resend.mutate(undefined, {
            onSuccess: () => toast.success(COPY.sent),
            onError: () => toast.error(COPY.failed),
          })
        }
        className="font-medium underline underline-offset-2 hover:no-underline disabled:opacity-50"
      >
        {COPY.resend}
      </button>
    </div>
  );
}
