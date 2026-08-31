import { ArrowLeft, PartyPopper, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';

import { BusinessProfileForm } from '../../components/profile/business-profile-form';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonForm } from '../../components/state/skeletons';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui';
import { useSession } from '../../features/auth/use-auth';
import { useBusinessProfile, useCompleteOnboarding } from '../../features/profile/use-profile';
import { toUserMessage } from '../../lib/error-message';
import { useToast } from '../../hooks/use-toast';

type Step = 'profile' | 'client' | 'done';
const STEP_ORDER: Step[] = ['profile', 'client', 'done'];

/**
 * Post-signup onboarding wizard (backlog 1.2.4): business profile → optional first
 * client → "create your first invoice" CTA. Rendered outside the app shell (its own
 * focused layout) and only reachable while `onboardingCompleted` is false — the
 * authed layout redirects here until then, and this redirects away once done.
 *
 * The client step is a placeholder until Phase 2 builds Clients; it is skippable
 * and never blocks finishing.
 */
export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user, isPending: sessionPending } = useSession();
  const profileQuery = useBusinessProfile();
  const complete = useCompleteOnboarding();
  const toast = useToast();
  const [step, setStep] = useState<Step>('profile');

  if (sessionPending) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.onboardingCompleted) return <Navigate to="/console" replace />;

  const stepNumber = STEP_ORDER.indexOf(step) + 1;

  async function finish(destination: string) {
    try {
      await complete.mutateAsync();
      void navigate(destination, { replace: true });
    } catch (err) {
      toast.error(toUserMessage(err) || t('onboarding.finishFailed'));
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center bg-muted/30 px-4 py-10 sm:py-16">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          {/* Real brand mark pending brand decisions. */}
          <span className="text-base font-semibold">{t('app.name')}</span>
          <span className="text-xs font-medium text-muted-foreground">
            {t('onboarding.step', { n: stepNumber, total: STEP_ORDER.length })}
          </span>
        </div>

        {step === 'profile' && (
          <Card>
            <CardHeader>
              <CardTitle>{t('onboarding.profileTitle')}</CardTitle>
              <CardDescription>{t('onboarding.profileDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <QueryBoundary query={profileQuery} loading={<SkeletonForm fields={8} />}>
                {(profile) => (
                  <BusinessProfileForm
                    profile={profile}
                    variant="onboarding"
                    submitLabel={t('onboarding.continue')}
                    onSaved={() => setStep('client')}
                  />
                )}
              </QueryBoundary>
            </CardContent>
          </Card>
        )}

        {step === 'client' && (
          <Card>
            <CardHeader>
              <CardTitle>{t('onboarding.clientTitle')}</CardTitle>
              <CardDescription>{t('onboarding.clientDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users className="size-6" aria-hidden />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {t('onboarding.clientComingSoon')}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => setStep('profile')}>
                  <ArrowLeft className="size-4" aria-hidden />
                  {t('common.back')}
                </Button>
                <Button onClick={() => setStep('done')}>{t('onboarding.skip')}</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'done' && (
          <Card>
            <CardHeader>
              <CardTitle>{t('onboarding.doneTitle')}</CardTitle>
              <CardDescription>{t('onboarding.doneDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
                  <PartyPopper className="size-6" aria-hidden />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => void finish('/console')}
                  isLoading={complete.isPending}
                  disabled={complete.isPending}
                >
                  {t('onboarding.goToDashboard')}
                </Button>
                <Button
                  onClick={() => void finish('/console/invoices')}
                  isLoading={complete.isPending}
                  disabled={complete.isPending}
                >
                  {t('onboarding.createInvoice')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
