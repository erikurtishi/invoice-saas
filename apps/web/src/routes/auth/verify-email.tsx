import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AuthCard } from '../../components/auth/auth-card';
import { Button } from '../../components/ui';
import {
  useResendVerificationEmail,
  useSession,
  useVerifyEmail,
} from '../../features/auth/use-auth';
import { useToast } from '../../hooks/use-toast';

export function VerifyEmailPage() {
  const { t } = useTranslation();
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
      <AuthCard title={t('auth.verifyMissingTitle')}>
        <p className="text-sm text-muted-foreground">{t('auth.verifyMissingBody')}</p>
      </AuthCard>
    );
  }

  if (verify.isPending || verify.isIdle) {
    return (
      <AuthCard title={t('auth.verifyingTitle')}>
        <div
          className="flex justify-center py-4"
          role="status"
          aria-label={t('auth.verifyingTitle')}
        >
          <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
        </div>
      </AuthCard>
    );
  }

  if (verify.isSuccess) {
    return (
      <AuthCard title={t('auth.verifySuccessTitle')}>
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="size-9 text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('auth.verifySuccessBody')}</p>
          <Button className="w-full" onClick={() => void navigate('/console', { replace: true })}>
            {t('auth.verifyContinue')}
          </Button>
        </div>
      </AuthCard>
    );
  }

  // Error.
  return (
    <AuthCard title={t('auth.verifyFailTitle')}>
      <div className="flex flex-col items-center gap-4 text-center">
        <XCircle className="size-9 text-destructive" aria-hidden />
        <p className="text-sm text-muted-foreground">{t('auth.verifyFailBody')}</p>
        {session.data ? (
          <Button
            className="w-full"
            variant="outline"
            isLoading={resend.isPending}
            onClick={() => {
              resend.mutate(undefined, {
                onSuccess: () => toast.success(t('auth.verifyResent')),
              });
            }}
          >
            {t('auth.verifyResend')}
          </Button>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">{t('auth.verifyToLogin')}</Link>
          </Button>
        )}
      </div>
    </AuthCard>
  );
}
