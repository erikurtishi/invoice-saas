import {
  type DocumentType,
  formatDate,
  formatMoney,
  type ProfileLanguage,
  renderLabels,
} from '@invoice-saas/shared';

import type { MailMessage } from './mailer.js';

/**
 * The covering email for a sent invoice (backlog 4.3.6). Localised to the
 * invoice's own language (spec §10 — a Macedonian client gets a Macedonian
 * email), separate from the app UI's i18n. Plain text + a minimal HTML twin;
 * every real provider takes both.
 */

interface InvoiceEmailInput {
  language: ProfileLanguage;
  documentType: DocumentType;
  number: string;
  businessName: string;
  clientName: string | null;
  /** Grand total, integer minor units. */
  totalMinor: number;
  currency: string;
  /** ISO date, or null (quote / credit note / receipt). */
  dueDate: string | null;
}

interface Strings {
  subject: (docType: string, number: string, business: string) => string;
  greeting: (name: string | null) => string;
  attached: (docType: string, number: string, business: string) => string;
  amount: (total: string) => string;
  due: (date: string) => string;
  validUntil: (date: string) => string;
  questions: string;
  signoff: string;
}

const COPY: Record<ProfileLanguage, Strings> = {
  EN: {
    subject: (d, n, b) => `${d} ${n} from ${b}`,
    greeting: (name) => (name ? `Hi ${name},` : 'Hello,'),
    attached: (d, n, b) => `Please find attached ${d.toLowerCase()} ${n} from ${b}.`,
    amount: (t) => `Total: ${t}`,
    due: (date) => `Payment is due by ${date}.`,
    validUntil: (date) => `This quote is valid until ${date}.`,
    questions: 'If you have any questions, just reply to this email.',
    signoff: 'Thank you,',
  },
  SQ: {
    subject: (d, n, b) => `${d} ${n} nga ${b}`,
    greeting: (name) => (name ? `Përshëndetje ${name},` : 'Përshëndetje,'),
    attached: (d, n, b) => `Bashkëngjitur do të gjeni ${d.toLowerCase()} ${n} nga ${b}.`,
    amount: (t) => `Totali: ${t}`,
    due: (date) => `Pagesa duhet të bëhet deri më ${date}.`,
    validUntil: (date) => `Kjo ofertë është e vlefshme deri më ${date}.`,
    questions: 'Nëse keni pyetje, thjesht përgjigjuni këtij emaili.',
    signoff: 'Faleminderit,',
  },
  MK: {
    subject: (d, n, b) => `${d} ${n} од ${b}`,
    greeting: (name) => (name ? `Здраво ${name},` : 'Почитувани,'),
    attached: (d, n, b) => `Во прилог ќе ја најдете ${d.toLowerCase()} ${n} од ${b}.`,
    amount: (t) => `Вкупно: ${t}`,
    due: (date) => `Плаќањето треба да се изврши до ${date}.`,
    validUntil: (date) => `Оваа понуда важи до ${date}.`,
    questions: 'Ако имате прашања, само одговорете на овој е-пошта.',
    signoff: 'Ви благодариме,',
  },
};

function escapeHtml(value: string): string {
  return value.replace(
    /[<>&]/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char] ?? char,
  );
}

/** Builds the `MailMessage` fields — the caller attaches the PDF and sets `to`. */
export function buildInvoiceEmail(
  input: InvoiceEmailInput,
): Pick<MailMessage, 'subject' | 'text' | 'html'> {
  const t = COPY[input.language];
  const docType = renderLabels(input.language).documentTitle[input.documentType];
  const total = formatMoney(input.totalMinor, input.currency, input.language);

  const dateLine = input.dueDate
    ? input.documentType === 'QUOTE'
      ? t.validUntil(formatDate(input.dueDate, input.language))
      : t.due(formatDate(input.dueDate, input.language))
    : null;

  const lines = [
    t.greeting(input.clientName),
    '',
    t.attached(docType, input.number, input.businessName),
    t.amount(total),
    ...(dateLine ? [dateLine] : []),
    '',
    t.questions,
    '',
    t.signoff,
    input.businessName,
  ];

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">${lines
    .map((line) => (line === '' ? '<br>' : `<p style="margin:0 0 8px">${escapeHtml(line)}</p>`))
    .join('')}</div>`;

  return {
    subject: t.subject(docType, input.number, input.businessName),
    text: lines.join('\n'),
    html,
  };
}
