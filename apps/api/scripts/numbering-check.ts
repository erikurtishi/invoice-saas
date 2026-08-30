/**
 * Invoice numbering check (backlog 4.1.3 / decision D20). Exercises the real
 * `allocateInvoiceNumber` against a throwaway tenant in the dev database:
 *
 *   - concurrent allocations are gapless and unique (the atomic ON CONFLICT path)
 *   - each document type has its own independent sequence
 *   - `resetYearly` restarts the counter per calendar year; continuous does not
 *   - `formatInvoiceNumber` renders tokens / padding as documented
 *
 * A dedicated unit-test suite for money + numbering math lands with X.5.1; this is
 * the same lightweight, run-it-now style as `render-check.mjs`.
 *
 *   npm run numbering:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_NUMBER_FORMATS, formatInvoiceNumber } from '@invoice-saas/shared';

import { allocateInvoiceNumber } from '../src/services/invoice-numbering.js';

const prisma = new PrismaClient();

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}

// --- pure formatter -----------------------------------------------------
check(
  'formatInvoiceNumber pads and fills tokens',
  formatInvoiceNumber('INV-{YYYY}-{seq}', { seq: 7, year: 2026, seqPadding: 4 }) ===
    'INV-2026-0007',
);
check(
  'formatInvoiceNumber {YY} + no pad',
  formatInvoiceNumber('{YY}/{seq}', { seq: 42, year: 2026, seqPadding: 1 }) === '26/42',
);

const tenant = await prisma.user.create({
  data: {
    email: `numbering-check+${Date.now()}@example.test`,
    passwordHash: 'x',
    businessName: 'Numbering Check',
  },
});

const yearly = { format: DEFAULT_NUMBER_FORMATS.INVOICE, seqPadding: 4, resetYearly: true };

try {
  // 25 concurrent INVOICE allocations for 2026 → seq 1..25, no gaps, no dupes.
  const y2026 = new Date(Date.UTC(2026, 5, 1));
  const batch = await Promise.all(
    Array.from({ length: 25 }, () =>
      prisma.$transaction((tx) =>
        allocateInvoiceNumber(tx, {
          tenantId: tenant.id,
          documentType: 'INVOICE',
          issueDate: y2026,
          setting: yearly,
        }),
      ),
    ),
  );
  const seqs = batch.map((b) => b.numberSeq).sort((a, b) => a - b);
  const expected = Array.from({ length: 25 }, (_, i) => i + 1);
  check(
    '25 concurrent allocations are gapless 1..25',
    JSON.stringify(seqs) === JSON.stringify(expected),
    seqs.join(','),
  );
  check('unique display numbers', new Set(batch.map((b) => b.number)).size === 25);
  check(
    'display number format',
    batch.some((b) => b.number === 'INV-2026-0001'),
  );
  check(
    'numberYear recorded for yearly sequence',
    batch.every((b) => b.numberYear === 2026),
  );

  // PROFORMA is a separate sequence — starts at 1 despite 25 invoices issued.
  const pro = await prisma.$transaction((tx) =>
    allocateInvoiceNumber(tx, {
      tenantId: tenant.id,
      documentType: 'PROFORMA',
      issueDate: y2026,
      setting: { format: DEFAULT_NUMBER_FORMATS.PROFORMA, seqPadding: 4, resetYearly: true },
    }),
  );
  check('proforma sequence is independent', pro.numberSeq === 1, pro.number);

  // Next calendar year → counter resets to 1.
  const y2027 = new Date(Date.UTC(2027, 0, 3));
  const next = await prisma.$transaction((tx) =>
    allocateInvoiceNumber(tx, {
      tenantId: tenant.id,
      documentType: 'INVOICE',
      issueDate: y2027,
      setting: yearly,
    }),
  );
  check(
    'yearly reset restarts at 1',
    next.numberSeq === 1 && next.number === 'INV-2027-0001',
    next.number,
  );

  // Continuous sequence: year bucket 0, numberYear null, keeps climbing.
  const cont = { format: 'C-{seq}', seqPadding: 3, resetYearly: false };
  const c1 = await prisma.$transaction((tx) =>
    allocateInvoiceNumber(tx, {
      tenantId: tenant.id,
      documentType: 'RECEIPT',
      issueDate: y2026,
      setting: cont,
    }),
  );
  const c2 = await prisma.$transaction((tx) =>
    allocateInvoiceNumber(tx, {
      tenantId: tenant.id,
      documentType: 'RECEIPT',
      issueDate: y2027,
      setting: cont,
    }),
  );
  check(
    'continuous sequence ignores year',
    c1.numberSeq === 1 && c2.numberSeq === 2 && c1.numberYear === null && c2.numberYear === null,
    `${c1.number} → ${c2.number}`,
  );
} finally {
  await prisma.user.delete({ where: { id: tenant.id } });
  await prisma.$disconnect();
}

console.log(
  failures === 0 ? '\nnumbering: all checks passed.' : `\nnumbering: ${failures} FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
