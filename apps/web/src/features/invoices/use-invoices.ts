import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InvoiceInput, InvoiceListResponse, InvoiceResponse } from '@invoice-saas/shared';

import { HttpError } from '../../lib/http-error';
import {
  createInvoiceDraft,
  deleteInvoice,
  downloadInvoicePdf,
  duplicateInvoice,
  exportInvoicesCsv,
  fetchInvoice,
  fetchInvoices,
  finalizeInvoice,
  type InvoiceListParams,
  saveInvoice,
  sendInvoice,
} from './invoices-api';

/** Hand a fetched blob to the browser as a download with the given fallback name. */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Invoices as TanStack Query (backlog Epic 4.2 / 4.3 / 4.4). The detail query
 * backs the open/edit flow; the mutations are the low-level calls. The compose
 * screen drives create/save/finalize through `use-invoice-draft.ts`, which owns
 * the debounce and the "create on first edit" rule.
 */

export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  detail: (id: string) => [...invoiceKeys.all, 'detail', id] as const,
};

export function useInvoice(id: string | undefined) {
  return useQuery<InvoiceResponse, HttpError>({
    queryKey: invoiceKeys.detail(id ?? '__none__'),
    queryFn: () => fetchInvoice(id as string),
    enabled: id !== undefined,
  });
}

/** The invoice library list (4.5.1). Keeps the previous page on screen while the
 * next loads — `<QueryBoundary>` shows a thin refreshing bar, not a skeleton. */
export function useInvoices(params: InvoiceListParams) {
  return useQuery<InvoiceListResponse, HttpError>({
    queryKey: [...invoiceKeys.lists(), params] as const,
    queryFn: () => fetchInvoices(params),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useCreateInvoiceDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InvoiceInput) => createInvoiceDraft(input),
    onSuccess: (invoice) => qc.setQueryData(invoiceKeys.detail(invoice.id), invoice),
  });
}

/** Save current fields — autosave for a DRAFT (via `use-invoice-draft`), explicit
 * Save for an ISSUED invoice (4.4.2). Writes the fresh row into the detail cache;
 * callers that change library-visible fields invalidate the list themselves. */
export function useUpdateInvoiceDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: InvoiceInput }) => saveInvoice(id, input),
    onSuccess: (invoice) => qc.setQueryData(invoiceKeys.detail(invoice.id), invoice),
  });
}

export function useFinalizeInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: InvoiceInput }) => finalizeInvoice(id, input),
    onSuccess: (invoice) => {
      qc.setQueryData(invoiceKeys.detail(invoice.id), invoice);
      void qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
  });
}

/** Duplicate into a new DRAFT (4.4.4). */
export function useDuplicateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => duplicateInvoice(id),
    onSuccess: (invoice) => {
      qc.setQueryData(invoiceKeys.detail(invoice.id), invoice);
      void qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
  });
}

/** Delete with confirmation handled at the call site (4.4.5). */
export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onSuccess: (_result, id) => {
      qc.removeQueries({ queryKey: invoiceKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
  });
}

export interface RenderTarget {
  id: string;
  /** Present → render unsaved edits without persisting (edit screen, 4.4.2). */
  draft?: InvoiceInput | null;
}

/** Download action (4.3.3): fetch a fresh PDF and hand it to the browser with the
 * server-chosen filename. Never mutates server state. */
export function useDownloadInvoicePdf() {
  return useMutation({
    mutationFn: async ({ id, draft = null }: RenderTarget) => {
      const { blob, filename } = await downloadInvoicePdf(id, draft);
      triggerBlobDownload(blob, filename ?? 'invoice.pdf');
      return filename;
    },
  });
}

/** Send action (4.3.4). Returns recipient + timestamp for the confirmation state
 * (X.7.10). */
export function useSendInvoice() {
  return useMutation({
    mutationFn: ({ id, draft = null }: RenderTarget) => sendInvoice(id, draft),
  });
}

/** CSV export of the filtered library (4.5.4). */
export function useExportInvoicesCsv() {
  return useMutation({
    mutationFn: async (params: InvoiceListParams) => {
      const { blob, filename } = await exportInvoicesCsv(params);
      triggerBlobDownload(blob, filename ?? 'invoices.csv');
      return filename;
    },
  });
}
