import type {
  ProductInput,
  ProductListQuery,
  ProductListResponse,
  ProductResponse,
} from '@invoice-saas/shared';

import { apiFetch } from '../../lib/api-client';

/**
 * Thin wrappers over the `/products` endpoints (backlog Epic 2.2) — one function
 * per endpoint, same shape as `features/clients/clients-api.ts`. Query wiring is in
 * `use-products.ts`.
 */

export type ProductListParams = Partial<
  Pick<ProductListQuery, 'search' | 'sort' | 'page' | 'pageSize'>
>;

function toQueryString(params: ProductListParams): string {
  const search = new URLSearchParams();
  if (params.search) search.set('search', params.search);
  if (params.sort) search.set('sort', params.sort);
  if (params.page && params.page > 1) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function fetchProducts(params: ProductListParams): Promise<ProductListResponse> {
  return apiFetch<ProductListResponse>(`/products${toQueryString(params)}`);
}

export function fetchProduct(id: string): Promise<ProductResponse> {
  return apiFetch<ProductResponse>(`/products/${id}`);
}

export function createProduct(input: ProductInput): Promise<ProductResponse> {
  return apiFetch<ProductResponse>('/products', { method: 'POST', body: input });
}

export function updateProduct(id: string, input: ProductInput): Promise<ProductResponse> {
  return apiFetch<ProductResponse>(`/products/${id}`, { method: 'PATCH', body: input });
}

export function deleteProduct(id: string): Promise<void> {
  return apiFetch<void>(`/products/${id}`, { method: 'DELETE' });
}
