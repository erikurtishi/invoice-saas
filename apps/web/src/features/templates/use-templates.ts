import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TemplateInput, TemplateListResponse, TemplateResponse } from '@invoice-saas/shared';

import { HttpError } from '../../lib/http-error';
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  fetchTemplate,
  fetchTemplates,
  setDefaultTemplate,
  updateTemplate,
} from './templates-api';

/**
 * Templates as TanStack Query (backlog Epic 3.3). The list is small (no
 * pagination) — one query, read through `<QueryBoundary>`. Mutations that return
 * the full list write it into the cache; the others invalidate.
 */

export const templateKeys = {
  all: ['templates'] as const,
  list: () => [...templateKeys.all, 'list'] as const,
  detail: (id: string) => [...templateKeys.all, 'detail', id] as const,
};

export function useTemplates() {
  return useQuery<TemplateListResponse, HttpError>({
    queryKey: templateKeys.list(),
    queryFn: fetchTemplates,
    staleTime: 60 * 1000,
  });
}

export function useTemplate(id: string | undefined) {
  return useQuery<TemplateResponse, HttpError>({
    queryKey: templateKeys.detail(id ?? '__none__'),
    queryFn: () => fetchTemplate(id as string),
    enabled: id !== undefined,
  });
}

function writeList(qc: ReturnType<typeof useQueryClient>, list: TemplateListResponse) {
  qc.setQueryData(templateKeys.list(), list);
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TemplateInput) => createTemplate(input),
    onSuccess: (template) => {
      qc.setQueryData(templateKeys.detail(template.id), template);
      void qc.invalidateQueries({ queryKey: templateKeys.list() });
    },
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TemplateInput }) => updateTemplate(id, input),
    onSuccess: (template) => {
      qc.setQueryData(templateKeys.detail(template.id), template);
      void qc.invalidateQueries({ queryKey: templateKeys.list() });
    },
  });
}

export function useDuplicateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) => duplicateTemplate(id, name),
    onSuccess: (template) => {
      qc.setQueryData(templateKeys.detail(template.id), template);
      void qc.invalidateQueries({ queryKey: templateKeys.list() });
    },
  });
}

export function useSetDefaultTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setDefaultTemplate(id),
    onSuccess: (list) => writeList(qc, list),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: (list, id) => {
      qc.removeQueries({ queryKey: templateKeys.detail(id) });
      writeList(qc, list);
    },
  });
}
