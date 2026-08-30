import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductInput, ProductListResponse, ProductResponse } from '@invoice-saas/shared';

import { HttpError } from '../../lib/http-error';
import {
  type ProductListParams,
  createProduct,
  deleteProduct,
  fetchProduct,
  fetchProducts,
  updateProduct,
} from './products-api';

/**
 * Products as TanStack Query (backlog Epic 2.2). Mirrors `features/clients/
 * use-clients.ts` — list read through `<QueryBoundary>`, mutations invalidate the
 * list and write the fresh response into the detail cache.
 */

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (params: ProductListParams) => [...productKeys.lists(), params] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
};

export function useProducts(params: ProductListParams, options?: { enabled?: boolean }) {
  return useQuery<ProductListResponse, HttpError>({
    queryKey: productKeys.list(params),
    queryFn: () => fetchProducts(params),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    enabled: options?.enabled ?? true,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery<ProductResponse, HttpError>({
    queryKey: productKeys.detail(id ?? '__none__'),
    queryFn: () => fetchProduct(id as string),
    enabled: id !== undefined,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductInput) => createProduct(input),
    onSuccess: (product) => {
      qc.setQueryData(productKeys.detail(product.id), product);
      void qc.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductInput }) => updateProduct(id, input),
    onSuccess: (product) => {
      qc.setQueryData(productKeys.detail(product.id), product);
      void qc.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: (_result, id) => {
      qc.removeQueries({ queryKey: productKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}
