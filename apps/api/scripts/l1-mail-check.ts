/**
 * L1.1.3 — send the three transactional emails through the real (Resend) transport
 * and confirm they arrive with correct EN/SQ/MK content and, for the invoice, an
 * openable PDF.
 *
 *   npm run l1:mail-check -w @invoice-saas/api -- --to you@example.com
 *
 * Requires RESEND_API_KEY + MAIL_FROM in apps/api/.env (so mail/index.ts selects
 * ResendMailer). With the onboarding sandbox domain Resend only delivers to the
 * account owner's own verified address — pass that as --to.
 *
 * Flags:
 *   --to <addr>       recipient (default: erionerion64@gmail.com)
 *   --only verify|reset|invoice   run just one of the three (default: all)
 *   --lang EN,SQ,MK   which languages (default: all three)
 */
import {
  renderInvoice,
  sampleInvoiceData,
  TEMPLATE_PRESETS,
  type ProfileLanguage,
} from '@invoice-saas/shared';

import { mailer, sendPasswordResetEmail, sendVerificationEmail } from '../src/mail/index.js';
import { buildInvoiceEmail } from '../src/mail/invoice-email.js';
import { closeBrowserPool, renderHtmlToPdf } from '../src/lib/pdf/browser-pool.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const to = arg('to') ?? 'erionerion64@gmail.com';
const only = arg('only'); // verify | reset | invoice | undefined
const langs = (arg('lang')?.split(',') ?? ['EN', 'SQ', 'MK']) as ProfileLanguage[];

const BUSINESS = 'Northlight Studio';
const preset = TEMPLATE_PRESETS[0]!;

async function run(): Promise<void> {
  console.info(`\nL1.1.3 mail check → ${to}`);
  console.info(`from: ${process.env.MAIL_FROM ?? '(unset!)'}  ·  languages: ${langs.join(', ')}\n`);

  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set — this would only exercise ConsoleMailer.');
  }

  for (const language of langs) {
    if (!only || only === 'verify') {
      await sendVerificationEmail({
        to,
        businessName: BUSINESS,
        token: `demo-verify-${language.toLowerCase()}-${Date.now()}`,
        language,
      });
      console.info(`  ✓ verification  (${language})`);
    }

    if (!only || only === 'reset') {
      await sendPasswordResetEmail({
        to,
        businessName: BUSINESS,
        token: `demo-reset-${language.toLowerCase()}-${Date.now()}`,
        language,
      });
      console.info(`  ✓ password reset (${language})`);
    }

    if (!only || only === 'invoice') {
      const data = sampleInvoiceData({ language });
      const { html } = renderInvoice(preset.config, data, {
        media: 'print',
        assetBaseUrl: 'http://invoice-pdf.local',
      });
      const pdf = await renderHtmlToPdf(html);

      const email = buildInvoiceEmail({
        language,
        documentType: 'INVOICE',
        number: data.number,
        businessName: data.business.name,
        clientName: data.client.name,
        totalMinor: data.totals.grandTotalMinor,
        currency: data.currency,
        dueDate: data.dueDate,
      });

      await mailer.send({
        to,
        ...email,
        attachments: [
          { filename: `Invoice-${data.number}.pdf`, content: pdf, contentType: 'application/pdf' },
        ],
      });
      console.info(`  ✓ invoice + PDF  (${language}, ${pdf.length} bytes)`);
    }
  }

  await closeBrowserPool();
  console.info('\nAll sends accepted by Resend. Check the inbox.\n');
}

run().catch((err) => {
  console.error('\n✗ FAILED:', err);
  void closeBrowserPool();
  process.exitCode = 1;
});
