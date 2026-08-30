import type {
  ClientInput,
  ClientListQuery,
  ClientListResponse,
  ClientResponse,
} from '@invoice-saas/shared';

import { apiFetch } from '../../lib/api-client';

/**
 * Thin wrappers over the `/clients` endpoints (backlog Epic 2.1) — one function
 * per endpoint, same shape as `features/profile/profile-api.ts`. The TanStack
 * Query wiring lives in `use-clients.ts`.
 */

/** Only the params the caller actually set — omit defaults so the query key and
 * the URL stay stable and readable. */
export type ClientListParams = Partial<
  Pick<ClientListQuery, 'search' | 'sort' | 'page' | 'pageSize'>
>;

function toQueryString(params: ClientListParams): string {
  const search = new URLSearchParams();
  if (params.search) search.set('search', params.search);
  if (params.sort) search.set('sort', params.sort);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function fetchClients(params: ClientListParams): Promise<ClientListResponse> {
  return apiFetch<ClientListResponse>(`/clients${toQueryString(params)}`);
}

export function fetchClient(id: string): Promise<ClientResponse> {
  return apiFetch<ClientResponse>(`/clients/${id}`);
}

export function createClient(input: ClientInput): Promise<ClientResponse> {
  return apiFetch<ClientResponse>('/clients', { method: 'POST', body: input });
}

export function updateClient(id: string, input: ClientInput): Promise<ClientResponse> {
  return apiFetch<ClientResponse>(`/clients/${id}`, { method: 'PATCH', body: input });
}

export function deleteClient(id: string): Promise<void> {
  return apiFetch<void>(`/clients/${id}`, { method: 'DELETE' });
}
