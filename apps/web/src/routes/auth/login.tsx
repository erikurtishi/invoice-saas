import { loginSchema, type LoginInput } from '@invoice-saas/shared';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { AuthCard, AuthFormError } from '../../components/auth/auth-card';
import { FormField } from '../../components/form/field';
import { Button, Input } from '../../components/ui';
import { useLogin, useSession } from '../../features/auth/use-auth';
import { safeNextPath } from '../../features/auth/redirect';
import { applyFieldErrors } from '../../lib/apply-field-errors';
import { HttpError } from '../../lib/http-error';
import { toUserMessage } from '../../lib/error-message';
import { useZodForm } from '../../lib/use-zod-form';

export function LoginPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNextPath(params.get('next'));

  const session = useSession();
  const { mutateAsync, isPending, error } = useLogin();
  const justDeleted = params.get('deleted') === '1';

  const form = useZodForm<LoginInput>(loginSchema);

  // Already logged in (e.g. hit /login via a stale bookmark) — skip the form.
  if (session.data) return <Navigate to={next} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutateAsync(values);
      void navigate(next, { replace: true });
    } catch (err) {
      // 422 (shouldn't normally happen on login) → inline; everything else → banner.
      applyFieldErrors<LoginInput>(err, form.setError);
    }
  });

  const showBanner = error != null && !(error instanceof HttpError && error.status === 422);
  const bannerMessage =
    error instanceof HttpError && error.status === 401
      ? t('auth.badCredentials')
      : toUserMessage(error);

  return (
    <AuthCard
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            {t('auth.signUp')}
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
        {justDeleted && (
          <p
            role="status"
            className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            {t('auth.accountDeleted')}
          </p>
        )}
        {showBanner && <AuthFormError>{bannerMessage}</AuthFormError>}

        <FormField label={t('auth.email')} required error={form.formState.errors.email?.message}>
          {({ controlProps, invalid }) => (
            <Input
              {...controlProps}
              {...form.register('email')}
              type="email"
              autoComplete="email"
              autoFocus
              invalid={invalid}
            />
          )}
        </FormField>

        <FormField
          label={t('auth.password')}
          required
          error={form.formState.errors.password?.message}
        >
          {({ controlProps, invalid }) => (
            <Input
              {...controlProps}
              {...form.register('password')}
              type="password"
              autoComplete="current-password"
              invalid={invalid}
            />
          )}
        </FormField>

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-primary hover:underline">
            {t('auth.forgot')}
          </Link>
        </div>

        <Button type="submit" isLoading={isPending} className="w-full">
          {t('auth.loginSubmit')}
        </Button>
      </form>
    </AuthCard>
  );
}
