/**
 * Invoice event-log check (backlog Epic 5.1). Drives the real services against a
 * throwaway tenant and asserts the right `InvoiceHistoryEvent` rows land for each
 * lifecycle step:
 *
 *  - finalize        → one CREATED (draft autosaves before it log nothing)
 *  - edit an ISSUED  → EDITED
 *  - autosave a DRAFT → nothing
 *  - download PDF     → DOWNLOADED (+ withUnsavedEdits for the what-if render)
 *  - send            → SENT with the recipient
 *  - duplicate       → DUPLICATED_INTO on the source, DUPLICATED_FROM on the copy,
 *                      linked by id
 *
 * Also checks the log is tenant-scoped and append-only in practice (ordered by
 * `timestamp`, no row ever mutates).
 *
 *   npm run history:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';
import { defaultTemplateConfig, type InvoiceEventType } from '@invoice-saas/shared';

import { scopedPrisma } from '../src/db/tenant-scope.js';
import { createClient } from '../src/services/client-service.js';
import { listActivity, listInvoiceHistory } from '../src/services/invoice-history-service.js';
import {
  createDraft,
  duplicateInvoice,
  finalizeInvoice,
  listInvoices,
  saveInvoice,
} from '../src/services/invoice-service.js';
import { renderInvoicePdf, sendInvoice } from '../src/services/pdf-service.js';
import { closeBrowserPool } from '../src/lib/pdf/browser-pool.js';

const prisma = new PrismaClient();
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}

const tenant = await prisma.user.create({
  data: {
    email: `history-check+${Date.now()}@example.test`,
    passwordHash: 'x',
    businessName: 'History Check Co',
    addressLine1: '1 Ledger Ln',
    city: 'Skopje',
    postalCode: '1000',
    country: 'MK',
  },
});
const db = scopedPrisma(tenant.id) as unknown as Parameters<typeof createDraft>[0];

/** All history rows for one invoice, oldest first. */
async function events(invoiceId: string) {
  return db.invoiceHistoryEvent.findMany({
    where: { invoiceId },
    orderBy: { timestamp: 'asc' },
  });
}
const typesOf = (rows: Array<{ eventType: InvoiceEventType }>) => rows.map((r) => r.eventType);

try {
  const client = await createClient(db, {
    name: 'Ledger Client LLC',
    email: 'ap@ledger.example',
    addressMode: 'STRUCTURED',
    addressLine1: 'Rr. Test 2',
    city: 'Tirana',
    postalCode: '1001',
    country: 'AL',
    currency: null,
  });

  const input = {
    documentType: 'INVOICE' as const,
    language: 'EN' as const,
    currency: 'EUR',
    paperSize: 'A4' as const,
    clientId: client.id,
    templateId: null,
    newTemplate: { name: 'Print', config: defaultTemplateConfig() },
    issueDate: '2026-08-30',
    dueDate: '2026-09-13',
    paidDate: null,
    paymentMethod: null,
    creditNoteRef: null,
    creditNoteOfId: null,
    reference: 'PO-1',
    notes: null,
    footerText: null,
    signatureLabel: null,
    lineItems: [
      {
        productId: null,
        description: 'Consulting',
        quantityMilli: 2000,
        unit: 'hour',
        unitPriceMinor: 8000,
        taxRateBp: 1800,
        discountBp: 0,
      },
    ],
  };

  // --- draft autosaves log nothing; finalize logs exactly one CREATED ---------
  const draft = await createDraft(db, tenant.id, input);
  await saveInvoice(db, tenant.id, draft.id, { ...input, reference: 'PO-2' });
  check('draft autosave emits no history', (await events(draft.id)).length === 0);

  const issued = await finalizeInvoice(db, tenant.id, tenant.id, draft.id, {
    ...input,
    newTemplate: { name: 'Print', config: defaultTemplateConfig() },
  });
  check(
    'finalize emits one CREATED',
    JSON.stringify(typesOf(await events(issued.id))) === JSON.stringify(['CREATED']),
    typesOf(await events(issued.id)).join(','),
  );

  // --- editing an ISSUED invoice logs EDITED each time -----------------------
  await saveInvoice(db, tenant.id, issued.id, {
    ...input,
    templateId: issued.templateId,
    newTemplate: null,
    reference: 'PO-EDITED-1',
  });
  await saveInvoice(db, tenant.id, issued.id, {
    ...input,
    templateId: issued.templateId,
    newTemplate: null,
    reference: 'PO-EDITED-2',
  });
  check(
    'each edit of an ISSUED invoice emits EDITED',
    JSON.stringify(typesOf(await events(issued.id))) ===
      JSON.stringify(['CREATED', 'EDITED', 'EDITED']),
    typesOf(await events(issued.id)).join(','),
  );

  // --- download + what-if download -----------------------------------------
  await renderInvoicePdf(db, tenant.id, issued.id);
  await renderInvoicePdf(db, tenant.id, issued.id, {
    ...input,
    templateId: issued.templateId,
    newTemplate: null,
    lineItems: [{ ...input.lineItems[0]!, description: 'Consulting (revised)' }],
  });
  const afterDownloads = await events(issued.id);
  const downloads = afterDownloads.filter((e) => e.eventType === 'DOWNLOADED');
  check('two DOWNLOADED rows (one per download)', downloads.length === 2);
  check(
    'DOWNLOADED carries the filename',
    downloads.every((e) => typeof (e.metadata as { filename?: unknown }).filename === 'string'),
  );
  check(
    'the what-if download is flagged withUnsavedEdits',
    downloads.filter(
      (e) => (e.metadata as { withUnsavedEdits?: boolean }).withUnsavedEdits === true,
    ).length === 1,
  );

  // --- send --------------------------------------------------------------
  await sendInvoice(db, tenant.id, issued.id);
  const sent = (await events(issued.id)).filter((e) => e.eventType === 'SENT');
  check(
    'send emits SENT with the recipient',
    sent.length === 1 &&
      (sent[0]!.metadata as { recipient?: string }).recipient === 'ap@ledger.example',
  );

  // --- duplicate links both ends --------------------------------------
  const copy = await duplicateInvoice(db, tenant.id, issued.id);
  const sourceDup = (await events(issued.id)).find((e) => e.eventType === 'DUPLICATED_INTO');
  const copyDup = (await events(copy.id)).find((e) => e.eventType === 'DUPLICATED_FROM');
  check(
    'source gets DUPLICATED_INTO linking the copy',
    !!sourceDup &&
      (sourceDup.metadata as { counterpartId?: string }).counterpartId === copy.id &&
      (sourceDup.metadata as { counterpartNumber?: string | null }).counterpartNumber === null,
  );
  check(
    'copy gets DUPLICATED_FROM linking the source (by number)',
    !!copyDup &&
      (copyDup.metadata as { counterpartId?: string }).counterpartId === issued.id &&
      (copyDup.metadata as { counterpartNumber?: string | null }).counterpartNumber ===
        issued.number,
  );

  // --- append-only in practice: timestamps only ever move forward ---------
  const timeline = await events(issued.id);
  const ordered = timeline.every(
    (e, i) => i === 0 || e.timestamp.getTime() >= timeline[i - 1]!.timestamp.getTime(),
  );
  check(
    'timeline is CREATED → … in non-decreasing time order',
    ordered && timeline[0]!.eventType === 'CREATED',
    typesOf(timeline).join(','),
  );

  // --- the log is tenant-scoped -------------------------------------
  const other = await prisma.user.create({
    data: {
      email: `history-check-2+${Date.now()}@example.test`,
      passwordHash: 'x',
      businessName: 'Other Co',
    },
  });
  const otherDb = scopedPrisma(other.id) as unknown as typeof db;
  check(
    "another tenant can't read this invoice's history",
    (await otherDb.invoiceHistoryEvent.findMany({ where: { invoiceId: issued.id } })).length === 0,
  );
  await prisma.user.delete({ where: { id: other.id } });

  // --- Epic 5.2 read side --------------------------------------------
  const fullTimeline = await listInvoiceHistory(db, issued.id);
  check(
    '5.2.1 timeline is newest-first',
    fullTimeline.items.length === 7 &&
      fullTimeline.items[0]!.eventType === 'DUPLICATED_INTO' &&
      fullTimeline.items.at(-1)!.eventType === 'CREATED',
    typesOf(fullTimeline.items).join(','),
  );

  let notFound = false;
  try {
    await listInvoiceHistory(db, 'nope');
  } catch (err) {
    notFound = (err as { status?: number }).status === 404;
  }
  check('5.2.1 timeline 404s for an unknown invoice', notFound);

  const allActivity = await listActivity(db, { page: 1, pageSize: 30 });
  check(
    '5.2.2 activity feed spans invoices, newest-first, with invoice context',
    allActivity.total >= 8 &&
      allActivity.items[0]!.timestamp >= allActivity.items[1]!.timestamp &&
      allActivity.items.every((i) => i.invoiceDocumentType === 'INVOICE') &&
      allActivity.items.some((i) => i.invoiceNumber === issued.number),
  );

  const downloadsOnly = await listActivity(db, { eventType: 'DOWNLOADED', page: 1, pageSize: 30 });
  check(
    '5.2.2 eventType filter',
    downloadsOnly.total === 2 && downloadsOnly.items.every((i) => i.eventType === 'DOWNLOADED'),
  );

  const byClient = await listActivity(db, { clientId: client.id, page: 1, pageSize: 30 });
  const byOtherClient = await listActivity(db, {
    clientId: 'no-such-client',
    page: 1,
    pageSize: 30,
  });
  check('5.2.2 clientId filter', byClient.total === allActivity.total && byOtherClient.total === 0);

  const paged = await listActivity(db, { page: 1, pageSize: 3 });
  check(
    '5.2.2 pagination',
    paged.items.length === 3 && paged.totalPages === Math.ceil(paged.total / 3),
  );

  const lib = await listInvoices(db, { status: 'issued', sort: 'newest', page: 1, pageSize: 25 });
  const issuedRow = lib.items.find((i) => i.id === issued.id);
  check(
    '5.2.3 list row carries the history roll-up',
    issuedRow?.downloadCount === 2 &&
      issuedRow?.lastSentTo === 'ap@ledger.example' &&
      typeof issuedRow?.lastSentAt === 'string',
  );
  const copyRow = lib.items.find((i) => i.id === copy.id);
  check(
    '5.2.3 never-sent / never-downloaded row is zeroed',
    // the copy is a DRAFT so it won't be in an `issued` list — check via `all`
    copyRow === undefined,
  );
  const allRows = await listInvoices(db, { status: 'all', sort: 'newest', page: 1, pageSize: 25 });
  const copyAll = allRows.items.find((i) => i.id === copy.id);
  check(
    '5.2.3 draft copy row: zero downloads, null last-sent',
    copyAll?.downloadCount === 0 && copyAll?.lastSentTo === null && copyAll?.lastSentAt === null,
  );
} finally {
  await closeBrowserPool();
  await prisma.user.delete({ where: { id: tenant.id } });
  await prisma.$disconnect();
}

console.log(failures === 0 ? '\nhistory: all checks passed.' : `\nhistory: ${failures} FAILED.`);
process.exit(failures === 0 ? 0 : 1);
