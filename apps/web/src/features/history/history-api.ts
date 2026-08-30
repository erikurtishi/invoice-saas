import type {
  ActivityListQuery,
  ActivityListResponse,
  InvoiceHistoryListResponse,
} from '@invoice-saas/shared';

import { apiFetch } from '../../lib/api-client';

/**
 * Thin wrappers over the history read endpoints (backlog Epic 5.2) — one function
 * per endpoint, same shape as `features/invoices/invoices-api.ts`. Query wiring
 * is in `use-history.ts`. The write side (emitting events) is entirely
 * server-side; the web app only ever reads.
 */

/** Only the params the caller set — omit the rest so the query key / URL stay stable. */
export type ActivityListParams = Partial<
  Pick<ActivityListQuery, 'eventType' | 'clientId' | 'dateFrom' | 'dateTo' | 'page' | 'pageSize'>
>;

function toQueryString(params: ActivityListParams): string {
  const qs = new URLSearchParams();
  if (params.eventType) qs.set('eventType', params.eventType);
  if (params.clientId) qs.set('clientId', params.clientId);
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params.dateTo) qs.set('dateTo', params.dateTo);
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** One invoice's whole timeline, newest first (5.2.1). */
export function fetchInvoiceHistory(id: string): Promise<InvoiceHistoryListResponse> {
  return apiFetch<InvoiceHistoryListResponse>(`/invoices/${id}/history`);
}

/** The dashboard-wide activity feed (5.2.2). */
export function fetchActivity(params: ActivityListParams): Promise<ActivityListResponse> {
  return apiFetch<ActivityListResponse>(`/activity${toQueryString(params)}`);
}
