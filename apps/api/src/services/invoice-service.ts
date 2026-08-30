import { Prisma } from '@prisma/client';
import type { Invoice, InvoiceLineItem, User } from '@prisma/client';
import {
  computeInvoiceTotals,
  defaultTemplateConfig,
  type InvoiceCalculateInput,
  type InvoiceInput,
  type InvoiceLineItemInput,
  type InvoiceListItem,
  type InvoiceListQuery,
  type InvoiceListResponse,
  type InvoiceResponse,
  type InvoiceSort,
  type InvoiceTotalsResponse,
  minorToAmountString,
  type RawLineItem,
  type TemplateConfig,
  templateConfigSchema,
} from '@invoice-saas/shared';

import { prisma } from '../db/client.js';
import type { ScopedPrismaClient } from '../db/tenant-scope.js';
import { ApiError } from '../lib/api-error.js';
import { recordInvoiceGenerated } from '../lib/entitlements.js';
import { summariseInvoiceHistory, tryRecordInvoiceEvent } from './invoice-history-service.js';
import { allocateInvoiceNumber, getNumberingSetting } from './invoice-numbering.js';
import { createTemplate } from './template-service.js';

/**
 * Invoice reads and writes (backlog Epic 4.2). Same tenant-scoping contract as the
 * other services — every function takes `req.db` and never mentions `tenantId`
 * (the extension in `db/tenant-scope.ts` injects it). The one exception is the
 * finalize transaction, which allocates the gapless number through the raw-SQL
 * path `invoice-numbering.ts` owns and therefore carries an explicit `tenantId`.
 *
 * Lifecycle (decisions D20 + the 4.2 answers):
 *  - `POST /invoices`            → a `DRAFT` row, no number. Created lazily on the
 *                                 form's first autosave.
 *  - `PATCH /invoices/:id`       → overwrite the draft (autosave, 4.2.6). Whole
 *                                 object each time — no partial updates.
 *  - `POST /invoices/:id/finalize` → the first explicit Save: validate, persist,
 *                                 allocate the number, flip to `ISSUED`.
 *
 * Party details are snapshotted onto the row at every write (decision D20): the
 * business profile and the chosen client are flattened to plain columns so a later
 * edit to either never rewrites this document. Money is integer minor units
 * throughout (D17); totals are recomputed here with the one shared calculator
 * (`computeInvoiceTotals`) — the server is the source of truth (4.2.3).
 */

type InvoiceRow = Invoice & { lineItems: InvoiceLineItem[] };

const LINE_ITEMS_INCLUDE = {
  lineItems: { orderBy: { position: 'asc' } as const },
} satisfies Prisma.InvoiceInclude;

// --- date helpers: the document dates are calendar dates (`@db.Date`) ------

function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function parseNullableDate(iso: string | null | undefined): Date | null {
  return iso ? parseDate(iso) : null;
}
function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// --- snapshots -----------------------------------------------------------

function joinAddress(parts: Array<string | null | undefined>): string | null {
  const lines = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return lines.length > 0 ? lines.join('\n') : null;
}

/** The issuing business, flattened from the `users` row (decision D3 — the user
 * *is* the tenant, so this reads the raw client like `profile-service`). There is
 * no separate business contact email/phone in the profile yet; the account email
 * stands in for "from" contact, phone stays null until a profile field exists. */
async function businessSnapshot(userId: string) {
  const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized();
  return {
    businessName: user.businessName,
    businessAddress: joinAddress([
      user.addressLine1,
      user.addressLine2,
      [user.postalCode, user.city].filter(Boolean).join(' ') || null,
      user.country,
    ]),
    businessEmail: user.email,
    businessPhone: null as string | null,
    businessTaxId: user.taxId,
    businessLogoUrl: user.logoUrl,
  };
}

/** The billed client, flattened from the (tenant-scoped) `clients` row. */
async function clientSnapshot(db: ScopedPrismaClient, clientId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, deletedAt: null } });
  if (!client) {
    throw ApiError.validation('That client no longer exists.', {
      clientId: ['That client no longer exists.'],
    });
  }
  const address =
    client.addressMode === 'FREE_TEXT'
      ? client.addressText?.trim() || null
      : joinAddress([
          client.addressLine1,
          client.addressLine2,
          [client.postalCode, client.city].filter(Boolean).join(' ') || null,
          client.country,
        ]);
  return {
    clientName: client.name,
    clientAddress: address,
    clientEmail: client.email,
    clientTaxId: client.taxId,
  };
}

// --- maths -------------------------------------------------------------

/** Only the fields the calculator reads — works for both the request payload and a
 * stored `InvoiceLineItem` row. */
type LineMathInput = Pick<
  InvoiceLineItemInput,
  'description' | 'quantityMilli' | 'unit' | 'unitPriceMinor' | 'taxRateBp' | 'discountBp'
>;

function toRawLine(item: LineMathInput): RawLineItem {
  return {
    description: item.description,
    quantityMilli: item.quantityMilli,
    unit: item.unit ?? null,
    unitPriceMinor: item.unitPriceMinor,
    taxRateBp: item.taxRateBp,
    discountBp: item.discountBp,
  };
}

function computeFromRows(
  rows: Array<
    Pick<
      InvoiceLineItem,
      'description' | 'quantityMilli' | 'unit' | 'unitPriceMinor' | 'taxRateBp' | 'discountBp'
    >
  >,
  documentType: Invoice['documentType'],
) {
  return computeInvoiceTotals(rows.map(toRawLine), { documentType });
}

/** Stateless totals for the live form (backlog 4.2.3). */
export function calculateTotals(input: InvoiceCalculateInput): InvoiceTotalsResponse {
  const { totals } = computeInvoiceTotals(input.lineItems.map(toRawLine), {
    documentType: input.documentType,
  });
  return {
    subtotalMinor: totals.subtotalMinor,
    discountTotalMinor: totals.discountTotalMinor,
    taxTotalMinor: totals.taxTotalMinor,
    grandTotalMinor: totals.grandTotalMinor,
    amountDueMinor: totals.amountDueMinor,
    taxLines: totals.taxLines,
  };
}

// --- write-data assembly ---------------------------------------------

type BusinessSnapshot = Awaited<ReturnType<typeof businessSnapshot>>;
type ClientSnapshot = Awaited<ReturnType<typeof clientSnapshot>>;

function buildInvoiceData(
  input: InvoiceInput,
  biz: BusinessSnapshot,
  client: ClientSnapshot | null,
  templateId: string | null,
) {
  const computed = computeInvoiceTotals(input.lineItems.map(toRawLine), {
    documentType: input.documentType,
  });

  const lineItemRows = computed.lineItems.map((line, index) => ({
    position: index,
    productId: input.lineItems[index]?.productId ?? null,
    description: line.description,
    quantityMilli: line.quantityMilli,
    unit: line.unit,
    unitPriceMinor: line.unitPriceMinor,
    taxRateBp: line.taxRateBp,
    discountBp: line.discountBp,
    lineSubtotalMinor: line.lineSubtotalMinor,
    lineDiscountMinor: line.lineDiscountMinor,
    lineTaxMinor: line.lineTaxMinor,
    lineTotalMinor: line.lineTotalMinor,
  }));

  const scalars = {
    documentType: input.documentType,
    language: input.language,
    currency: input.currency,
    paperSize: input.paperSize,
    clientId: input.clientId,
    templateId,
    businessName: biz.businessName,
    businessAddress: biz.businessAddress,
    businessEmail: biz.businessEmail,
    businessPhone: biz.businessPhone,
    businessTaxId: biz.businessTaxId,
    businessLogoUrl: biz.businessLogoUrl,
    clientName: client?.clientName ?? null,
    clientAddress: client?.clientAddress ?? null,
    clientEmail: client?.clientEmail ?? null,
    clientTaxId: client?.clientTaxId ?? null,
    issueDate: parseDate(input.issueDate),
    dueDate: parseNullableDate(input.dueDate),
    paidDate: parseNullableDate(input.paidDate),
    paymentMethod: input.paymentMethod ?? null,
    creditNoteRef: input.creditNoteRef ?? null,
    creditNoteOfId: input.creditNoteOfId,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    footerText: input.footerText ?? null,
    signatureLabel: input.signatureLabel ?? null,
    subtotalMinor: computed.totals.subtotalMinor,
    discountTotalMinor: computed.totals.discountTotalMinor,
    taxTotalMinor: computed.totals.taxTotalMinor,
    grandTotalMinor: computed.totals.grandTotalMinor,
    amountDueMinor: computed.totals.amountDueMinor,
  };

  return { scalars, lineItemRows };
}

// --- response mapping ----------------------------------------------

/**
 * Resolve the invoice's template design. Uses `findFirst` **without** a
 * `deletedAt` filter so a soft-deleted template still renders a historical invoice
 * (decision D20 / X.7.22); `templateMissing` is true only when the row is gone
 * entirely, and the caller falls back to the default design.
 */
async function resolveTemplateConfig(
  db: ScopedPrismaClient,
  templateId: string | null,
): Promise<{ config: TemplateConfig; missing: boolean }> {
  if (!templateId) return { config: defaultTemplateConfig(), missing: false };
  const row = await db.template.findFirst({ where: { id: templateId } });
  if (!row) return { config: defaultTemplateConfig(), missing: true };
  return { config: templateConfigSchema.parse(row.config), missing: false };
}

async function toInvoiceResponse(
  db: ScopedPrismaClient,
  row: InvoiceRow,
): Promise<InvoiceResponse> {
  const { totals } = computeFromRows(row.lineItems, row.documentType);
  const template = await resolveTemplateConfig(db, row.templateId);
  return {
    id: row.id,
    status: row.status,
    documentType: row.documentType,
    number: row.number,
    numberSeq: row.numberSeq,
    numberYear: row.numberYear,
    language: row.language,
    currency: row.currency,
    paperSize: row.paperSize,
    clientId: row.clientId,
    templateId: row.templateId,
    templateConfig: template.config,
    templateMissing: template.missing,
    business: {
      name: row.businessName,
      address: row.businessAddress,
      email: row.businessEmail,
      phone: row.businessPhone,
      taxId: row.businessTaxId,
      logoUrl: row.businessLogoUrl,
    },
    client: {
      name: row.clientName,
      address: row.clientAddress,
      email: row.clientEmail,
      taxId: row.clientTaxId,
    },
    issueDate: toIsoDate(row.issueDate),
    dueDate: row.dueDate ? toIsoDate(row.dueDate) : null,
    paidDate: row.paidDate ? toIsoDate(row.paidDate) : null,
    paymentMethod: row.paymentMethod,
    creditNoteRef: row.creditNoteRef,
    creditNoteOfId: row.creditNoteOfId,
    reference: row.reference,
    notes: row.notes,
    footerText: row.footerText,
    signatureLabel: row.signatureLabel,
    lineItems: row.lineItems.map((li) => ({
      id: li.id,
      position: li.position,
      productId: li.productId,
      description: li.description,
      quantityMilli: li.quantityMilli,
      unit: li.unit,
      unitPriceMinor: li.unitPriceMinor,
      taxRateBp: li.taxRateBp,
      discountBp: li.discountBp,
      lineSubtotalMinor: li.lineSubtotalMinor,
      lineDiscountMinor: li.lineDiscountMinor,
      lineTaxMinor: li.lineTaxMinor,
      lineTotalMinor: li.lineTotalMinor,
    })),
    totals: {
      subtotalMinor: totals.subtotalMinor,
      discountTotalMinor: totals.discountTotalMinor,
      taxTotalMinor: totals.taxTotalMinor,
      grandTotalMinor: totals.grandTotalMinor,
      amountDueMinor: totals.amountDueMinor,
      taxLines: totals.taxLines,
    },
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// --- loads -----------------------------------------------------------

async function loadInvoice(db: ScopedPrismaClient, id: string): Promise<InvoiceRow> {
  const row = await db.invoice.findFirst({
    where: { id, deletedAt: null },
    include: LINE_ITEMS_INCLUDE,
  });
  if (!row) throw ApiError.notFound('That invoice no longer exists.');
  return row;
}

export async function getInvoice(db: ScopedPrismaClient, id: string): Promise<InvoiceResponse> {
  return toInvoiceResponse(db, await loadInvoice(db, id));
}

// --- library list + CSV export (backlog Epic 4.5) ------------------

const INVOICE_ORDER_BY: Record<InvoiceSort, Prisma.InvoiceOrderByWithRelationInput> = {
  newest: { issueDate: 'desc' },
  oldest: { issueDate: 'asc' },
  client: { clientName: 'asc' },
  '-client': { clientName: 'desc' },
  total: { grandTotalMinor: 'asc' },
  '-total': { grandTotalMinor: 'desc' },
};

/** Shared `where` for the list and the CSV export — every filter, no pagination. */
function buildInvoiceListWhere(query: InvoiceListQuery): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = { deletedAt: null };

  if (query.status === 'issued') where.status = 'ISSUED';
  else if (query.status === 'draft') where.status = 'DRAFT';

  if (query.documentType) where.documentType = query.documentType;

  if (query.search) {
    where.OR = [
      { number: { contains: query.search, mode: 'insensitive' } },
      { clientName: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  if (query.dateFrom || query.dateTo) {
    where.issueDate = {
      ...(query.dateFrom ? { gte: parseDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: parseDate(query.dateTo) } : {}),
    };
  }

  return where;
}

type HistorySummary = {
  downloadCount: number;
  lastSentTo: string | null;
  lastSentAt: string | null;
};
const EMPTY_HISTORY_SUMMARY: HistorySummary = {
  downloadCount: 0,
  lastSentTo: null,
  lastSentAt: null,
};

function toListItem(row: Invoice, history: HistorySummary): InvoiceListItem {
  return {
    id: row.id,
    status: row.status,
    documentType: row.documentType,
    number: row.number,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    currency: row.currency,
    issueDate: toIsoDate(row.issueDate),
    dueDate: row.dueDate ? toIsoDate(row.dueDate) : null,
    grandTotalMinor: row.grandTotalMinor,
    downloadCount: history.downloadCount,
    lastSentTo: history.lastSentTo,
    lastSentAt: history.lastSentAt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listInvoices(
  db: ScopedPrismaClient,
  query: InvoiceListQuery,
): Promise<InvoiceListResponse> {
  const where = buildInvoiceListWhere(query);
  const [total, rows] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({
      where,
      orderBy: INVOICE_ORDER_BY[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  // Roll up the event log for just this page's rows (backlog 5.2.3).
  const history = await summariseInvoiceHistory(
    db,
    rows.map((r) => r.id),
  );

  return {
    items: rows.map((row) => toListItem(row, history.get(row.id) ?? EMPTY_HISTORY_SUMMARY)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

const CSV_HEADER = [
  'Number',
  'Type',
  'Status',
  'Issue date',
  'Due date',
  'Client',
  'Client email',
  'Client tax ID',
  'Currency',
  'Subtotal',
  'Discount',
  'Tax',
  'Total',
] as const;

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV of the filtered invoice set (backlog 4.5.4) — money as plain decimal
 * strings for bookkeeping, a UTF-8 BOM so Excel reads Cyrillic / Albanian client
 * names correctly, CRLF line endings. Ignores `page` / `pageSize`.
 */
export async function exportInvoicesCsv(
  db: ScopedPrismaClient,
  query: InvoiceListQuery,
): Promise<string> {
  const rows = await db.invoice.findMany({
    where: buildInvoiceListWhere(query),
    orderBy: INVOICE_ORDER_BY[query.sort],
  });

  const lines = [
    CSV_HEADER.join(','),
    ...rows.map((row) =>
      [
        row.number ?? '',
        row.documentType,
        row.status,
        toIsoDate(row.issueDate),
        row.dueDate ? toIsoDate(row.dueDate) : '',
        row.clientName ?? '',
        row.clientEmail ?? '',
        row.clientTaxId ?? '',
        row.currency,
        minorToAmountString(row.subtotalMinor),
        minorToAmountString(row.discountTotalMinor),
        minorToAmountString(row.taxTotalMinor),
        minorToAmountString(row.grandTotalMinor),
      ]
        .map(csvCell)
        .join(','),
    ),
  ];

  const BOM = '\uFEFF';
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

// --- create / update draft --------------------------------------

export async function createDraft(
  db: ScopedPrismaClient,
  userId: string,
  input: InvoiceInput,
): Promise<InvoiceResponse> {
  const biz = await businessSnapshot(userId);
  const client = input.clientId ? await clientSnapshot(db, input.clientId) : null;
  const { scalars, lineItemRows } = buildInvoiceData(input, biz, client, input.templateId);

  // `tenantId` is injected by the tenant-scope extension — same cast rationale as
  // `client-service.ts createClient`. The nested `lineItems` are not tenant-scoped
  // (no `tenantId` column); the extension only touches the top-level `data`.
  const data = {
    ...scalars,
    status: 'DRAFT',
    lineItems: { create: lineItemRows },
  } as unknown as Prisma.InvoiceCreateInput;

  const row = await db.invoice.create({ data, include: LINE_ITEMS_INCLUDE });
  return toInvoiceResponse(db, row);
}

/**
 * Persist the current fields (backlog 4.2.6 autosave for a DRAFT, 4.4.2 explicit
 * Save for an ISSUED one). Never touches `number` / `status` / `issuedAt` — those
 * are set once, by `finalizeInvoice`. `documentType` is locked after issue (its
 * number came from that type's sequence). Party details are re-snapshotted every
 * save (decision D20 — an edit picks up current client/profile data).
 */
export async function saveInvoice(
  db: ScopedPrismaClient,
  userId: string,
  id: string,
  input: InvoiceInput,
): Promise<InvoiceResponse> {
  const existing = await loadInvoice(db, id);
  const issued = existing.status === 'ISSUED';

  if (issued && input.documentType !== existing.documentType) {
    throw ApiError.validation('The document type can’t change after an invoice is issued.', {
      documentType: ['This can’t be changed after the invoice is issued.'],
    });
  }

  // "Start from scratch" on an already-issued invoice (4.4.2): there is no
  // finalize step to defer to, so persist the inline design as a reusable
  // template now. A DRAFT ignores `newTemplate` — its template is created at
  // finalize (4.2.4), not on every autosave.
  let templateId = input.templateId;
  if (issued && !templateId && input.newTemplate) {
    const created = await createTemplate(db, input.newTemplate);
    templateId = created.id;
  }

  const biz = await businessSnapshot(userId);
  const client = input.clientId ? await clientSnapshot(db, input.clientId) : null;
  const { scalars, lineItemRows } = buildInvoiceData(
    { ...input, documentType: existing.documentType },
    biz,
    client,
    templateId,
  );

  await db.invoice.update({
    where: { id },
    data: {
      ...scalars,
      // Full replace — the form always submits every row.
      lineItems: { deleteMany: {}, create: lineItemRows },
    },
  });

  // History (5.1.2): only an edit of an already-ISSUED document is logged. A
  // DRAFT autosave is a compose-time buffer write, fired every ~1.2s while the
  // form is open — not a user-meaningful "edit".
  if (issued) {
    await tryRecordInvoiceEvent(db, { invoiceId: id, eventType: 'EDITED', userId });
  }

  return toInvoiceResponse(db, await loadInvoice(db, id));
}

/**
 * Render an invoice with the caller's *unsaved* edits applied (backlog 4.4.2) —
 * for a what-if Download / Send from the edit screen. Returns an
 * `InvoiceResponse`-shaped value that is **not** persisted: identity, number,
 * status and timestamps come from the saved row, everything else from `input`.
 */
export async function buildPreviewResponse(
  db: ScopedPrismaClient,
  userId: string,
  saved: InvoiceResponse,
  input: InvoiceInput,
): Promise<InvoiceResponse> {
  const biz = await businessSnapshot(userId);
  const client = input.clientId ? await clientSnapshot(db, input.clientId) : null;
  const { lineItems, totals } = computeInvoiceTotals(input.lineItems.map(toRawLine), {
    documentType: saved.documentType,
  });

  let templateConfig = saved.templateConfig;
  let templateMissing = saved.templateMissing;
  if (input.newTemplate) {
    templateConfig = input.newTemplate.config;
    templateMissing = false;
  } else if (input.templateId && input.templateId !== saved.templateId) {
    const resolved = await resolveTemplateConfig(db, input.templateId);
    templateConfig = resolved.config;
    templateMissing = resolved.missing;
  }

  return {
    ...saved,
    documentType: saved.documentType,
    language: input.language,
    currency: input.currency,
    paperSize: input.paperSize,
    clientId: input.clientId,
    templateId: input.templateId,
    templateConfig,
    templateMissing,
    business: {
      name: biz.businessName,
      address: biz.businessAddress,
      email: biz.businessEmail,
      phone: biz.businessPhone,
      taxId: biz.businessTaxId,
      logoUrl: biz.businessLogoUrl,
    },
    client: client
      ? {
          name: client.clientName,
          address: client.clientAddress,
          email: client.clientEmail,
          taxId: client.clientTaxId,
        }
      : { name: null, address: null, email: null, taxId: null },
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    paidDate: input.paidDate,
    paymentMethod: input.paymentMethod ?? null,
    creditNoteRef: input.creditNoteRef ?? null,
    creditNoteOfId: input.creditNoteOfId,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    footerText: input.footerText ?? null,
    signatureLabel: input.signatureLabel ?? null,
    lineItems: lineItems.map((line, index) => ({
      id: `preview-${index}`,
      position: index,
      productId: input.lineItems[index]?.productId ?? null,
      description: line.description,
      quantityMilli: line.quantityMilli,
      unit: line.unit,
      unitPriceMinor: line.unitPriceMinor,
      taxRateBp: line.taxRateBp,
      discountBp: line.discountBp,
      lineSubtotalMinor: line.lineSubtotalMinor,
      lineDiscountMinor: line.lineDiscountMinor,
      lineTaxMinor: line.lineTaxMinor,
      lineTotalMinor: line.lineTotalMinor,
    })),
    totals: {
      subtotalMinor: totals.subtotalMinor,
      discountTotalMinor: totals.discountTotalMinor,
      taxTotalMinor: totals.taxTotalMinor,
      grandTotalMinor: totals.grandTotalMinor,
      amountDueMinor: totals.amountDueMinor,
      taxLines: totals.taxLines,
    },
  };
}

/**
 * Duplicate (backlog 4.4.4): a brand-new DRAFT copying the source's client,
 * template, type, paper size, line items and text — new id, no number, no
 * history. Party details are re-snapshotted from current data by `createDraft`.
 */
export async function duplicateInvoice(
  db: ScopedPrismaClient,
  userId: string,
  id: string,
): Promise<InvoiceResponse> {
  const source = await loadInvoice(db, id);

  // Drop a reference to a client that has since been deleted — the copy starts
  // without one rather than failing.
  let clientId = source.clientId;
  if (clientId) {
    const live = await db.client.findFirst({ where: { id: clientId, deletedAt: null } });
    if (!live) clientId = null;
  }

  const input: InvoiceInput = {
    documentType: source.documentType,
    language: source.language,
    currency: source.currency,
    paperSize: source.paperSize,
    clientId,
    templateId: source.templateId,
    newTemplate: null,
    issueDate: toIsoDate(source.issueDate),
    dueDate: source.dueDate ? toIsoDate(source.dueDate) : null,
    paidDate: source.paidDate ? toIsoDate(source.paidDate) : null,
    paymentMethod: source.paymentMethod,
    creditNoteRef: source.creditNoteRef,
    creditNoteOfId: source.creditNoteOfId,
    reference: source.reference,
    notes: source.notes,
    footerText: source.footerText,
    signatureLabel: source.signatureLabel,
    lineItems: source.lineItems
      .sort((a, b) => a.position - b.position)
      .map((li) => ({
        productId: li.productId,
        description: li.description,
        quantityMilli: li.quantityMilli,
        unit: li.unit,
        unitPriceMinor: li.unitPriceMinor,
        taxRateBp: li.taxRateBp,
        discountBp: li.discountBp,
      })),
  };

  const copy = await createDraft(db, userId, input);

  // History (5.1.2): link the two invoices from both ends. The new copy carries
  // no number yet (it is a DRAFT), so `DUPLICATED_INTO` on the source records a
  // null counterpart number.
  await tryRecordInvoiceEvent(db, {
    invoiceId: source.id,
    eventType: 'DUPLICATED_INTO',
    userId,
    metadata: { counterpartId: copy.id, counterpartNumber: copy.number },
  });
  await tryRecordInvoiceEvent(db, {
    invoiceId: copy.id,
    eventType: 'DUPLICATED_FROM',
    userId,
    metadata: { counterpartId: source.id, counterpartNumber: source.number },
  });

  return copy;
}

/** Soft delete (decision D4). The number, if any, stays consumed — invoice
 * numbers are never reused. */
export async function deleteInvoice(db: ScopedPrismaClient, id: string): Promise<void> {
  await loadInvoice(db, id);
  await db.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
}

// --- finalize (first explicit Save) --------------------------

export async function finalizeInvoice(
  db: ScopedPrismaClient,
  tenantId: string,
  userId: string,
  id: string,
  input: InvoiceInput,
): Promise<InvoiceResponse> {
  const existing = await loadInvoice(db, id);
  if (existing.status === 'ISSUED') {
    throw ApiError.conflict('This invoice has already been issued.');
  }
  if (!input.clientId) {
    throw ApiError.validation('Pick a client for this invoice.', {
      clientId: ['Pick a client for this invoice.'],
    });
  }

  // "Start from scratch" (4.2.4): persist the inline design as a reusable template
  // first, then the invoice links to it like any saved template.
  let templateId = input.templateId;
  if (!templateId && input.newTemplate) {
    const created = await createTemplate(db, input.newTemplate);
    templateId = created.id;
  }
  if (!templateId) {
    throw ApiError.validation('Pick a template or design one to use.', {
      templateId: ['Pick a template or design one to use.'],
    });
  }

  // Persist the latest edits (finalize is also a save), with the resolved template.
  await saveInvoice(db, userId, id, { ...input, templateId, newTemplate: null });

  // Allocate the number + flip status atomically. Raw path (see `tenant-scope.ts`
  // and `invoice-numbering.ts`): the sequence UPSERT can't go through the scoped
  // extension, so the transaction runs on the unscoped client and every write
  // carries an explicit `tenantId`.
  const setting = await getNumberingSetting(db, input.documentType);
  await prisma.$transaction(async (tx) => {
    const allocated = await allocateInvoiceNumber(tx, {
      tenantId,
      documentType: input.documentType,
      issueDate: parseDate(input.issueDate),
      setting,
    });
    await tx.invoice.update({
      where: { id, tenantId },
      data: {
        status: 'ISSUED',
        number: allocated.number,
        numberSeq: allocated.numberSeq,
        numberYear: allocated.numberYear,
        issuedAt: new Date(),
      },
    });
    // Usage metering (6.1.3 / 6.1.5): "generation" = this finalize. Counted in
    // the same transaction as the number so it can't drift, and monotonic — a
    // later soft delete never refunds a Free account's one lifetime invoice.
    await recordInvoiceGenerated(tx, tenantId);
  });

  // History (5.1.2): `CREATED` marks the invoice becoming a real, numbered
  // document — not the draft buffer row first appearing. This is the first entry
  // in every issued invoice's timeline.
  await tryRecordInvoiceEvent(db, { invoiceId: id, eventType: 'CREATED', userId });

  return toInvoiceResponse(db, await loadInvoice(db, id));
}
