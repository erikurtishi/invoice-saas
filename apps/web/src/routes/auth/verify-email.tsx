import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AuthCard } from '../../components/auth/auth-card';
import { Button } from '../../components/ui';
import {
  useResendVerificationEmail,
  useSession,
  useVerifyEmail,
} from '../../features/auth/use-auth';
import { useToast } from '../../hooks/use-toast';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  verifying: 'Confirming your email…',
  successTitle: 'Email confirmed',
  successBody: 'Your email address is verified. You can use every feature now.',
  continue: 'Continue',
  failTitle: "We couldn't confirm this link",
  failBody: 'The link may have expired or already been used. Request a fresh one and try again.',
  missingTitle: 'This link is invalid',
  missingBody: 'The confirmation link is missing its token.',
  resend: 'Send a new link',
  resent: 'Sent — check your inbox for the new link.',
  toLogin: 'Go to log in',
} as const;

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const toast = useToast();

  const session = useSession();
  const verify = useVerifyEmail();
  const resend = useResendVerificationEmail();

  const { mutate: runVerify } = verify;
  const started = useRef(false);
  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      runVerify({ token });
    }
  }, [token, runVerify]);

  if (!token) {
    return (
      <AuthCard title={COPY.missingTitle}>
        <p className="text-sm text-muted-foreground">{COPY.missingBody}</p>
      </AuthCard>
    );
  }

  if (verify.isPending || verify.isIdle) {
    return (
      <AuthCard title={COPY.verifying}>
        <div className="flex justify-center py-4" role="status" aria-label={COPY.verifying}>
          <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
        </div>
      </AuthCard>
    );
  }

  if (verify.isSuccess) {
    return (
      <AuthCard title={COPY.successTitle}>
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="size-9 text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">{COPY.successBody}</p>
          <Button className="w-full" onClick={() => void navigate('/', { replace: true })}>
            {COPY.continue}
          </Button>
        </div>
      </AuthCard>
    );
  }

  // Error.
  return (
    <AuthCard title={COPY.failTitle}>
      <div className="flex flex-col items-center gap-4 text-center">
        <XCircle className="size-9 text-destructive" aria-hidden />
        <p className="text-sm text-muted-foreground">{COPY.failBody}</p>
        {session.data ? (
          <Button
            className="w-full"
            variant="outline"
            isLoading={resend.isPending}
            onClick={() => {
              resend.mutate(undefined, {
                onSuccess: () => toast.success(COPY.resent),
              });
            }}
          >
            {COPY.resend}
          </Button>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">{COPY.toLogin}</Link>
          </Button>
        )}
      </div>
    </AuthCard>
  );
}
