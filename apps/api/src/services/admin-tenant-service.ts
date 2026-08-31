import type { Prisma, Subscription } from '@prisma/client';
import {
  type AdminDeleteTenantResponse,
  type AdminSubscriptionHistoryItem,
  type AdminTenantDetail,
  type AdminTenantListItem,
  type AdminTenantListQuery,
  type AdminTenantListResponse,
  higherTier,
  type TenantAccessSource,
  type UserTierName,
} from '@invoice-saas/shared';

import { prisma } from '../db/client.js';
import { ApiError } from '../lib/api-error.js';
import { resolveEntitlements } from '../lib/entitlements.js';
import { storage } from '../lib/storage/index.js';
import { recordAdminAction } from './admin-audit-service.js';
import { revokeAllSessions } from './auth-service.js';

/**
 * Admin tenant management (backlog Epic 8.3, spec §12). Read + a few privileged
 * mutations, all cross-tenant, so like the rest of the admin surface this runs on
 * the unscoped `prisma` client. Every mutation is audit-logged (8.1.2) and the
 * two destructive ones refuse to touch an `ADMIN` account or the caller's own.
 */

const LIVE_STATUSES: Subscription['status'][] = ['ACTIVE', 'PAST_DUE'];

/** Prisma predicate for "granting access at `now`". */
function liveSubWhere(now: Date): Prisma.SubscriptionWhereInput {
  return {
    status: { in: LIVE_STATUSES },
    startDate: { lte: now },
    OR: [{ endDate: null }, { endDate: { gt: now } }],
  };
}

/** Highest live tier + where it came from, for one tenant's live subscription
 *  rows. No live row → Free / `none`. */
function deriveAccess(liveRows: Pick<Subscription, 'tier' | 'source'>[]): {
  tier: UserTierName;
  source: TenantAccessSource;
} {
  if (liveRows.length === 0) return { tier: 'FREE', source: 'none' };
  let tier: UserTierName = 'FREE';
  for (const r of liveRows) tier = higherTier(tier, r.tier);
  const winner = liveRows.find((r) => r.tier === tier) ?? liveRows[0]!;
  return { tier, source: winner.source === 'STRIPE' ? 'stripe' : 'manual' };
}

// --- 8.3.1 list ------------------------------------------------------------

export async function listTenants(
  query: AdminTenantListQuery,
  now = new Date(),
): Promise<AdminTenantListResponse> {
  const where: Prisma.UserWhereInput = {};
  if (query.q) {
    where.OR = [
      { email: { contains: query.q, mode: 'insensitive' } },
      { businessName: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.status === 'active') where.disabledAt = null;
  if (query.status === 'disabled') where.disabledAt = { not: null };

  // `tier` / `source` are derived from live subscriptions, not `User` columns, so
  // narrow to the matching tenant ids first — keeps DB-level pagination correct.
  if (query.tier || query.source) {
    const liveRows = await prisma.subscription.findMany({
      where: liveSubWhere(now),
      select: { tenantId: true, tier: true, source: true },
    });
    const byTenant = new Map<string, Pick<Subscription, 'tier' | 'source'>[]>();
    for (const r of liveRows) {
      const list = byTenant.get(r.tenantId) ?? [];
      list.push(r);
      byTenant.set(r.tenantId, list);
    }

    let ids: string[];
    if (query.source === 'none' || query.tier === 'FREE') {
      // Tenants with NO live row. Fetch all ids and subtract — bounded, internal.
      const all = await prisma.user.findMany({ where, select: { id: true } });
      ids = all.map((u) => u.id).filter((id) => !byTenant.has(id));
    } else {
      ids = [];
      for (const [tenantId, rows] of byTenant) {
        const access = deriveAccess(rows);
        if (query.tier && access.tier !== query.tier) continue;
        if (query.source && access.source !== query.source) continue;
        ids.push(tenantId);
      }
    }
    where.id = { in: ids };
  }

  const orderBy: Prisma.UserOrderByWithRelationInput =
    query.sort === 'oldest'
      ? { createdAt: 'asc' }
      : query.sort === 'email'
        ? { email: 'asc' }
        : { createdAt: 'desc' };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        email: true,
        businessName: true,
        createdAt: true,
        emailVerifiedAt: true,
        disabledAt: true,
      },
    }),
  ]);

  const ids = users.map((u) => u.id);
  const [liveRows, counters, lastEvents] = await Promise.all([
    prisma.subscription.findMany({
      where: { tenantId: { in: ids }, ...liveSubWhere(now) },
      select: { tenantId: true, tier: true, source: true },
    }),
    prisma.usageCounter.findMany({
      where: { tenantId: { in: ids } },
      select: { tenantId: true, lifetimeInvoicesGenerated: true },
    }),
    prisma.invoiceHistoryEvent.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: ids } },
      _max: { timestamp: true },
    }),
  ]);

  const subsByTenant = new Map<string, Pick<Subscription, 'tier' | 'source'>[]>();
  for (const r of liveRows) {
    const list = subsByTenant.get(r.tenantId) ?? [];
    list.push(r);
    subsByTenant.set(r.tenantId, list);
  }
  const invoicesByTenant = new Map(counters.map((c) => [c.tenantId, c.lifetimeInvoicesGenerated]));
  const lastActiveByTenant = new Map(
    lastEvents.map((e) => [e.tenantId, e._max.timestamp?.toISOString() ?? null]),
  );

  const items: AdminTenantListItem[] = users.map((u) => {
    const access = deriveAccess(subsByTenant.get(u.id) ?? []);
    return {
      id: u.id,
      email: u.email,
      businessName: u.businessName,
      createdAt: u.createdAt.toISOString(),
      effectiveTier: access.tier,
      accessSource: access.source,
      invoicesCreated: invoicesByTenant.get(u.id) ?? 0,
      lastActiveAt: lastActiveByTenant.get(u.id) ?? null,
      emailVerified: u.emailVerifiedAt !== null,
      disabledAt: u.disabledAt?.toISOString() ?? null,
    };
  });

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

// --- 8.3.2 detail -------------------------------------------------------

function toSubHistoryItem(row: Subscription): AdminSubscriptionHistoryItem {
  return {
    id: row.id,
    tier: row.tier as 'BASIC' | 'PREMIUM',
    status: row.status,
    source: row.source,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    stripeSubscriptionId: row.stripeSubscriptionId,
    note: row.note,
    grantedByUserId: row.grantedByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getTenantDetail(id: string): Promise<AdminTenantDetail> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('No tenant with that id.');

  const [entitlements, counter, clients, products, templates, invoiceGroups, aiAgg, subs, recent] =
    await Promise.all([
      resolveEntitlements(id),
      prisma.usageCounter.findUnique({ where: { tenantId: id } }),
      prisma.client.count({ where: { tenantId: id, deletedAt: null } }),
      prisma.product.count({ where: { tenantId: id, deletedAt: null } }),
      prisma.template.count({ where: { tenantId: id, deletedAt: null } }),
      prisma.invoice.groupBy({
        by: ['status'],
        where: { tenantId: id, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.aiGenerationLog.aggregate({
        where: { tenantId: id },
        _count: { _all: true },
        _sum: { costMicros: true },
      }),
      prisma.subscription.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' } }),
      prisma.invoiceHistoryEvent.findMany({
        where: { tenantId: id },
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: { id: true, invoiceId: true, eventType: true, timestamp: true },
      }),
    ]);

  const invoicesDraft = invoiceGroups.find((g) => g.status === 'DRAFT')?._count._all ?? 0;
  const invoicesIssued = invoiceGroups.find((g) => g.status === 'ISSUED')?._count._all ?? 0;

  return {
    id: user.id,
    email: user.email,
    businessName: user.businessName,
    country: user.country,
    preferredLanguage: user.preferredLanguage,
    defaultCurrency: user.defaultCurrency,
    createdAt: user.createdAt.toISOString(),
    emailVerified: user.emailVerifiedAt !== null,
    onboardingCompleted: user.onboardingCompletedAt !== null,
    role: user.role,
    disabledAt: user.disabledAt?.toISOString() ?? null,
    disabledReason: user.disabledReason,
    entitlements,
    usage: {
      lifetimeInvoicesGenerated: counter?.lifetimeInvoicesGenerated ?? 0,
      aiGenerationsInPeriod: counter?.aiGenerationsInPeriod ?? 0,
      aiPeriodKey: counter?.aiPeriodKey ?? '',
      clients,
      products,
      templates,
      invoicesDraft,
      invoicesIssued,
      aiGenerations: aiAgg._count._all,
      aiCostMicros: aiAgg._sum.costMicros ?? 0,
    },
    subscriptionHistory: subs.map(toSubHistoryItem),
    recentActivity: recent.map((e) => ({
      id: e.id,
      invoiceId: e.invoiceId,
      eventType: e.eventType,
      timestamp: e.timestamp.toISOString(),
    })),
  };
}

// --- 8.3.4 disable / enable ------------------------------------------

/** Load a tenant for a privileged mutation, refusing an admin or the caller. */
async function loadMutableTenant(id: string, actingUserId: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('No tenant with that id.');
  if (user.id === actingUserId) {
    throw new ApiError('VALIDATION_ERROR', 'You cannot run this action on your own account.', {
      status: 400,
    });
  }
  if (user.role === 'ADMIN') {
    throw new ApiError('VALIDATION_ERROR', 'Admin accounts cannot be disabled or deleted here.', {
      status: 400,
    });
  }
  return user;
}

export async function disableTenant(
  id: string,
  actingUserId: string,
  reason?: string,
): Promise<AdminTenantDetail> {
  const user = await loadMutableTenant(id, actingUserId);
  if (user.disabledAt === null) {
    await prisma.user.update({
      where: { id },
      data: { disabledAt: new Date(), disabledReason: reason ?? null },
    });
    await revokeAllSessions(id);
    await recordAdminAction({
      actorUserId: actingUserId,
      action: 'account.disable',
      targetTenantId: id,
      subjectType: 'User',
      subjectId: id,
      summary: `Disabled ${user.email}${reason ? ` — ${reason}` : ''}`,
      metadata: { reason: reason ?? null },
    });
  }
  return getTenantDetail(id);
}

export async function enableTenant(id: string, actingUserId: string): Promise<AdminTenantDetail> {
  const user = await loadMutableTenant(id, actingUserId);
  if (user.disabledAt !== null) {
    await prisma.user.update({
      where: { id },
      data: { disabledAt: null, disabledReason: null },
    });
    await recordAdminAction({
      actorUserId: actingUserId,
      action: 'account.enable',
      targetTenantId: id,
      subjectType: 'User',
      subjectId: id,
      summary: `Re-enabled ${user.email}`,
    });
  }
  return getTenantDetail(id);
}

// --- 8.3.5 delete ---------------------------------------------------

export async function deleteTenant(
  id: string,
  actingUserId: string,
): Promise<AdminDeleteTenantResponse> {
  const user = await loadMutableTenant(id, actingUserId);

  const [clients, products, templates, invoices, subscriptions, aiLogs, historyEvents] =
    await Promise.all([
      prisma.client.count({ where: { tenantId: id } }),
      prisma.product.count({ where: { tenantId: id } }),
      prisma.template.count({ where: { tenantId: id } }),
      prisma.invoice.count({ where: { tenantId: id } }),
      prisma.subscription.count({ where: { tenantId: id } }),
      prisma.aiGenerationLog.count({ where: { tenantId: id } }),
      prisma.invoiceHistoryEvent.count({ where: { tenantId: id } }),
    ]);
  const deletedCounts = {
    clients,
    products,
    templates,
    invoices,
    subscriptions,
    aiGenerationLogs: aiLogs,
    invoiceHistoryEvents: historyEvents,
  };

  // Stored assets are not FK-linked — remove the logo file explicitly (PDFs are
  // generated on demand, never persisted). Best-effort: a missing file is fine.
  if (user.logoUrl) {
    const key = storage.keyFromUrl(user.logoUrl);
    if (key) await storage.delete(key).catch(() => undefined);
  }

  // Every child table is `onDelete: Cascade` from `users`, so this one delete
  // wipes clients, products, templates, invoices (+ line items), history,
  // numbering, subscriptions, usage, AI logs and tokens. `AdminAuditLog` is
  // deliberately NOT linked, so the trail below survives.
  await prisma.user.delete({ where: { id } });

  await recordAdminAction({
    actorUserId: actingUserId,
    action: 'tenant.delete',
    targetTenantId: id,
    targetTenantEmail: user.email,
    subjectType: 'User',
    subjectId: id,
    summary: `Deleted ${user.email} (${user.businessName}) and all its data`,
    metadata: { businessName: user.businessName, deletedCounts },
  });

  return { id, email: user.email, deletedCounts };
}
