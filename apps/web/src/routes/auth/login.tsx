import { loginSchema, type LoginInput } from '@invoice-saas/shared';
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

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  title: 'Log in',
  subtitle: 'Welcome back.',
  email: 'Email',
  password: 'Password',
  submit: 'Log in',
  forgot: 'Forgot your password?',
  noAccount: 'Need an account?',
  signUp: 'Sign up',
  badCredentials: 'Email or password is incorrect.',
} as const;

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNextPath(params.get('next'));

  const session = useSession();
  const { mutateAsync, isPending, error } = useLogin();

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
    error instanceof HttpError && error.status === 401 ? COPY.badCredentials : toUserMessage(error);

  return (
    <AuthCard
      title={COPY.title}
      subtitle={COPY.subtitle}
      footer={
        <>
          {COPY.noAccount}{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            {COPY.signUp}
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
        {showBanner && <AuthFormError>{bannerMessage}</AuthFormError>}

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

        <FormField label={COPY.password} required error={form.formState.errors.password?.message}>
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
            {COPY.forgot}
          </Link>
        </div>

        <Button type="submit" isLoading={isPending} className="w-full">
          {COPY.submit}
        </Button>
      </form>
    </AuthCard>
  );
}
