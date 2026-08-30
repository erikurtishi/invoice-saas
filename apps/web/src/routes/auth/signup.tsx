import { signupSchema, type SignupInput } from '@invoice-saas/shared';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { AuthCard, AuthFormError } from '../../components/auth/auth-card';
import { FormField } from '../../components/form/field';
import { Button, Input } from '../../components/ui';
import { useSession, useSignup } from '../../features/auth/use-auth';
import { applyFieldErrors } from '../../lib/apply-field-errors';
import { HttpError } from '../../lib/http-error';
import { toUserMessage } from '../../lib/error-message';
import { useZodForm } from '../../lib/use-zod-form';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  title: 'Create your account',
  subtitle: 'Start generating invoices in a few minutes.',
  businessName: 'Business name',
  email: 'Email',
  password: 'Password',
  passwordHint: 'At least 10 characters.',
  submit: 'Create account',
  haveAccount: 'Already have an account?',
  logIn: 'Log in',
} as const;

export function SignupPage() {
  const navigate = useNavigate();
  const session = useSession();
  const { mutateAsync, isPending, error } = useSignup();

  const form = useZodForm<SignupInput>(signupSchema);

  if (session.data) return <Navigate to="/" replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutateAsync(values);
      // Signup logs the user straight in; the verify-email step happens from
      // inside the app via the banner (backlog 1.1.2, 1.2.4 onboarding).
      void navigate('/', { replace: true });
    } catch (err) {
      applyFieldErrors<SignupInput>(err, form.setError);
    }
  });

  const showBanner = error != null && !(error instanceof HttpError && error.status === 422);

  return (
    <AuthCard
      title={COPY.title}
      subtitle={COPY.subtitle}
      footer={
        <>
          {COPY.haveAccount}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {COPY.logIn}
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
        {showBanner && <AuthFormError>{toUserMessage(error)}</AuthFormError>}

        <FormField
          label={COPY.businessName}
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

        <FormField label={COPY.email} required error={form.formState.errors.email?.message}>
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
