import { signupSchema, type SignupInput } from '@invoice-saas/shared';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { AuthCard, AuthFormError } from '../../components/auth/auth-card';
import { FormField } from '../../components/form/field';
import { Button, Input } from '../../components/ui';
import { useSession, useSignup } from '../../features/auth/use-auth';
import { applyFieldErrors } from '../../lib/apply-field-errors';
import { HttpError } from '../../lib/http-error';
import { toUserMessage } from '../../lib/error-message';
import { useZodForm } from '../../lib/use-zod-form';

export function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const { mutateAsync, isPending, error } = useSignup();

  const form = useZodForm<SignupInput>(signupSchema);

  if (session.data) return <Navigate to="/console" replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutateAsync(values);
      // Signup logs the user straight in; the verify-email step happens from
      // inside the app via the banner (backlog 1.1.2, 1.2.4 onboarding).
      void navigate('/console', { replace: true });
    } catch (err) {
      applyFieldErrors<SignupInput>(err, form.setError);
    }
  });

  const showBanner = error != null && !(error instanceof HttpError && error.status === 422);

  return (
    <AuthCard
      title={t('auth.signupTitle')}
      subtitle={t('auth.signupSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t('auth.logIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
        {showBanner && <AuthFormError>{toUserMessage(error)}</AuthFormError>}

        <FormField
          label={t('auth.businessName')}
          required
          error={form.formState.errors.businessName?.message}
        >
          {({ controlProps, invalid }) => (
            <Input
              {...controlProps}
              {...form.register('businessName')}
              autoComplete="organization"
              autoFocus
              invalid={invalid}
            />
          )}
        </FormField>

        <FormField label={t('auth.email')} required error={form.formState.errors.email?.message}>
          {({ controlProps, invalid }) => (
            <Input
              {...controlProps}
              {...form.register('email')}
              type="email"
              autoComplete="email"
              invalid={invalid}
            />
          )}
        </FormField>

        <FormField
          label={t('auth.password')}
          required
          hint={t('auth.passwordHint')}
          error={form.formState.errors.password?.message}
        >
          {({ controlProps, invalid }) => (
            <Input
              {...controlProps}
              {...form.register('password')}
              type="password"
              autoComplete="new-password"
              invalid={invalid}
            />
          )}
        </FormField>

        <Button type="submit" isLoading={isPending} className="w-full">
          {t('auth.signupSubmit')}
        </Button>
      </form>
    </AuthCard>
  );
}
