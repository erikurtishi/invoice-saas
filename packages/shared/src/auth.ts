import { z } from 'zod';

/**
 * Auth payload shapes (backlog Epic 1.1). Imported by `apps/api` for request
 * validation and by `apps/web` for the React Hook Form resolvers, so signup/login/
 * reset forms and the endpoints they hit can never disagree on a field.
 *
 * Session strategy (settles the open decision in docs/decisions.md): short-lived
 * access JWT sent as `Authorization: Bearer`, long-lived opaque refresh token in an
 * httpOnly cookie, rotated on every `/auth/refresh`. Only the access token and the
 * public user shape cross this boundary as JSON — the refresh token never appears in
 * a body, only in `Set-Cookie`.
 */

/** Password policy, in one place so the schema and any UI hint stay in sync. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(320, 'Email is too long.')
  .email('Enter a valid email address.')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, 'Password is too long.');

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  /** The one business-profile field signup must collect — `users.businessName` is
   * NOT NULL with no default (decision D3). The rest of the profile is Epic 1.2. */
  businessName: z
    .string()
    .trim()
    .min(1, 'Enter your business name.')
    .max(200, 'Business name is too long.'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Not `passwordSchema` — an old password shorter than today's minimum must still
  // be allowed to log in. Only presence matters here.
  password: z.string().min(1, 'Password is required.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'This reset link is missing its token.'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'This verification link is missing its token.'),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/** The public view of a user — what `/auth/*` returns and what the web app caches as
 * the current session. Never includes `passwordHash` or any token. */
export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  businessName: z.string(),
  role: z.enum(['OWNER', 'ADMIN']),
  emailVerified: z.boolean(),
  /** App-UI language (X.1.4) — the web app calls `i18n.changeLanguage` with this on
   * session load so the server value wins over any local guess. */
  uiLanguage: z.enum(['EN', 'SQ', 'MK']),
  /** Default language for printed invoices (spec §10). Not the app UI. */
  invoiceLanguage: z.enum(['EN', 'SQ', 'MK']),
  /** Billing tier (backlog 1.2.1). `FREE` until Phase 6's billing flow changes it. */
  tier: z.enum(['FREE', 'BASIC', 'PREMIUM']),
  /** False until the user finishes or skips the onboarding wizard (1.2.4). The web
   * app routes an authenticated user with `false` here into `/onboarding`. */
  onboardingCompleted: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/** Body returned by signup / login / refresh. The refresh token is set as a cookie,
 * never included here. */
export const authSessionSchema = z.object({
  user: authUserSchema,
  accessToken: z.string(),
  /** Seconds until `accessToken` expires — lets the client schedule a refresh. */
  expiresIn: z.number().int().positive(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;
