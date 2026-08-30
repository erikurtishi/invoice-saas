import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ActivityListResponse, InvoiceHistoryListResponse } from '@invoice-saas/shared';

import { HttpError } from '../../lib/http-error';
import { type ActivityListParams, fetchActivity, fetchInvoiceHistory } from './history-api';

/**
 * History reads as TanStack Query (backlog Epic 5.2). The event log is
 * append-only and only grows on server actions the client already invalidates
 * around (finalize / edit / download / send / duplicate), so a modest
 * `staleTime` is enough — no manual cache writes.
 */

export const historyKeys = {
  all: ['history'] as const,
  invoice: (id: string) => [...historyKeys.all, 'invoice', id] as const,
  activity: (params: ActivityListParams) => [...historyKeys.all, 'activity', params] as const,
};

/** One invoice's timeline for the detail view (5.2.1). */
export function useInvoiceHistory(id: string | undefined) {
  return useQuery<InvoiceHistoryListResponse, HttpError>({
    queryKey: historyKeys.invoice(id ?? '__none__'),
    queryFn: () => fetchInvoiceHistory(id as string),
    enabled: id !== undefined,
    staleTime: 15 * 1000,
  });
}

/** The dashboard activity feed (5.2.2). Keeps the current page on screen while
 * the next loads — a thin refreshing bar, not a skeleton flash. */
export function useActivity(params: ActivityListParams) {
  return useQuery<ActivityListResponse, HttpError>({
    queryKey: historyKeys.activity(params),
    queryFn: () => fetchActivity(params),
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
  });
}
