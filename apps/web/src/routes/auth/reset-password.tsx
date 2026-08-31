import { resetPasswordSchema } from '@invoice-saas/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { z } from 'zod';

import { AuthCard, AuthFormError } from '../../components/auth/auth-card';
import { FormField } from '../../components/form/field';
import { Button, Input } from '../../components/ui';
import { useResetPassword } from '../../features/auth/use-auth';
import { useToast } from '../../hooks/use-toast';
import { applyFieldErrors } from '../../lib/apply-field-errors';
import { HttpError } from '../../lib/http-error';
import { toUserMessage } from '../../lib/error-message';
import { useZodForm } from '../../lib/use-zod-form';

/** Token comes from the emailed link; the form only collects the new password. */
const formSchema = resetPasswordSchema.pick({ password: true });
type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const toast = useToast();

  const { mutateAsync, isPending, error } = useResetPassword();
  const form = useZodForm<FormValues>(formSchema);

  if (!token) {
    return (
      <AuthCard
        title={t('auth.resetMissingTokenTitle')}
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t('auth.backToLogin')}
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">{t('auth.resetMissingTokenBody')}</p>
        <Button asChild variant="outline" className="mt-4 w-full">
          <Link to="/forgot-password">{t('auth.resetRequestNew')}</Link>
        </Button>
      </AuthCard>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutateAsync({ token, password: values.password });
      toast.success(t('auth.resetUpdated'));
      void navigate('/login', { replace: true });
    } catch (err) {
      // A malformed password comes back 422 with `fields` → inline. A stale/expired
      // token comes back 422 with no `fields` → the banner below renders it.
      applyFieldErrors<FormValues>(err, form.setError);
    }
  });

  const bannerMessage =
    error instanceof HttpError && error.status === 422 && !error.fields
      ? error.message
      : error != null
        ? toUserMessage(error)
        : null;

  return (
    <AuthCard
      title={t('auth.resetTitle')}
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t('auth.backToLogin')}
        </Link>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
        {bannerMessage != null && <AuthFormError>{bannerMessage}</AuthFormError>}

        <FormField
          label={t('auth.resetPassword')}
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
              autoFocus
              invalid={invalid}
            />
          )}
        </FormField>

        <Button type="submit" isLoading={isPending} className="w-full">
          {t('auth.resetSubmit')}
        </Button>
      </form>
    </AuthCard>
  );
}
