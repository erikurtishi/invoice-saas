import { appUrl, isProduction } from '../config/env.js';
import { ConsoleMailer } from './console-mailer.js';
import type { Mailer } from './mailer.js';

export type { Mailer, MailMessage } from './mailer.js';

/**
 * The process-wide mailer. Swap the constructor here when a transactional provider
 * is chosen (`new ResendMailer(env.RESEND_API_KEY)` etc.) — nothing else changes.
 */
function createMailer(): Mailer {
  if (isProduction) {
    // Guard-rail: don't silently no-op real verification emails in production.
    throw new Error(
      'No production Mailer configured. Wire a real transport in apps/api/src/mail/index.ts before deploying.',
    );
  }
  return new ConsoleMailer();
}

export const mailer: Mailer = createMailer();

/**
 * Copy for the two auth emails. English only for now — `preferredLanguage` on the
 * user is threaded through so this becomes a lookup once X.1 i18n exists.
 * TODO(X.1.1): localize per `user.preferredLanguage`.
 */
function link(path: string, token: string): string {
  const url = new URL(path, appUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function sendVerificationEmail(params: {
  to: string;
  businessName: string;
  token: string;
}): Promise<void> {
  const verifyUrl = link('/verify-email', params.token);
  await mailer.send({
    to: params.to,
    subject: 'Confirm your email address',
    text: [
      `Hi ${params.businessName},`,
      '',
      'Confirm this email address to finish setting up your account:',
      '',
      verifyUrl,
      '',
      'This link expires in 24 hours. If you did not create an account, you can ignore this email.',
    ].join('\n'),
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  businessName: string;
  token: string;
}): Promise<void> {
  const resetUrl = link('/reset-password', params.token);
  await mailer.send({
    to: params.to,
    subject: 'Reset your password',
    text: [
      `Hi ${params.businessName},`,
      '',
      'We received a request to reset your password. Choose a new one here:',
      '',
      resetUrl,
      '',
      'This link expires in 1 hour. If you did not request this, nothing has changed — you can ignore this email.',
    ].join('\n'),
  });
}
