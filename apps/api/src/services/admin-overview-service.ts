import type { Subscription } from '@prisma/client';
import {
  type AdminOverview,
  type AdminRevenueSeries,
  type AdminSignupsSeries,
  PLAN_CATALOG,
  type UserTierName,
} from '@invoice-saas/shared';

import { prisma } from '../db/client.js';

/**
 * The admin overview metrics (backlog Epic 8.2, spec §12). Read-only, computed
 * live from `User` + `Subscription` rows — nothing here is snapshotted, so every
 * number is "as of now". Runs on the **unscoped** `prisma` client: admin reads
 * span every tenant (same rationale as `manual-grant-service.ts`).
 *
 * Definitions and the deliberate approximations are documented on the schemas in
 * `@invoice-saas/shared` (`admin.ts`); the notes here cover only the query shape.
 */

type PaidTier = 'BASIC' | 'PREMIUM';

/** Monthly plan price for a paid tier, in minor units (euro cents). */
function tierPriceMinor(tier: string): number {
  return PLAN_CATALOG[tier as UserTierName]?.priceMinor ?? 0;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
/** `bps` of `part / whole`, rounded, floored at 0; `0` when `whole` is 0. */
function rateBps(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.max(0, Math.round((part * 10_000) / whole));
}

/** A subscription row is "live now" if it is granting access at `now`. */
function isLiveNow(
  row: Pick<Subscription, 'status' | 'startDate' | 'endDate'>,
  now: Date,
): boolean {
  if (row.status !== 'ACTIVE' && row.status !== 'PAST_DUE') return false;
  if (row.startDate > now) return false;
  return row.endDate === null || row.endDate > now;
}

export async function getAdminOverview(now = new Date()): Promise<AdminOverview> {
  const todayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);
  const day = 86_400_000;

  const [allSubs, totalTenants, signupToday, signup7, signup30, paidTenantGroups, churnThisMonth] =
    await Promise.all([
      prisma.subscription.findMany({
        select: { tier: true, source: true, status: true, startDate: true, endDate: true },
      }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.user.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * day) } } }),
      prisma.user.count({ where: { createdAt: { gte: new Date(now.getTime() - 30 * day) } } }),
      prisma.subscription.groupBy({ by: ['tenantId'] }),
      prisma.subscription.count({
        where: { endDate: { gte: monthStart, lte: now } },
      }),
    ]);

  const live = allSubs.filter((s) => isLiveNow(s, now));

  // MRR — Stripe recurring only.
  const mrrByTier: Record<PaidTier, number> = { BASIC: 0, PREMIUM: 0 };
  let atRiskMinor = 0;
  for (const s of live) {
    if (s.source !== 'STRIPE') continue;
    const price = tierPriceMinor(s.tier);
    if (s.tier === 'BASIC' || s.tier === 'PREMIUM') mrrByTier[s.tier] += price;
    if (s.status === 'PAST_DUE') atRiskMinor += price;
  }
  const mrrTotalMinor = mrrByTier.BASIC + mrrByTier.PREMIUM;

  // Active subscriptions — both sources.
  const activeByTier: Record<PaidTier, number> = { BASIC: 0, PREMIUM: 0 };
  const activeBySource = { stripe: 0, manual: 0 };
  for (const s of live) {
    if (s.tier === 'BASIC' || s.tier === 'PREMIUM') activeByTier[s.tier] += 1;
    if (s.source === 'STRIPE') activeBySource.stripe += 1;
    else if (s.source === 'MANUAL') activeBySource.manual += 1;
  }

  const paidTenants = paidTenantGroups.length;

  return {
    generatedAt: now.toISOString(),
    mrr: {
      totalMinor: mrrTotalMinor,
      currency: PLAN_CATALOG.BASIC.currency,
      byTier: mrrByTier,
      atRiskMinor,
    },
    activeSubscriptions: {
      total: live.length,
      byTier: activeByTier,
      bySource: activeBySource,
    },
    signups: {
      today: signupToday,
      last7Days: signup7,
      last30Days: signup30,
      total: totalTenants,
    },
    churn: {
      thisMonth: churnThisMonth,
      rateBps: rateBps(churnThisMonth, live.length + churnThisMonth),
    },
    conversion: {
      paidTenants,
      totalTenants,
      rateBps: rateBps(paidTenants, totalTenants),
    },
  };
}

/** `YYYY-MM-DD` in UTC. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** `YYYY-MM` in UTC. */
function isoMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export async function getSignupsSeries(
  days: number,
  now = new Date(),
): Promise<AdminSignupsSeries> {
  const day = 86_400_000;
  const toDay = startOfUtcDay(now);
  const fromDay = new Date(toDay.getTime() - (days - 1) * day);

  const users = await prisma.user.findMany({
    where: { createdAt: { gte: fromDay } },
    select: { createdAt: true },
  });

  const counts = new Map<string, number>();
  for (const u of users) {
    const key = isoDay(u.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points: AdminSignupsSeries['points'] = [];
  for (let i = 0; i < days; i += 1) {
    const key = isoDay(new Date(fromDay.getTime() + i * day));
    points.push({ date: key, count: counts.get(key) ?? 0 });
  }

  return { from: isoDay(fromDay), to: isoDay(toDay), points };
}

export async function getRevenueSeries(
  months: number,
  now = new Date(),
): Promise<AdminRevenueSeries> {
  // Only Stripe rows feed MRR. Use dates alone (not current status) so a sub that
  // has since lapsed still contributes to the months it was actually live.
  const subs = await prisma.subscription.findMany({
    where: { source: 'STRIPE' },
    select: { tier: true, startDate: true, endDate: true },
  });

  const points: AdminRevenueSeries['points'] = [];
  const thisMonthStart = startOfUtcMonth(now);

  for (let i = months - 1; i >= 0; i -= 1) {
    const monthStart = new Date(
      Date.UTC(thisMonthStart.getUTCFullYear(), thisMonthStart.getUTCMonth() - i, 1),
    );
    const nextMonthStart = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
    );
    // Measure at the last instant of the month, or now for the current month.
    const at = new Date(Math.min(nextMonthStart.getTime() - 1, now.getTime()));

    let mrrMinor = 0;
    for (const s of subs) {
      if (s.startDate <= at && (s.endDate === null || s.endDate > at)) {
        mrrMinor += tierPriceMinor(s.tier);
      }
    }
    points.push({ month: isoMonth(monthStart), mrrMinor });
  }

  return { currency: PLAN_CATALOG.BASIC.currency, reconstructed: true, points };
}
