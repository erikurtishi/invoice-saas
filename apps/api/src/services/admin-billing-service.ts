import type { Prisma, Subscription } from '@prisma/client';
import {
  type AdminBillingAttention,
  type AdminBillingAttentionQuery,
  type AdminBillingListQuery,
  type AdminBillingListResponse,
  type AdminBillingSubscription,
} from '@invoice-saas/shared';

import { prisma } from '../db/client.js';

/**
 * Admin billing view (backlog Epic 8.5, spec §12). Read-only, unscoped. We
 * persist subscription-level state only — per-invoice failed-payment detail
 * lives in the Stripe dashboard — so "failed payments" here is the set of Stripe
 * subs in `PAST_DUE` (Stripe's dunning state).
 *
 * The subscription table is small (one-ish row per payer), so the list is sorted
 * and paged in memory: this keeps the `expiry` sort (order by
 * `endDate ?? currentPeriodEnd`) simple without a raw coalesce.
 */

const DAY_MS = 86_400_000;

type SubWithTenant = Subscription & {
  tenant: { email: string; businessName: string };
};

function effectiveEnd(row: Pick<Subscription, 'endDate' | 'currentPeriodEnd'>): Date | null {
  return row.endDate ?? row.currentPeriodEnd ?? null;
}

function toBillingRow(row: SubWithTenant, now: Date): AdminBillingSubscription {
  const end = effectiveEnd(row);
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantEmail: row.tenant.email,
    tenantBusinessName: row.tenant.businessName,
    source: row.source,
    tier: row.tier as 'BASIC' | 'PREMIUM',
    status: row.status,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    stripeSubscriptionId: row.stripeSubscriptionId,
    stripePriceId: row.stripePriceId,
    note: row.note,
    grantedByUserId: row.grantedByUserId,
    createdAt: row.createdAt.toISOString(),
    effectiveEnd: end?.toISOString() ?? null,
    daysUntilEnd: end === null ? null : Math.floor((end.getTime() - now.getTime()) / DAY_MS),
  };
}

function sourceFilter(source: AdminBillingListQuery['source']): Prisma.SubscriptionWhereInput {
  if (source === 'stripe') return { source: 'STRIPE' };
  if (source === 'manual') return { source: 'MANUAL' };
  return {};
}

export async function listBillingSubscriptions(
  query: AdminBillingListQuery,
  now = new Date(),
): Promise<AdminBillingListResponse> {
  const srcWhere = sourceFilter(query.source);

  const [scoped, summaryRows] = await Promise.all([
    prisma.subscription.findMany({
      where: { ...srcWhere, ...(query.status ? { status: query.status } : {}) },
      include: { tenant: { select: { email: true, businessName: true } } },
    }),
    prisma.subscription.findMany({
      where: srcWhere,
      select: { status: true, source: true, cancelAtPeriodEnd: true },
    }),
  ]);

  const rows = scoped.map((r) => toBillingRow(r, now));
  rows.sort((a, b) => {
    if (query.sort === 'expiry') {
      const ax = a.effectiveEnd ? Date.parse(a.effectiveEnd) : Number.POSITIVE_INFINITY;
      const bx = b.effectiveEnd ? Date.parse(b.effectiveEnd) : Number.POSITIVE_INFINITY;
      return ax - bx || Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  const start = (query.page - 1) * query.pageSize;
  const items = rows.slice(start, start + query.pageSize);

  const summary = {
    total: summaryRows.length,
    byStatus: { ACTIVE: 0, PAST_DUE: 0, EXPIRED: 0, CANCELED: 0 },
    bySource: { stripe: 0, manual: 0 },
    cancelingAtPeriodEnd: 0,
  };
  for (const s of summaryRows) {
    summary.byStatus[s.status] += 1;
    if (s.source === 'STRIPE') summary.bySource.stripe += 1;
    else summary.bySource.manual += 1;
    if (s.cancelAtPeriodEnd) summary.cancelingAtPeriodEnd += 1;
  }

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: rows.length,
    totalPages: Math.max(1, Math.ceil(rows.length / query.pageSize)),
    summary,
  };
}

export async function getBillingAttention(
  { renewalWindowDays }: AdminBillingAttentionQuery,
  now = new Date(),
): Promise<AdminBillingAttention> {
  const windowEnd = new Date(now.getTime() + renewalWindowDays * DAY_MS);

  const [failed, renewing] = await Promise.all([
    prisma.subscription.findMany({
      where: { source: 'STRIPE', status: 'PAST_DUE' },
      include: { tenant: { select: { email: true, businessName: true } } },
      orderBy: { currentPeriodEnd: 'asc' },
    }),
    prisma.subscription.findMany({
      where: {
        source: 'STRIPE',
        status: 'ACTIVE',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { gt: now, lte: windowEnd },
      },
      include: { tenant: { select: { email: true, businessName: true } } },
      orderBy: { currentPeriodEnd: 'asc' },
    }),
  ]);

  return {
    generatedAt: now.toISOString(),
    renewalWindowDays,
    failedPayments: failed.map((r) => toBillingRow(r, now)),
    upcomingRenewals: renewing.map((r) => toBillingRow(r, now)),
  };
}
