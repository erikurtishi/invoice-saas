import { requestPasswordResetSchema, type RequestPasswordResetInput } from '@invoice-saas/shared';
import { MailCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AuthCard, AuthFormError } from '../../components/auth/auth-card';
import { FormField } from '../../components/form/field';
import { Button, Input } from '../../components/ui';
import { useRequestPasswordReset } from '../../features/auth/use-auth';
import { toUserMessage } from '../../lib/error-message';
import { useZodForm } from '../../lib/use-zod-form';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { mutateAsync, isPending, isSuccess, error } = useRequestPasswordReset();
  const form = useZodForm<RequestPasswordResetInput>(requestPasswordResetSchema);

  const onSubmit = form.handleSubmit(async (values) => {
    // Resolves 202 whether or not the email matched — the success state below is
    // deliberately identical either way (no account enumeration).
    await mutateAsync(values).catch(() => undefined);
  });

  if (isSuccess) {
    return (
      <AuthCard
        title={t('auth.forgotSentTitle')}
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t('auth.backToLogin')}
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="size-8 text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('auth.forgotSentBody')}</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotSubtitle')}
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t('auth.backToLogin')}
        </Link>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
        {error != null && <AuthFormError>{toUserMessage(error)}</AuthFormError>}

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

        <Button type="submit" isLoading={isPending} className="w-full">
          {t('auth.forgotSubmit')}
        </Button>
      </form>
    </AuthCard>
  );
}
