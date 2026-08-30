import type { InvoiceHistoryEvent, Prisma } from '@prisma/client';
import {
  type ActivityListItem,
  type ActivityListQuery,
  type ActivityListResponse,
  type InvoiceEventType,
  type InvoiceHistoryEventResponse,
  type InvoiceHistoryListResponse,
  type InvoiceHistoryMetadata,
  invoiceHistoryMetadataSchema,
} from '@invoice-saas/shared';

import type { ScopedPrismaClient } from '../db/tenant-scope.js';
import { ApiError } from '../lib/api-error.js';

/**
 * The invoice event log (backlog Epic 5.1, spec §7).
 *
 * **Append-only (5.1.3):** this module is the *only* writer of
 * `invoice_history_events`, and it only ever inserts — there is deliberately no
 * update and no delete here or anywhere else. Nothing branches on the log for
 * behaviour, so `recordInvoiceEvent` is best-effort from the caller's point of
 * view: a failure to log must never fail the action that was logged (see the
 * call sites in `invoice-service.ts` / `pdf-service.ts`, which swallow it).
 *
 * Same tenant-scoping contract as every other service: the caller passes the
 * scoped `req.db` and this file never names `tenantId` — the extension in
 * `db/tenant-scope.ts` injects it (`InvoiceHistoryEvent` is in
 * `TENANT_SCOPED_MODELS`).
 *
 * The Epic 5.2 read side (per-invoice timeline, dashboard activity view) will add
 * `list*` functions here; until then the log is write-only.
 */

interface RecordInvoiceEventArgs {
  invoiceId: string;
  eventType: InvoiceEventType;
  /** The user who performed the action (decision D3: equals the tenant id today). */
  userId: string;
  /** Event-type-dependent detail; validated against `invoiceHistoryMetadataSchema`.
   * Omit for `CREATED` / `EDITED`, which carry none. */
  metadata?: InvoiceHistoryMetadata;
}

/**
 * Append one entry to an invoice's history. Insert-only — see the module note.
 *
 * `metadata` is parsed (not just trusted) so a typo in a call site surfaces here
 * rather than as malformed JSON in the timeline; the input is always our own
 * code, never a client payload.
 */
export async function recordInvoiceEvent(
  db: ScopedPrismaClient,
  { invoiceId, eventType, userId, metadata }: RecordInvoiceEventArgs,
): Promise<void> {
  const parsed = invoiceHistoryMetadataSchema.parse(metadata ?? {});

  // `tenantId` is injected by the tenant-scope extension — same cast rationale as
  // `client-service.ts createClient`: the generated type still wants
  // `tenant`/`tenantId`, the extension supplies it at runtime.
  const data = {
    invoiceId,
    eventType,
    userId,
    metadata: parsed as Prisma.InputJsonValue,
  } as unknown as Prisma.InvoiceHistoryEventCreateInput;

  await db.invoiceHistoryEvent.create({ data });
}

/**
 * `recordInvoiceEvent` that never throws — logs and drops any error. Use at call
 * sites where a lost history entry is an acceptable cost but a failed user action
 * (a sent invoice, a downloaded PDF) is not.
 */
export async function tryRecordInvoiceEvent(
  db: ScopedPrismaClient,
  args: RecordInvoiceEventArgs,
): Promise<void> {
  try {
    await recordInvoiceEvent(db, args);
  } catch (err) {
    console.error(
      `[invoice-history] failed to record ${args.eventType} for ${args.invoiceId}`,
      err,
    );
  }
}

// --- reads (backlog Epic 5.2) ----------------------------------------

function toEventResponse(row: InvoiceHistoryEvent): InvoiceHistoryEventResponse {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    eventType: row.eventType,
    userId: row.userId,
    // Stored by `recordInvoiceEvent`, which parsed it against the schema on the
    // way in — safe to pass straight through as the already-narrow shape.
    metadata: (row.metadata ?? {}) as InvoiceHistoryMetadata,
    timestamp: row.timestamp.toISOString(),
  };
}

/**
 * One invoice's whole timeline, newest first (backlog 5.2.1). 404s for an
 * invoice that isn't this tenant's or has been deleted — the same rule as the
 * detail view it sits in.
 */
export async function listInvoiceHistory(
  db: ScopedPrismaClient,
  invoiceId: string,
): Promise<InvoiceHistoryListResponse> {
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, deletedAt: null } });
  if (!invoice) throw ApiError.notFound('That invoice no longer exists.');

  const rows = await db.invoiceHistoryEvent.findMany({
    where: { invoiceId },
    orderBy: { timestamp: 'desc' },
  });
  return { items: rows.map(toEventResponse) };
}

// UTC day bounds for the inclusive `dateFrom` / `dateTo` filter.
function dayStart(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function dayEnd(iso: string): Date {
  return new Date(`${iso}T23:59:59.999Z`);
}

/**
 * The dashboard-wide activity feed (backlog 5.2.2): every invoice's history
 * events, newest first, filterable by action type, client and date range,
 * paginated. Tenant scope is injected on the top-level `where` by the extension;
 * the `invoice` relation filter / include ride along on the same tenant.
 */
export async function listActivity(
  db: ScopedPrismaClient,
  query: ActivityListQuery,
): Promise<ActivityListResponse> {
  const where: Prisma.InvoiceHistoryEventWhereInput = {};
  if (query.eventType) where.eventType = query.eventType;
  if (query.clientId) where.invoice = { clientId: query.clientId };
  if (query.dateFrom || query.dateTo) {
    where.timestamp = {
      ...(query.dateFrom ? { gte: dayStart(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: dayEnd(query.dateTo) } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    db.invoiceHistoryEvent.count({ where }),
    db.invoiceHistoryEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        invoice: {
          select: {
            number: true,
            documentType: true,
            clientName: true,
            deletedAt: true,
          },
        },
      },
    }),
  ]);

  const items: ActivityListItem[] = rows.map((row) => ({
    ...toEventResponse(row),
    invoiceNumber: row.invoice.number,
    invoiceDocumentType: row.invoice.documentType,
    invoiceClientName: row.invoice.clientName,
    invoiceDeleted: row.invoice.deletedAt !== null,
  }));

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Per-invoice history roll-up for a page of the library list (backlog 5.2.3):
 * `{ downloadCount, lastSentTo, lastSentAt }` keyed by invoice id, for the given
 * ids only. Two grouped queries rather than N per-row lookups.
 */
export async function summariseInvoiceHistory(
  db: ScopedPrismaClient,
  invoiceIds: string[],
): Promise<
  Map<string, { downloadCount: number; lastSentTo: string | null; lastSentAt: string | null }>
> {
  const summary = new Map<
    string,
    { downloadCount: number; lastSentTo: string | null; lastSentAt: string | null }
  >();
  if (invoiceIds.length === 0) return summary;

  const [downloadGroups, sentRows] = await Promise.all([
    db.invoiceHistoryEvent.groupBy({
      by: ['invoiceId'],
      where: { invoiceId: { in: invoiceIds }, eventType: 'DOWNLOADED' },
      _count: { _all: true },
    }),
    db.invoiceHistoryEvent.findMany({
      where: { invoiceId: { in: invoiceIds }, eventType: 'SENT' },
      orderBy: { timestamp: 'desc' },
      select: { invoiceId: true, timestamp: true, metadata: true },
    }),
  ]);

  for (const id of invoiceIds) {
    summary.set(id, { downloadCount: 0, lastSentTo: null, lastSentAt: null });
  }
  for (const group of downloadGroups) {
    summary.get(group.invoiceId)!.downloadCount = group._count._all;
  }
  // `sentRows` is newest-first — the first row seen per invoice is its latest send.
  for (const row of sentRows) {
    const entry = summary.get(row.invoiceId)!;
    if (entry.lastSentAt === null) {
      entry.lastSentAt = row.timestamp.toISOString();
      entry.lastSentTo = (row.metadata as InvoiceHistoryMetadata).recipient ?? null;
    }
  }

  return summary;
}
