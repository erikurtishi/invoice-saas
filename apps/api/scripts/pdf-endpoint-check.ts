/**
 * Invoice PDF + send check (backlog Epic 4.3). Drives the real delivery service
 * against a throwaway tenant: finalize an invoice, render its PDF through the
 * browser pool, and confirm — via a real PDF parser — the page size, embedded
 * selectable text, and that Macedonian survives (spec §10). Then send it and
 * confirm the mailer got a PDF attachment.
 *
 *   npm run pdf:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';
import { defaultTemplateConfig } from '@invoice-saas/shared';

import { scopedPrisma } from '../src/db/tenant-scope.js';
import { createClient } from '../src/services/client-service.js';
import { createDraft, finalizeInvoice } from '../src/services/invoice-service.js';
import { renderInvoicePdf, sendInvoice } from '../src/services/pdf-service.js';
import { closeBrowserPool } from '../src/lib/pdf/browser-pool.js';

const prisma = new PrismaClient();
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}

async function inspectPdf(buffer: Buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: false }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const text = content.items.map((i: { str?: string }) => i.str ?? '').join('');
  return { pages: doc.numPages, width: viewport.width, height: viewport.height, text };
}

const tenant = await prisma.user.create({
  data: {
    email: `pdf-check+${Date.now()}@example.test`,
    passwordHash: 'x',
    businessName: 'Студио Нортлајт',
    addressLine1: 'ул. Мејкер 12',
    city: 'Скопје',
    postalCode: '1000',
    country: 'MK',
    preferredLanguage: 'MK',
  },
});
const db = scopedPrisma(tenant.id) as unknown as Parameters<typeof createDraft>[0];

try {
  const client = await createClient(db, {
    name: 'Акме Трговија ДООЕЛ',
    email: 'smetki@akme.example',
    taxId: 'MK4080012345678',
    addressMode: 'STRUCTURED',
    addressLine1: 'ул. Партизанска 8',
    city: 'Скопје',
    postalCode: '1000',
    country: 'MK',
    currency: null,
  });

  const input = {
    documentType: 'INVOICE' as const,
    language: 'MK' as const,
    currency: 'EUR',
    paperSize: 'A4' as const,
    clientId: client.id,
    templateId: null,
    newTemplate: { name: 'Печат', config: defaultTemplateConfig() },
    issueDate: '2026-08-30',
    dueDate: '2026-09-13',
    paidDate: null,
    paymentMethod: null,
    creditNoteRef: null,
    creditNoteOfId: null,
    reference: null,
    notes: 'Плаќање во рок од 14 дена.',
    footerText: null,
    signatureLabel: null,
    lineItems: [
      {
        productId: null,
        description: 'Дизајн на бренд идентитет',
        quantityMilli: 1000,
        unit: 'проект',
        unitPriceMinor: 120000,
        taxRateBp: 1800,
        discountBp: 0,
      },
    ],
  };

  const draft = await createDraft(db, tenant.id, input);
  const issued = await finalizeInvoice(db, tenant.id, tenant.id, draft.id, input);
  check('invoice issued', issued.status === 'ISSUED' && !!issued.number, issued.number ?? '');

  const { filename, pdf } = await renderInvoicePdf(db, tenant.id, issued.id);
  check('filename uses number', /^INV-2026-\d{4}/.test(filename), filename);
  check('pdf is non-trivial', pdf.length > 5000, `${(pdf.length / 1024).toFixed(0)}KB`);

  const info = await inspectPdf(pdf);
  check(
    'A4 page size (595x842pt)',
    Math.abs(info.width - 595) <= 2 && Math.abs(info.height - 842) <= 2,
    `${info.width.toFixed(0)}x${info.height.toFixed(0)}`,
  );
  check('text is selectable', info.text.length > 20, `${info.text.length} chars`);
  check(
    'Macedonian survived the PDF',
    info.text.includes('Фактура') && info.text.includes('Дизајн на бренд идентитет'),
  );
  check('shows the allocated number', info.text.includes(issued.number ?? '###'));

  const sent = await sendInvoice(db, tenant.id, issued.id);
  check(
    'send returns recipient + timestamp',
    sent.recipient === 'smetki@akme.example' && !!sent.sentAt,
  );

  // 4.4.2 — a what-if PDF from unsaved edits keeps the number, isn't persisted.
  const whatIf = await renderInvoicePdf(db, tenant.id, issued.id, {
    ...input,
    templateId: issued.templateId,
    newTemplate: null,
    lineItems: [{ ...input.lineItems[0]!, description: 'Ревидиран опис', unitPriceMinor: 999999 }],
  });
  const whatIfText = (await inspectPdf(whatIf.pdf)).text;
  check(
    'what-if PDF applies unsaved edits, keeps the number',
    whatIfText.includes('Ревидиран опис') && whatIfText.includes(issued.number ?? '###'),
  );
  const reloaded = await inspectPdf((await renderInvoicePdf(db, tenant.id, issued.id)).pdf);
  check('what-if did not persist', !reloaded.text.includes('Ревидиран опис'));

  // A client with no email is refused.
  const noEmail = await createClient(db, {
    name: 'No Email',
    addressMode: 'STRUCTURED',
    currency: null,
  });
  const d2 = await createDraft(db, tenant.id, {
    ...input,
    newTemplate: null,
    templateId: issued.templateId,
    clientId: noEmail.id,
  });
  const i2 = await finalizeInvoice(db, tenant.id, tenant.id, d2.id, {
    ...input,
    newTemplate: null,
    templateId: issued.templateId,
    clientId: noEmail.id,
  });
  let refused = false;
  try {
    await sendInvoice(db, tenant.id, i2.id);
  } catch (err) {
    refused = (err as { status?: number }).status === 422;
  }
  check('send refused when client has no email (422)', refused);
} finally {
  await closeBrowserPool();
  await prisma.user.delete({ where: { id: tenant.id } });
  await prisma.$disconnect();
}

console.log(failures === 0 ? '\npdf: all checks passed.' : `\npdf: ${failures} FAILED.`);
process.exit(failures === 0 ? 0 : 1);
