import type {
  InvoiceCalculateInput,
  InvoiceInput,
  InvoiceListQuery,
  InvoiceListResponse,
  InvoiceResponse,
  InvoiceSendResponse,
  InvoiceTotalsResponse,
} from '@invoice-saas/shared';

import { apiFetch, apiFetchBlob } from '../../lib/api-client';

/**
 * Thin wrappers over the `/invoices` endpoints (backlog Epic 4.2–4.5) — one
 * function per endpoint, same shape as `features/clients/clients-api.ts`.
 * Query/mutation wiring is in `use-invoices.ts`; the compose-time autosave loop
 * is in `use-invoice-draft.ts`.
 */

/** Only the params the caller set — omit defaults so the query key and URL stay
 * stable and readable. */
export type InvoiceListParams = Partial<
  Pick<
    InvoiceListQuery,
    'search' | 'status' | 'documentType' | 'dateFrom' | 'dateTo' | 'sort' | 'page' | 'pageSize'
  >
>;

function toQueryString(params: InvoiceListParams): string {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.status && params.status !== 'issued') qs.set('status', params.status);
  if (params.documentType) qs.set('documentType', params.documentType);
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params.dateTo) qs.set('dateTo', params.dateTo);
  if (params.sort && params.sort !== 'newest') qs.set('sort', params.sort);
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** The invoice library (4.5.1). */
export function fetchInvoices(params: InvoiceListParams): Promise<InvoiceListResponse> {
  return apiFetch<InvoiceListResponse>(`/invoices${toQueryString(params)}`);
}

/** CSV of the filtered set (4.5.4) — `page` / `pageSize` are ignored server-side. */
export function exportInvoicesCsv(
  params: InvoiceListParams,
): Promise<{ blob: Blob; filename: string | null }> {
  const { page: _page, pageSize: _pageSize, ...filters } = params;
  return apiFetchBlob(`/invoices/export.csv${toQueryString(filters)}`, {}, 'text/csv');
}

export function fetchInvoice(id: string): Promise<InvoiceResponse> {
  return apiFetch<InvoiceResponse>(`/invoices/${id}`);
}

/** Create the DRAFT row (first autosave tick). */
export function createInvoiceDraft(input: InvoiceInput): Promise<InvoiceResponse> {
  return apiFetch<InvoiceResponse>('/invoices', { method: 'POST', body: input });
}

/** Persist current fields — autosave for a DRAFT, explicit Save for an ISSUED
 * invoice (4.4.2). Same `PATCH` endpoint either way. */
export function saveInvoice(id: string, input: InvoiceInput): Promise<InvoiceResponse> {
  return apiFetch<InvoiceResponse>(`/invoices/${id}`, { method: 'PATCH', body: input });
}

/** First explicit Save of a new invoice: validate, persist, allocate the number,
 * flip to ISSUED. */
export function finalizeInvoice(id: string, input: InvoiceInput): Promise<InvoiceResponse> {
  return apiFetch<InvoiceResponse>(`/invoices/${id}/finalize`, { method: 'POST', body: input });
}

/** Duplicate into a new DRAFT (4.4.4). */
export function duplicateInvoice(id: string): Promise<InvoiceResponse> {
  return apiFetch<InvoiceResponse>(`/invoices/${id}/duplicate`, { method: 'POST' });
}

/** Soft delete (4.4.5). */
export function deleteInvoice(id: string): Promise<void> {
  return apiFetch<void>(`/invoices/${id}`, { method: 'DELETE' });
}

/** Server-authoritative totals for the live form (4.2.3). */
export function calculateInvoiceTotals(
  input: InvoiceCalculateInput,
): Promise<InvoiceTotalsResponse> {
  return apiFetch<InvoiceTotalsResponse>('/invoices/calculate', { method: 'POST', body: input });
}

/**
 * Fresh PDF plus its server-chosen filename (4.3.3). `draft` present → render the
 * caller's unsaved edits as this invoice, without persisting (4.4.2).
 */
export function downloadInvoicePdf(
  id: string,
  draft: InvoiceInput | null = null,
): Promise<{ blob: Blob; filename: string | null }> {
  return apiFetchBlob(
    `/invoices/${id}/pdf`,
    { method: 'POST', body: { draft } },
    'application/pdf',
  );
}

/** Email the PDF to the client's saved address (4.3.4); `draft` sends unsaved
 * edits (4.4.2). */
export function sendInvoice(
  id: string,
  draft: InvoiceInput | null = null,
): Promise<InvoiceSendResponse> {
  return apiFetch<InvoiceSendResponse>(`/invoices/${id}/send`, {
    method: 'POST',
    body: { draft },
  });
}
