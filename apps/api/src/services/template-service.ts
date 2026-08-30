import type { Prisma, Template } from '@prisma/client';
import {
  DEFAULT_TEMPLATE_PRESET_ID,
  type TemplateInput,
  type TemplateListResponse,
  type TemplateResponse,
  templateConfigSchema,
  templatePresetById,
} from '@invoice-saas/shared';

import type { ScopedPrismaClient } from '../db/tenant-scope.js';
import { ApiError } from '../lib/api-error.js';

/**
 * Template reads and writes (backlog Epic 3.3). Same tenant-scoping contract as
 * `client-service` / `product-service`: every function takes `req.db` and never
 * mentions `tenantId`. Soft delete (decision D4) — a template referenced by a
 * historical invoice keeps resolving; it just leaves the list.
 *
 * Two invariants enforced here, not by the DB:
 *  - a tenant always has at least one live template (lazily seeded from the
 *    `classic` preset), and
 *  - exactly one live template is `isDefault` (moved only inside a transaction).
 */

function toTemplateResponse(row: Template): TemplateResponse {
  return {
    id: row.id,
    name: row.name,
    // Stored JSON is re-parsed so a schema mismatch surfaces here, not downstream.
    config: templateConfigSchema.parse(row.config),
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Ensure the tenant has at least one template; seed the `classic` preset as the
 * default if not. Returns nothing — callers re-query. */
async function ensureSeeded(db: ScopedPrismaClient): Promise<void> {
  const count = await db.template.count({ where: { deletedAt: null } });
  if (count > 0) return;
  const preset = templatePresetById(DEFAULT_TEMPLATE_PRESET_ID);
  if (!preset) return;
  await db.template.create({
    data: {
      name: preset.name,
      config: preset.config as unknown as Prisma.InputJsonValue,
      isDefault: true,
    } as unknown as Prisma.TemplateCreateInput,
  });
}

export async function listTemplates(db: ScopedPrismaClient): Promise<TemplateListResponse> {
  await ensureSeeded(db);
  const rows = await db.template.findMany({
    where: { deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return { items: rows.map(toTemplateResponse) };
}

async function loadTemplate(db: ScopedPrismaClient, id: string): Promise<Template> {
  const template = await db.template.findFirst({ where: { id, deletedAt: null } });
  if (!template) throw ApiError.notFound('That template no longer exists.');
  return template;
}

export async function getTemplate(db: ScopedPrismaClient, id: string): Promise<TemplateResponse> {
  return toTemplateResponse(await loadTemplate(db, id));
}

export async function createTemplate(
  db: ScopedPrismaClient,
  input: TemplateInput,
): Promise<TemplateResponse> {
  // The very first template a tenant creates becomes the default so the invariant
  // holds without a follow-up call.
  const existing = await db.template.count({ where: { deletedAt: null } });
  const template = await db.template.create({
    data: {
      name: input.name,
      config: input.config as unknown as Prisma.InputJsonValue,
      isDefault: existing === 0,
    } as unknown as Prisma.TemplateCreateInput,
  });
  return toTemplateResponse(template);
}

export async function updateTemplate(
  db: ScopedPrismaClient,
  id: string,
  input: TemplateInput,
): Promise<TemplateResponse> {
  await loadTemplate(db, id);
  const template = await db.template.update({
    where: { id },
    data: { name: input.name, config: input.config as unknown as Prisma.InputJsonValue },
  });
  return toTemplateResponse(template);
}

export async function duplicateTemplate(
  db: ScopedPrismaClient,
  id: string,
  name?: string,
): Promise<TemplateResponse> {
  const source = await loadTemplate(db, id);
  const template = await db.template.create({
    data: {
      name: name ?? `${source.name} (copy)`,
      config: source.config as unknown as Prisma.InputJsonValue,
      isDefault: false,
    } as unknown as Prisma.TemplateCreateInput,
  });
  return toTemplateResponse(template);
}

export async function setDefaultTemplate(
  db: ScopedPrismaClient,
  id: string,
): Promise<TemplateListResponse> {
  await loadTemplate(db, id);
  await db.$transaction(async (tx) => {
    await tx.template.updateMany({
      where: { deletedAt: null, isDefault: true, NOT: { id } },
      data: { isDefault: false },
    });
    await tx.template.update({ where: { id }, data: { isDefault: true } });
  });
  return listTemplates(db);
}

export async function deleteTemplate(
  db: ScopedPrismaClient,
  id: string,
): Promise<TemplateListResponse> {
  const target = await loadTemplate(db, id);
  const liveCount = await db.template.count({ where: { deletedAt: null } });
  if (liveCount <= 1) {
    throw ApiError.conflict(
      'You need at least one template. Create another before deleting this one.',
    );
  }

  await db.$transaction(async (tx) => {
    await tx.template.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
    if (target.isDefault) {
      // Promote the oldest remaining template so the tenant always has a default.
      const next = await tx.template.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (next) await tx.template.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });

  return listTemplates(db);
}
