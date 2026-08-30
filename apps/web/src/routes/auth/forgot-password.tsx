import { requestPasswordResetSchema, type RequestPasswordResetInput } from '@invoice-saas/shared';
import { MailCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AuthCard, AuthFormError } from '../../components/auth/auth-card';
import { FormField } from '../../components/form/field';
import { Button, Input } from '../../components/ui';
import { useRequestPasswordReset } from '../../features/auth/use-auth';
import { toUserMessage } from '../../lib/error-message';
import { useZodForm } from '../../lib/use-zod-form';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  title: 'Reset your password',
  subtitle: "Enter your email and we'll send a reset link.",
  email: 'Email',
  submit: 'Send reset link',
  backToLogin: 'Back to log in',
  sentTitle: 'Check your email',
  sentBody:
    'If an account exists for that address, a password reset link is on its way. The link expires in 1 hour.',
} as const;

export function ForgotPasswordPage() {
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
        title={COPY.sentTitle}
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            {COPY.backToLogin}
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="size-8 text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">{COPY.sentBody}</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={COPY.title}
      subtitle={COPY.subtitle}
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          {COPY.backToLogin}
        </Link>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
        {error != null && <AuthFormError>{toUserMessage(error)}</AuthFormError>}

        <FormField label={COPY.email} required error={form.formState.errors.email?.message}>
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
          {COPY.submit}
        </Button>
      </form>
    </AuthCard>
  );
}
