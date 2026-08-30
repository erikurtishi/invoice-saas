import { useMutation, useQuery } from '@tanstack/react-query';
import type { AiDraftResponse } from '@invoice-saas/shared';

import { HttpError } from '../../lib/http-error';
import { draftInvoice, fetchAiStatus } from './ai-api';

/**
 * AI drafting as TanStack Query (backlog Epic 7.2). `useAiStatus` gates whether
 * the panel offers an input at all; `useDraftInvoice` is a one-shot mutation the
 * panel drives, passing an `AbortSignal` so a slow generation can be cancelled
 * (X.7.4). The server re-checks the Premium entitlement and the monthly cap on
 * every call (7.1.6) — this is only the affordance.
 */

export const aiKeys = {
  all: ['ai'] as const,
  status: () => [...aiKeys.all, 'status'] as const,
};

export function useAiStatus() {
  return useQuery<{ enabled: boolean }, HttpError>({
    queryKey: aiKeys.status(),
    queryFn: fetchAiStatus,
    staleTime: 10 * 60 * 1000,
  });
}

export interface DraftInvoiceVars {
  prompt: string;
  signal?: AbortSignal;
}

export function useDraftInvoice() {
  return useMutation<AiDraftResponse, HttpError, DraftInvoiceVars>({
    mutationFn: ({ prompt, signal }) => draftInvoice(prompt, signal),
  });
}
