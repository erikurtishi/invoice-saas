import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClientInput, ClientListResponse, ClientResponse } from '@invoice-saas/shared';

import { HttpError } from '../../lib/http-error';
import {
  type ClientListParams,
  createClient,
  deleteClient,
  fetchClient,
  fetchClients,
  updateClient,
} from './clients-api';

/**
 * Clients as TanStack Query (backlog Epic 2.1). The list is read through
 * `<QueryBoundary>` on the list page; mutations invalidate the list and write the
 * fresh response into the matching detail cache so an open form updates without a
 * refetch.
 */

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (params: ClientListParams) => [...clientKeys.lists(), params] as const,
  detail: (id: string) => [...clientKeys.all, 'detail', id] as const,
};

export function useClients(params: ClientListParams) {
  return useQuery<ClientListResponse, HttpError>({
    queryKey: clientKeys.list(params),
    queryFn: () => fetchClients(params),
    // Keep the previous page on screen while the next one loads (X.7.25 — a thin
    // refreshing bar, not a skeleton flash).
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useClient(id: string | undefined) {
  return useQuery<ClientResponse, HttpError>({
    queryKey: clientKeys.detail(id ?? '__none__'),
    queryFn: () => fetchClient(id as string),
    enabled: id !== undefined,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClientInput) => createClient(input),
    onSuccess: (client) => {
      qc.setQueryData(clientKeys.detail(client.id), client);
      void qc.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClientInput }) => updateClient(id, input),
    onSuccess: (client) => {
      qc.setQueryData(clientKeys.detail(client.id), client);
      void qc.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: (_result, id) => {
      qc.removeQueries({ queryKey: clientKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}
