import { type AiDraftResponse, aiDraftResponseSchema } from '@invoice-saas/shared';

import { apiFetch } from '../../lib/api-client';

/**
 * Thin wrappers over `/ai` (backlog Epic 7.1 / 7.2) — one function per endpoint,
 * same shape as `features/billing/billing-api.ts`. TanStack Query wiring is in
 * `use-ai.ts`.
 *
 * The draft response is validated against the shared schema at the boundary, so
 * any drift between what the server returns and what the invoice form consumes
 * surfaces here rather than as a silent missing field.
 */

/** Whether the server has an LLM provider wired (backlog 7.1.1 is deferred, so
 *  today this is `false` and the panel explains that instead of failing on
 *  submit — mirrors `GET /billing/config`). */
export function fetchAiStatus(): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>('/ai/status');
}

/** `POST /ai/draft-invoice` — one sentence in, an editable draft out. Nothing is
 *  saved or sent. `signal` lets the caller cancel a slow generation (X.7.4). */
export function draftInvoice(prompt: string, signal?: AbortSignal): Promise<AiDraftResponse> {
  return apiFetch<unknown>('/ai/draft-invoice', {
    method: 'POST',
    body: { prompt },
    ...(signal ? { signal } : {}),
  }).then((body) => aiDraftResponseSchema.parse(body));
}
