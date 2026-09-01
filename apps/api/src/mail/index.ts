import { appUrl, env, isProduction } from '../config/env.js';
import { ConsoleMailer } from './console-mailer.js';
import type { Mailer } from './mailer.js';
import { ResendMailer } from './resend-mailer.js';

export type { Mailer, MailMessage } from './mailer.js';

/**
 * The process-wide mailer. `ResendMailer` when `RESEND_API_KEY` is set (Decision
 * A / L1.1), `ConsoleMailer` otherwise — the console transport stays the default
 * for `npm run dev` and CI, where it prints the verification / reset link to the
 * server log. Selecting the real transport is a config flip, not a code change;
 * no call site depends on anything but the `Mailer` interface.
 */
function createMailer(): Mailer {
  if (env.RESEND_API_KEY && env.MAIL_FROM) {
    return new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM);
  }
  if (isProduction) {
    // Guard-rail: don't silently no-op real verification emails in production.
    throw new Error(
      'No production Mailer configured. Set RESEND_API_KEY + MAIL_FROM before deploying.',
    );
  }
  return new ConsoleMailer();
}

export const mailer: Mailer = createMailer();

/**
 * Copy for the two auth emails, localised to the recipient's app-UI language
 * (`users.uiLanguage`, X.1.4) — an email is app chrome, not an invoice document, so
 * it follows the UI language, not `invoiceLanguage`. A brand-new signup is always
 * `EN` (the column default) until the user picks a language.
 *
 * SQ/MK strings are model-authored (Epic X.1.2) and want a native-speaker review
 * before launch, same caveat as the web resource bundles.
 */
type MailLanguage = 'EN' | 'SQ' | 'MK';

interface AuthMailCopy {
  verifySubject: string;
  /** `(name, url)` → body. */
  verifyBody: (name: string, url: string) => string;
  resetSubject: string;
  resetBody: (name: string, url: string) => string;
}

const COPY: Record<MailLanguage, AuthMailCopy> = {
  EN: {
    verifySubject: 'Confirm your email address',
    verifyBody: (name, url) =>
      [
        `Hi ${name},`,
        '',
        'Confirm this email address to finish setting up your account:',
        '',
        url,
        '',
        'This link expires in 24 hours. If you did not create an account, you can ignore this email.',
      ].join('\n'),
    resetSubject: 'Reset your password',
    resetBody: (name, url) =>
      [
        `Hi ${name},`,
        '',
        'We received a request to reset your password. Choose a new one here:',
        '',
        url,
        '',
        'This link expires in 1 hour. If you did not request this, nothing has changed — you can ignore this email.',
      ].join('\n'),
  },
  SQ: {
    verifySubject: 'Konfirmoni adresën tuaj të email-it',
    verifyBody: (name, url) =>
      [
        `Përshëndetje ${name},`,
        '',
        'Konfirmoni këtë adresë email-i për të përfunduar konfigurimin e llogarisë suaj:',
        '',
        url,
        '',
        'Kjo lidhje skadon për 24 orë. Nëse nuk keni krijuar një llogari, mund ta shpërfillni këtë email.',
      ].join('\n'),
    resetSubject: 'Rivendosni fjalëkalimin tuaj',
    resetBody: (name, url) =>
      [
        `Përshëndetje ${name},`,
        '',
        'Morëm një kërkesë për të rivendosur fjalëkalimin tuaj. Zgjidhni një të ri këtu:',
        '',
        url,
        '',
        'Kjo lidhje skadon për 1 orë. Nëse nuk e keni bërë ju këtë kërkesë, asgjë nuk ka ndryshuar — mund ta shpërfillni këtë email.',
      ].join('\n'),
  },
  MK: {
    verifySubject: 'Потврдете ја вашата адреса на е-пошта',
    verifyBody: (name, url) =>
      [
        `Здраво ${name},`,
        '',
        'Потврдете ја оваа адреса на е-пошта за да го завршите поставувањето на вашата сметка:',
        '',
        url,
        '',
        'Оваа врска истекува за 24 часа. Ако не сте создале сметка, можете да ја игнорирате оваа порака.',
      ].join('\n'),
    resetSubject: 'Ресетирајте ја вашата лозинка',
    resetBody: (name, url) =>
      [
        `Здраво ${name},`,
        '',
        'Добивме барање за ресетирање на вашата лозинка. Изберете нова тука:',
        '',
        url,
        '',
        'Оваа врска истекува за 1 час. Ако не сте го побарале ова, ништо не е променето — можете да ја игнорирате оваа порака.',
      ].join('\n'),
  },
};

function link(path: string, token: string): string {
  const url = new URL(path, appUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function sendVerificationEmail(params: {
  to: string;
  businessName: string;
  token: string;
  language?: MailLanguage;
}): Promise<void> {
  const copy = COPY[params.language ?? 'EN'];
  await mailer.send({
    to: params.to,
    subject: copy.verifySubject,
    text: copy.verifyBody(params.businessName, link('/verify-email', params.token)),
  });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  businessName: string;
  token: string;
  language?: MailLanguage;
}): Promise<void> {
  const copy = COPY[params.language ?? 'EN'];
  await mailer.send({
    to: params.to,
    subject: copy.resetSubject,
    text: copy.resetBody(params.businessName, link('/reset-password', params.token)),
  });
}
