import { resetPasswordSchema } from '@invoice-saas/shared';
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

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  title: 'Choose a new password',
  password: 'New password',
  passwordHint: 'At least 10 characters.',
  submit: 'Update password',
  backToLogin: 'Back to log in',
  updated: 'Password updated — you can log in now.',
  missingTokenTitle: 'This link is invalid',
  missingTokenBody:
    'The reset link is missing its token. Request a new link and use the most recent email.',
  requestNew: 'Request a new link',
} as const;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const toast = useToast();

  const { mutateAsync, isPending, error } = useResetPassword();
  const form = useZodForm<FormValues>(formSchema);

  if (!token) {
    return (
      <AuthCard
        title={COPY.missingTokenTitle}
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            {COPY.backToLogin}
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">{COPY.missingTokenBody}</p>
        <Button asChild variant="outline" className="mt-4 w-full">
          <Link to="/forgot-password">{COPY.requestNew}</Link>
        </Button>
      </AuthCard>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutateAsync({ token, password: values.password });
      toast.success(COPY.updated);
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
      title={COPY.title}
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          {COPY.backToLogin}
        </Link>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
        {bannerMessage != null && <AuthFormError>{bannerMessage}</AuthFormError>}

        <FormField
          label={COPY.password}
          required
          hint={COPY.passwordHint}
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
          {COPY.submit}
        </Button>
      </form>
    </AuthCard>
  );
}
