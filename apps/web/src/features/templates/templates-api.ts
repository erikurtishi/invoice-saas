import type { TemplateInput, TemplateListResponse, TemplateResponse } from '@invoice-saas/shared';

import { apiFetch } from '../../lib/api-client';

/**
 * Wrappers over the `/templates` endpoints (backlog Epic 3.3). The mutations that
 * return the whole list (`setDefault`, `delete`) let the hook write it straight
 * back into the cache — the server owns the "one default" invariant, so a partial
 * update on the client could disagree with it.
 */

export function fetchTemplates(): Promise<TemplateListResponse> {
  return apiFetch<TemplateListResponse>('/templates');
}

export function fetchTemplate(id: string): Promise<TemplateResponse> {
  return apiFetch<TemplateResponse>(`/templates/${id}`);
}

export function createTemplate(input: TemplateInput): Promise<TemplateResponse> {
  return apiFetch<TemplateResponse>('/templates', { method: 'POST', body: input });
}

export function updateTemplate(id: string, input: TemplateInput): Promise<TemplateResponse> {
  return apiFetch<TemplateResponse>(`/templates/${id}`, { method: 'PATCH', body: input });
}

export function duplicateTemplate(id: string, name?: string): Promise<TemplateResponse> {
  return apiFetch<TemplateResponse>(`/templates/${id}/duplicate`, {
    method: 'POST',
    body: name ? { name } : {},
  });
}

export function setDefaultTemplate(id: string): Promise<TemplateListResponse> {
  return apiFetch<TemplateListResponse>(`/templates/${id}/default`, { method: 'POST' });
}

export function deleteTemplate(id: string): Promise<TemplateListResponse> {
  return apiFetch<TemplateListResponse>(`/templates/${id}`, { method: 'DELETE' });
}
