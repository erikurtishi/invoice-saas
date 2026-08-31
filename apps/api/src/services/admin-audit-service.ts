import type { AdminAuditLog, Prisma } from '@prisma/client';
import {
  type AdminAuditLogEntry,
  type AdminAuditLogQuery,
  type AdminAuditLogResponse,
  type AdminAuditMetadata,
  adminAuditMetadataSchema,
} from '@invoice-saas/shared';

import { prisma } from '../db/client.js';

/**
 * The admin-center audit trail (backlog 8.1.2 — "who granted what, when").
 *
 * **Append-only:** this module is the *only* writer of `admin_audit_logs`, and it
 * only ever inserts — there is deliberately no update and no delete, here or
 * anywhere. It mirrors `invoice-history-service.ts`, with two differences:
 *
 *  - It runs on the **unscoped** `prisma` client. Admin actions are cross-tenant
 *    by definition (the same reason `manual-grant-service.ts` is unscoped), and
 *    `AdminAuditLog` is intentionally absent from `TENANT_SCOPED_MODELS`.
 *  - Writing is **best-effort** from the caller's side: `recordAdminAction`
 *    never throws, so a logging failure can't turn a successful grant into a
 *    failed request. The admin action itself is the source of truth; the log is
 *    a record of it.
 */

interface RecordAdminActionArgs {
  /** The admin `users.id` that performed the action; `null` for a CLI script. */
  actorUserId: string | null;
  /** Dotted machine slug, e.g. `grant.create` (see `ADMIN_AUDIT_ACTIONS`). */
  action: string;
  /** The tenant the action affected, if any. */
  targetTenantId?: string | null;
  /** Email snapshot to store instead of looking one up from `targetTenantId` —
   *  pass this when the tenant row is already gone (`tenant.delete`). */
  targetTenantEmail?: string | null;
  /** The record acted on, e.g. `'Subscription'` + the grant id. */
  subjectType?: string | null;
  subjectId?: string | null;
  /** Rendered one-line description for the admin activity view. */
  summary: string;
  /** `action`-dependent detail; validated against `adminAuditMetadataSchema`. */
  metadata?: AdminAuditMetadata;
}

/**
 * Append one entry to the admin audit log. Insert-only — see the module note.
 *
 * Resolves the actor's and target tenant's current email and stores them as
 * snapshots so the entry stays readable after either row is deleted. `metadata`
 * is parsed (not just trusted) so a typo in a call site surfaces here rather than
 * as malformed JSON in the trail — the input is always our own code.
 *
 * Never rejects: any failure is logged and swallowed.
 */
export async function recordAdminAction(args: RecordAdminActionArgs): Promise<void> {
  try {
    const parsed = adminAuditMetadataSchema.parse(args.metadata ?? {});

    const [actor, targetTenant] = await Promise.all([
      args.actorUserId
        ? prisma.user.findUnique({
            where: { id: args.actorUserId },
            select: { email: true },
          })
        : Promise.resolve(null),
      args.targetTenantId && args.targetTenantEmail === undefined
        ? prisma.user.findUnique({
            where: { id: args.targetTenantId },
            select: { email: true },
          })
        : Promise.resolve(null),
    ]);

    await prisma.adminAuditLog.create({
      data: {
        actorUserId: args.actorUserId,
        actorEmail: actor?.email ?? null,
        action: args.action,
        targetTenantId: args.targetTenantId ?? null,
        targetTenantEmail:
          args.targetTenantEmail !== undefined
            ? args.targetTenantEmail
            : (targetTenant?.email ?? null),
        subjectType: args.subjectType ?? null,
        subjectId: args.subjectId ?? null,
        summary: args.summary,
        metadata: parsed as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(`[admin-audit] failed to record ${args.action}`, err);
  }
}

// --- read (the Epic 8 admin center consumes this) --------------------

function toEntry(row: AdminAuditLog): AdminAuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    actorEmail: row.actorEmail,
    action: row.action,
    targetTenantId: row.targetTenantId,
    targetTenantEmail: row.targetTenantEmail,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    summary: row.summary,
    // Parsed against the schema by `recordAdminAction` on the way in.
    metadata: (row.metadata ?? {}) as AdminAuditMetadata,
    createdAt: row.createdAt.toISOString(),
  };
}

// UTC day bounds for the inclusive `dateFrom` / `dateTo` filter.
function dayStart(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function dayEnd(iso: string): Date {
  return new Date(`${iso}T23:59:59.999Z`);
}

/**
 * The audit trail, newest first, filtered and paginated per `AdminAuditLogQuery`.
 * Unscoped by design — an admin sees actions across every tenant.
 */
export async function listAdminAuditLog(query: AdminAuditLogQuery): Promise<AdminAuditLogResponse> {
  const where: Prisma.AdminAuditLogWhereInput = {};
  if (query.actorUserId) where.actorUserId = query.actorUserId;
  if (query.targetTenantId) where.targetTenantId = query.targetTenantId;
  if (query.action) where.action = query.action;
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {
      ...(query.dateFrom ? { gte: dayStart(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: dayEnd(query.dateTo) } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: rows.map(toEntry),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
