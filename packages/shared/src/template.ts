import { z } from 'zod';

import { templateConfigSchema } from './render/index.js';

/**
 * Template payload shapes (backlog Epic 3.3). A template is a name plus the design
 * config from 3.1.1 (`templateConfigSchema`). Imported by `apps/api` for request
 * validation and by `apps/web` for the editor's save flow and the list page.
 *
 * Tenant-owned (decision D3) and soft-deleted (decision D4). `isDefault` is not
 * settable through the normal create/update payload — it moves via the dedicated
 * "set default" endpoint (3.3.4), which keeps "exactly one default" a transaction
 * invariant rather than something any write could break.
 */

export const templateNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a template name.')
  .max(120, 'Template name is too long.');

/** Create / update body: name + full config. */
export const templateInputSchema = z.object({
  name: templateNameSchema,
  config: templateConfigSchema,
});
export type TemplateInput = z.infer<typeof templateInputSchema>;

/** `POST /templates/:id/duplicate` body — an optional override name. */
export const templateDuplicateSchema = z.object({
  name: templateNameSchema.optional(),
});
export type TemplateDuplicateInput = z.infer<typeof templateDuplicateSchema>;

export const templateResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  config: templateConfigSchema,
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TemplateResponse = z.infer<typeof templateResponseSchema>;

/** The list (3.3.2) is small — every non-deleted template, default first. No
 * pagination or search. */
export const templateListResponseSchema = z.object({
  items: z.array(templateResponseSchema),
});
export type TemplateListResponse = z.infer<typeof templateListResponseSchema>;
