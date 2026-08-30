import { z } from 'zod';

import { DOCUMENT_TYPES } from './render/invoice-data.js';

/**
 * Invoice event-log shapes (backlog Epic 5.1, spec §7). Imported by `apps/api` to
 * validate the `metadata` bag before it is written and by `apps/web` (Epic 5.2)
 * to render the per-invoice timeline and the dashboard-wide activity view.
 *
 * The log is **append-only** (5.1.3): the API only ever inserts rows —
 * `invoice-history-service.ts` is the single writer and exposes no update or
 * delete. A history entry outlives even a soft-deleted invoice, so there is no
 * `deletedAt` on the row and none in the wire shape.
 *
 * `InvoiceEventType` mirrors the Prisma `InvoiceEventType` enum — keep the two in
 * step. The six values are exactly backlog 5.1.2's list; there is deliberately no
 * separate "issued" type — `CREATED` is emitted when an invoice is finalized (the
 * moment it becomes a real, numbered document), not when its draft buffer row is
 * first autosaved.
 */

export const INVOICE_EVENT_TYPES = [
  /** Emitted by `finalizeInvoice` — the first explicit Save that allocates the
   * number and flips the invoice to ISSUED. Draft autosaves emit nothing. */
  'CREATED',
  /** Emitted by `saveInvoice` only for an already-ISSUED invoice (a real edit of
   * a real document, incl. the "start from scratch" re-design). Draft autosaves
   * are compose-time buffer writes and are not logged. */
  'EDITED',
  /** Emitted by the `POST /invoices/:id/pdf` path each time a PDF is generated for
   * download. One row per download — the "count" in spec §7 is `COUNT(*)`. */
  'DOWNLOADED',
  /** Emitted by `POST /invoices/:id/send` after the mail transport accepts the
   * message. `metadata.recipient` carries the address it went to. */
  'SENT',
  /** Written on the **new** invoice when it is created by duplicating another
   * (backlog 4.4.4). `metadata.counterpartId` links back to the source. */
  'DUPLICATED_FROM',
  /** Written on the **source** invoice when it is duplicated.
   * `metadata.counterpartId` links to the new copy. */
  'DUPLICATED_INTO',
] as const;
export type InvoiceEventType = (typeof INVOICE_EVENT_TYPES)[number];

/**
 * The `metadata` JSON bag. Every key is optional and which ones are present
 * depends on `eventType` (see each `INVOICE_EVENT_TYPES` note):
 *
 *  - `SENT`                        → `recipient`, `filename`
 *  - `DOWNLOADED`                  → `filename`, `withUnsavedEdits`
 *  - `DUPLICATED_FROM` / `_INTO`   → `counterpartId`, `counterpartNumber`
 *  - `CREATED` / `EDITED`          → `{}`
 *
 * `.strict()` so an unrecognised key is a validation error rather than silently
 * persisted — the writer is always our own code, never a client payload.
 */
export const invoiceHistoryMetadataSchema = z
  .object({
    /** SENT — the client email address the PDF was sent to. */
    recipient: z.string().optional(),
    /** SENT / DOWNLOADED — the generated PDF's filename. */
    filename: z.string().optional(),
    /** DOWNLOADED — true when the render applied the caller's unsaved edits
     * (the what-if Download from the edit screen, backlog 4.4.2). */
    withUnsavedEdits: z.boolean().optional(),
    /** DUPLICATED_FROM / DUPLICATED_INTO — the id of the invoice on the other end
     * of the copy. Always one of this tenant's invoices. */
    counterpartId: z.string().optional(),
    /** The counterpart's invoice number, or `null` when it is still a draft. */
    counterpartNumber: z.string().nullable().optional(),
  })
  .strict();
export type InvoiceHistoryMetadata = z.infer<typeof invoiceHistoryMetadataSchema>;

/** One entry in an invoice's history. What the Epic 5.2 read endpoints return. */
export const invoiceHistoryEventResponseSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  eventType: z.enum(INVOICE_EVENT_TYPES),
  /** The user who performed the action (references `users.id`; equals the tenant
   * today under decision D3, kept distinct for a future multi-user tenant). */
  userId: z.string(),
  metadata: invoiceHistoryMetadataSchema,
  /** ISO 8601. Named `timestamp` per backlog 5.1.1, not `createdAt`. */
  timestamp: z.string(),
});
export type InvoiceHistoryEventResponse = z.infer<typeof invoiceHistoryEventResponseSchema>;

/** `GET /invoices/:id/history` (backlog 5.2.1) — the whole timeline for one
 * invoice, newest first. No pagination: an invoice's history is bounded and
 * small. */
export const invoiceHistoryListResponseSchema = z.object({
  items: z.array(invoiceHistoryEventResponseSchema),
});
export type InvoiceHistoryListResponse = z.infer<typeof invoiceHistoryListResponseSchema>;

// --- Dashboard-wide activity feed (backlog 5.2.2) -----------------------

const activityIsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');

export const ACTIVITY_PAGE_SIZE = 30;
export const ACTIVITY_PAGE_SIZE_MAX = 100;

/**
 * Query string for `GET /activity` (5.2.2) — the history trail across every
 * invoice, filterable by action type, client and an inclusive date range. A bare
 * `GET /activity` is valid (newest first, first page).
 */
export const activityListQuerySchema = z.object({
  /** One event kind, or omitted for all. */
  eventType: z.enum(INVOICE_EVENT_TYPES).optional(),
  /** Restrict to events on invoices billed to this client. */
  clientId: z.string().trim().min(1).optional(),
  /** Inclusive `timestamp` range, by calendar day in UTC. */
  dateFrom: activityIsoDate.optional(),
  dateTo: activityIsoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(ACTIVITY_PAGE_SIZE_MAX).default(ACTIVITY_PAGE_SIZE),
});
export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;

/** One row of the activity feed — a history event plus just enough of its
 * invoice to render and link it. `invoiceDeleted` is true when the invoice has
 * since been soft-deleted (the entry still shows, but its link is inert). */
export const activityListItemSchema = invoiceHistoryEventResponseSchema.extend({
  invoiceNumber: z.string().nullable(),
  invoiceDocumentType: z.enum(DOCUMENT_TYPES),
  invoiceClientName: z.string().nullable(),
  invoiceDeleted: z.boolean(),
});
export type ActivityListItem = z.infer<typeof activityListItemSchema>;

export const activityListResponseSchema = z.object({
  items: z.array(activityListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type ActivityListResponse = z.infer<typeof activityListResponseSchema>;
