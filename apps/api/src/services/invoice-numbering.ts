import { Prisma } from '@prisma/client';
import type { InvoiceNumberingSetting } from '@prisma/client';
import {
  DEFAULT_NUMBER_FORMATS,
  DOCUMENT_TYPES,
  type DocumentType,
  formatInvoiceNumber,
  type InvoiceNumberingSettingInput,
  type InvoiceNumberingSettingResponse,
} from '@invoice-saas/shared';

import type { ScopedPrismaClient } from '../db/tenant-scope.js';

/**
 * Invoice numbering (backlog 4.1.3): a sequential, gapless number per tenant, with
 * a configurable prefix/format, and a **separate sequence per document type**
 * (decision D20) — a proforma or quote never consumes an invoice number.
 *
 * Two halves:
 *
 * 1. **Settings** (`InvoiceNumberingSetting`) — the format string, `{seq}`
 *    padding, and the tenant's yearly-reset choice, one row per document type,
 *    lazily seeded from `DEFAULT_NUMBER_FORMATS`. Read/written through the
 *    tenant-scoped `req.db` like every other tenant table.
 *
 * 2. **Allocation** (`InvoiceNumberSequence`) — `allocateInvoiceNumber` runs a
 *    single atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` to hand out the
 *    next integer. This is the one sanctioned raw-SQL path flagged in
 *    `db/tenant-scope.ts`: the extension can't see through `$queryRaw`, so the
 *    statement carries its own explicit `tenantId`. The caller passes its
 *    transaction client so the number and the invoice row commit together — an
 *    allocation whose invoice save then fails is rolled back, keeping the
 *    sequence gapless. The number is assigned on the **first explicit Save**
 *    (decision: drafts carry no number), never on draft autosave (4.2.6).
 */

// --- Settings -------------------------------------------------------------

function seqYear(setting: { resetYearly: boolean }, issueDate: Date): number {
  return setting.resetYearly ? issueDate.getUTCFullYear() : 0;
}

async function peekNextSeq(
  db: ScopedPrismaClient,
  documentType: DocumentType,
  year: number,
): Promise<number> {
  const row = await db.invoiceNumberSequence.findFirst({ where: { documentType, year } });
  return (row?.nextValue ?? 0) + 1;
}

async function toSettingResponse(
  db: ScopedPrismaClient,
  row: InvoiceNumberingSetting,
): Promise<InvoiceNumberingSettingResponse> {
  const now = new Date();
  const year = seqYear(row, now);
  const nextNumberPreview = formatInvoiceNumber(row.format, {
    seq: await peekNextSeq(db, row.documentType, year),
    year: now.getUTCFullYear(),
    seqPadding: row.seqPadding,
  });
  return {
    documentType: row.documentType,
    format: row.format,
    seqPadding: row.seqPadding,
    resetYearly: row.resetYearly,
    nextNumberPreview,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Loads the tenant's setting for one document type, seeding the default row the
 * first time it is asked for. */
export async function getNumberingSetting(
  db: ScopedPrismaClient,
  documentType: DocumentType,
): Promise<InvoiceNumberingSetting> {
  const existing = await db.invoiceNumberingSetting.findFirst({ where: { documentType } });
  if (existing) return existing;

  // `tenantId` is injected by the tenant-scope extension at query time — same
  // cast rationale as `client-service.ts createClient`.
  const data = {
    documentType,
    format: DEFAULT_NUMBER_FORMATS[documentType],
    seqPadding: 4,
    resetYearly: true,
  } as unknown as Prisma.InvoiceNumberingSettingCreateInput;
  return db.invoiceNumberingSetting.create({ data });
}

/** All five document types' settings (seeding any that are missing), each with a
 * preview of the next number. */
export async function listNumberingSettings(
  db: ScopedPrismaClient,
): Promise<InvoiceNumberingSettingResponse[]> {
  const rows = await Promise.all(
    DOCUMENT_TYPES.map((documentType) => getNumberingSetting(db, documentType)),
  );
  return Promise.all(rows.map((row) => toSettingResponse(db, row)));
}

/** Replaces the format / padding / reset choice for one document type. Does not
 * renumber anything already issued. */
export async function updateNumberingSetting(
  db: ScopedPrismaClient,
  documentType: DocumentType,
  input: InvoiceNumberingSettingInput,
): Promise<InvoiceNumberingSettingResponse> {
  const existing = await db.invoiceNumberingSetting.findFirst({ where: { documentType } });
  const fields = {
    format: input.format,
    seqPadding: input.seqPadding,
    resetYearly: input.resetYearly,
  };
  const row = existing
    ? await db.invoiceNumberingSetting.update({ where: { id: existing.id }, data: fields })
    : await db.invoiceNumberingSetting.create({
        data: { documentType, ...fields } as unknown as Prisma.InvoiceNumberingSettingCreateInput,
      });
  return toSettingResponse(db, row);
}

// --- Allocation ---------------------------------------------------------

export interface AllocatedInvoiceNumber {
  /** The display number, e.g. "INV-2026-0007". */
  number: string;
  /** The raw counter value it was rendered from. */
  numberSeq: number;
  /** The counter's year bucket, or null for a continuous (never-reset) sequence. */
  numberYear: number | null;
}

/**
 * Hands out the next number for `documentType` and marks it consumed, atomically.
 * Call inside the same transaction that writes the invoice row so the two commit
 * or roll back together (gapless guarantee).
 *
 * `tx` is the caller's transaction client; `tenantId` is passed explicitly
 * because this raw statement bypasses the tenant-scope extension.
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    documentType: DocumentType;
    issueDate: Date;
    setting: Pick<InvoiceNumberingSetting, 'format' | 'seqPadding' | 'resetYearly'>;
  },
): Promise<AllocatedInvoiceNumber> {
  const { tenantId, documentType, issueDate, setting } = params;
  const year = seqYear(setting, issueDate);

  const rows = await tx.$queryRaw<Array<{ nextValue: number }>>(Prisma.sql`
    INSERT INTO "invoice_number_sequences"
      ("id", "tenantId", "documentType", "year", "nextValue", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid()::text, ${tenantId}, ${documentType}::"DocumentType", ${year}, 1, now(), now())
    ON CONFLICT ("tenantId", "documentType", "year")
    DO UPDATE SET
      "nextValue" = "invoice_number_sequences"."nextValue" + 1,
      "updatedAt" = now()
    RETURNING "nextValue";
  `);

  const row = rows[0];
  if (!row) throw new Error('invoice number allocation returned no row');
  const numberSeq = Number(row.nextValue);
  const number = formatInvoiceNumber(setting.format, {
    seq: numberSeq,
    year: issueDate.getUTCFullYear(),
    seqPadding: setting.seqPadding,
  });

  return { number, numberSeq, numberYear: setting.resetYearly ? year : null };
}
