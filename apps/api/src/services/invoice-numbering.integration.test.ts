import type { User } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../db/client.js';
import { allocateInvoiceNumber } from './invoice-numbering.js';

/**
 * Gapless invoice numbering (backlog X.5.1 / 4.1.3, decision D20).
 *
 * `allocateInvoiceNumber` is the atomic `INSERT … ON CONFLICT DO UPDATE …
 * RETURNING` that hands out the next integer. These tests prove the three
 * guarantees a numbering bug would break: the sequence is gapless, it is
 * independent per `(documentType, year)`, and a transaction that rolls back after
 * allocating leaves **no** gap.
 *
 * Hits the local Postgres in `apps/api/.env` (decision D2).
 */

const SETTING = { format: 'INV-{YYYY}-{seq}', seqPadding: 4, resetYearly: true } as const;
const CONTINUOUS = { format: 'INV-{seq}', seqPadding: 4, resetYearly: false } as const;

let tenant: User;

beforeAll(async () => {
  tenant = await prisma.user.create({
    data: {
      email: `numbering-int-${Date.now()}@example.test`,
      passwordHash: 'x',
      businessName: 'Numbering Co',
    },
  });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: tenant.id } });
  await prisma.$disconnect();
});

/** One allocation in its own committed transaction, like `finalizeInvoice` does. */
function alloc(
  documentType: Parameters<typeof allocateInvoiceNumber>[1]['documentType'],
  issueDate: Date,
  setting: typeof SETTING | typeof CONTINUOUS = SETTING,
) {
  return prisma.$transaction((tx) =>
    allocateInvoiceNumber(tx, { tenantId: tenant.id, documentType, issueDate, setting }),
  );
}

describe('allocateInvoiceNumber', () => {
  it('hands out a gapless 1..N run', async () => {
    const day = new Date('2026-03-01T00:00:00Z');
    const seqs: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      seqs.push((await alloc('INVOICE', day)).numberSeq);
    }
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
    expect((await alloc('INVOICE', day)).number).toBe('INV-2026-0006');
  });

  it('keeps a separate sequence per document type', async () => {
    const day = new Date('2026-03-01T00:00:00Z');
    const proforma = await alloc('PROFORMA', day);
    expect(proforma.numberSeq).toBe(1); // not affected by the INVOICE run above
    const quote = await alloc('QUOTE', day);
    expect(quote.numberSeq).toBe(1);
  });

  it('keeps a separate sequence per year when resetYearly is on', async () => {
    const a2027 = await alloc('INVOICE', new Date('2027-01-05T00:00:00Z'));
    expect(a2027.numberSeq).toBe(1);
    expect(a2027.numberYear).toBe(2027);
    const b2027 = await alloc('INVOICE', new Date('2027-06-30T00:00:00Z'));
    expect(b2027.numberSeq).toBe(2);
  });

  it('runs one continuous sequence when resetYearly is off', async () => {
    const first = await alloc('RECEIPT', new Date('2026-12-31T00:00:00Z'), CONTINUOUS);
    const second = await alloc('RECEIPT', new Date('2027-01-01T00:00:00Z'), CONTINUOUS);
    expect(first.numberSeq).toBe(1);
    expect(second.numberSeq).toBe(2); // year change does not reset it
    expect(second.numberYear).toBeNull();
  });

  it('leaves no gap when the allocating transaction rolls back', async () => {
    const day = new Date('2026-03-01T00:00:00Z');
    const before = (await alloc('CREDIT_NOTE', day)).numberSeq; // 1

    await expect(
      prisma.$transaction(async (tx) => {
        await allocateInvoiceNumber(tx, {
          tenantId: tenant.id,
          documentType: 'CREDIT_NOTE',
          issueDate: day,
          setting: SETTING,
        });
        throw new Error('simulated invoice-save failure');
      }),
    ).rejects.toThrow('simulated invoice-save failure');

    const after = (await alloc('CREDIT_NOTE', day)).numberSeq;
    expect(after).toBe(before + 1); // the rolled-back allocation consumed nothing
  });
});
