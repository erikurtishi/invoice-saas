/**
 * Invoice service check (backlog Epic 4.2). Drives the real invoice-service
 * against a throwaway tenant in the dev database: create a DRAFT, autosave-patch
 * it, calculate totals, then finalize (which allocates the gapless number, snaps
 * the party details, and — for the "start from scratch" path — also persists a
 * reusable template).
 *
 *   npm run invoice:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';
import { defaultTemplateConfig } from '@invoice-saas/shared';

import { scopedPrisma } from '../src/db/tenant-scope.js';
import {
  calculateTotals,
  createDraft,
  deleteInvoice,
  duplicateInvoice,
  exportInvoicesCsv,
  finalizeInvoice,
  getInvoice,
  listInvoices,
  saveInvoice,
} from '../src/services/invoice-service.js';
import { createClient } from '../src/services/client-service.js';

const prisma = new PrismaClient();

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}

const tenant = await prisma.user.create({
  data: {
    email: `invoice-check+${Date.now()}@example.test`,
    passwordHash: 'x',
    businessName: 'Invoice Check Co',
    addressLine1: '1 Test Way',
    city: 'Skopje',
    postalCode: '1000',
    country: 'MK',
    taxId: 'MK4030000000000',
  },
});
const db = scopedPrisma(tenant.id) as unknown as Parameters<typeof createDraft>[0];

try {
  const client = await createClient(db, {
    name: 'Beta Client LLC',
    email: 'ap@beta.example',
    taxId: 'AL K999',
    addressMode: 'STRUCTURED',
    addressLine1: 'Rr. Test 2',
    city: 'Tirana',
    postalCode: '1001',
    country: 'AL',
    currency: null,
  });

  const baseInput = {
    documentType: 'INVOICE' as const,
    language: 'EN' as const,
    currency: 'EUR',
    paperSize: 'A4' as const,
    clientId: client.id,
    templateId: null,
    newTemplate: null,
    issueDate: '2026-08-30',
    dueDate: '2026-09-13',
    paidDate: null,
    paymentMethod: null,
    creditNoteRef: null,
    creditNoteOfId: null,
    reference: 'PO-1',
    notes: 'Thanks',
    footerText: null,
    signatureLabel: null,
    lineItems: [
      {
        productId: null,
        description: 'Design work',
        quantityMilli: 3000,
        unit: 'hour',
        unitPriceMinor: 5000,
        taxRateBp: 1800,
        discountBp: 0,
      },
      {
        productId: null,
        description: 'Hosting',
        quantityMilli: 1000,
        unit: 'month',
        unitPriceMinor: 2000,
        taxRateBp: 1800,
        discountBp: 1000,
      },
    ],
  };

  const totals = calculateTotals({ documentType: 'INVOICE', lineItems: baseInput.lineItems });
  // line 1: 15000 sub, 2700 tax. line 2: 2000 sub, 200 disc, 1800 base, 324 tax.
  check(
    'calculateTotals matches hand math',
    totals.subtotalMinor === 17000 &&
      totals.discountTotalMinor === 200 &&
      totals.taxTotalMinor === 3024 &&
      totals.grandTotalMinor === 19824,
    JSON.stringify(totals),
  );

  const draft = await createDraft(db, tenant.id, baseInput);
  check('createDraft → DRAFT, no number', draft.status === 'DRAFT' && draft.number === null);
  check('draft snapshots the client', draft.client.name === 'Beta Client LLC');
  check('draft snapshots the business', draft.business.name === 'Invoice Check Co');
  check('draft totals server-computed', draft.totals.grandTotalMinor === 19824);
  check(
    'draft tax breakdown by rate',
    draft.totals.taxLines.length === 1 && draft.totals.taxLines[0]!.rateBp === 1800,
  );

  const patched = await saveInvoice(db, tenant.id, draft.id, {
    ...baseInput,
    reference: 'PO-2',
    lineItems: [baseInput.lineItems[0]!],
  });
  check(
    'saveInvoice replaces line items',
    patched.lineItems.length === 1 && patched.reference === 'PO-2',
  );
  check('saveInvoice recomputes totals', patched.totals.grandTotalMinor === 17700);

  // Finalize via the "start from scratch" path — persists a template too.
  const finalized = await finalizeInvoice(db, tenant.id, tenant.id, draft.id, {
    ...baseInput,
    templateId: null,
    newTemplate: { name: 'Inline design', config: defaultTemplateConfig() },
  });
  check(
    'finalize → ISSUED with a number',
    finalized.status === 'ISSUED' && /^INV-2026-\d{4}$/.test(finalized.number ?? ''),
  );
  check('finalize numberSeq is 1', finalized.numberSeq === 1);
  check('finalize linked the new template', finalized.templateId !== null);

  const tpl = await db.template.findFirst({ where: { name: 'Inline design' } });
  check('inline template persisted + reusable', tpl !== null);

  // Re-finalize is rejected.
  let rejected = false;
  try {
    await finalizeInvoice(db, tenant.id, tenant.id, draft.id, baseInput);
  } catch {
    rejected = true;
  }
  check('re-finalize is refused', rejected);

  // --- Epic 4.4: edit an ISSUED invoice ---
  const edited = await saveInvoice(db, tenant.id, finalized.id, {
    ...baseInput,
    templateId: finalized.templateId,
    reference: 'PO-EDITED',
    lineItems: [{ ...baseInput.lineItems[0]!, unitPriceMinor: 9000 }],
  });
  check(
    'edit ISSUED keeps number + status',
    edited.status === 'ISSUED' && edited.number === finalized.number,
  );
  check('edit ISSUED persists new fields', edited.reference === 'PO-EDITED');
  // qty 3 × 9000 = 27000
  check('edit ISSUED recomputes totals', edited.totals.subtotalMinor === 27000);

  // documentType is locked after issue.
  let typeLocked = false;
  try {
    await saveInvoice(db, tenant.id, finalized.id, {
      ...baseInput,
      templateId: finalized.templateId,
      documentType: 'PROFORMA',
    });
  } catch (err) {
    typeLocked = (err as { status?: number }).status === 422;
  }
  check('document type locked after issue (422)', typeLocked);

  // --- Epic 4.4: duplicate ---
  const copy = await duplicateInvoice(db, tenant.id, finalized.id);
  check(
    'duplicate → new DRAFT, no number, new id',
    copy.status === 'DRAFT' && copy.number === null && copy.id !== finalized.id,
  );
  check(
    'duplicate copies client + template + type + lines',
    copy.clientId === finalized.clientId &&
      copy.templateId === finalized.templateId &&
      copy.documentType === finalized.documentType &&
      copy.lineItems.length === edited.lineItems.length,
  );

  // --- Epic 4.4: delete ---
  await deleteInvoice(db, copy.id);
  let gone = false;
  try {
    await getInvoice(db, copy.id);
  } catch (err) {
    gone = (err as { status?: number }).status === 404;
  }
  check('deleted invoice 404s', gone);

  // --- Epic 4.5: library list + CSV ---
  // Issue a second document of a different type.
  const proDraft = await createDraft(db, tenant.id, {
    ...baseInput,
    documentType: 'PROFORMA',
    templateId: finalized.templateId,
    newTemplate: null,
  });
  const pro = await finalizeInvoice(db, tenant.id, tenant.id, proDraft.id, {
    ...baseInput,
    documentType: 'PROFORMA',
    templateId: finalized.templateId,
    newTemplate: null,
  });
  // Plus a leftover DRAFT.
  await createDraft(db, tenant.id, { ...baseInput, reference: 'DRAFT-ONLY' });

  const issuedList = await listInvoices(db, {
    status: 'issued',
    sort: 'newest',
    page: 1,
    pageSize: 25,
  });
  check(
    'library issued filter excludes drafts',
    issuedList.total === 2 && issuedList.items.every((i) => i.status === 'ISSUED'),
    `total=${issuedList.total}`,
  );

  const byType = await listInvoices(db, {
    status: 'all',
    documentType: 'PROFORMA',
    sort: 'newest',
    page: 1,
    pageSize: 25,
  });
  check('library type filter', byType.total === 1 && byType.items[0]!.number === pro.number);

  const searchHit = await listInvoices(db, {
    status: 'issued',
    search: finalized.number ?? 'x',
    sort: 'newest',
    page: 1,
    pageSize: 25,
  });
  check(
    'library search by number',
    searchHit.total === 1 && searchHit.items[0]!.id === finalized.id,
  );

  const listItem = issuedList.items.find((i) => i.id === finalized.id);
  check(
    'list item carries snapshot fields',
    listItem?.clientName === 'Beta Client LLC' && typeof listItem?.grandTotalMinor === 'number',
  );

  const csv = await exportInvoicesCsv(db, {
    status: 'all',
    sort: 'oldest',
    page: 1,
    pageSize: 25,
  });
  check('CSV has a BOM + header', csv.startsWith('﻿') && csv.includes('Number,Type,Status'));
  check('CSV lists every non-deleted invoice', csv.trim().split('\r\n').length === 1 + 3);
  check(
    'CSV money is decimal, includes the issued number',
    csv.includes(finalized.number ?? '###') && /,\d+\.\d{2}(,|\r|$)/.test(csv),
  );
} finally {
  await prisma.user.delete({ where: { id: tenant.id } });
  await prisma.$disconnect();
}

console.log(failures === 0 ? '\ninvoice: all checks passed.' : `\ninvoice: ${failures} FAILED.`);
process.exit(failures === 0 ? 0 : 1);
