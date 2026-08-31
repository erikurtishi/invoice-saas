/**
 * Admin overview check (backlog Epic 8.2). Builds a known set of tenants +
 * subscriptions on top of whatever the dev DB already holds and asserts the
 * *delta* each metric moves by:
 *
 *  - MRR counts live Stripe subs only, by tier, with a PAST_DUE "at risk" slice;
 *    manual grants and future-dated / lapsed rows are excluded
 *  - active-subscription counts include manual grants, split by tier and source,
 *    and exclude future-dated and canceled rows
 *  - signup windows (today / 7d / 30d / total) move by the rows just created
 *  - churn counts rows whose window closed this calendar month
 *  - conversion counts tenants that ever held any subscription row
 *  - the signups series is 1 bucket/day, zero-filled, newest bucket = today
 *  - the revenue series is month-end MRR, reconstructed from dates so a lapsed
 *    sub still shows in the months it was live but not in the current month
 *
 *   npm run overview:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';

import {
  getAdminOverview,
  getRevenueSeries,
  getSignupsSeries,
} from '../src/services/admin-overview-service.js';

const prisma = new PrismaClient();
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}

const DAY = 86_400_000;
const now = new Date();
const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const isoMonth = (d: Date) => d.toISOString().slice(0, 7);
const stamp = Date.now();

let n = 0;
async function makeTenant() {
  n += 1;
  return prisma.user.create({
    data: {
      email: `overview-check+${stamp}-${n}@example.test`,
      passwordHash: 'x',
      businessName: `Tenant ${n}`,
    },
  });
}

const tenantIds: string[] = [];
async function sub(
  tenantId: string,
  data: {
    tier: 'BASIC' | 'PREMIUM';
    status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
    source: 'STRIPE' | 'MANUAL';
    startDate?: Date;
    endDate?: Date | null;
  },
) {
  return prisma.subscription.create({
    data: {
      tenantId,
      tier: data.tier,
      status: data.status,
      source: data.source,
      startDate: data.startDate ?? now,
      endDate: data.endDate ?? null,
      ...(data.source === 'STRIPE'
        ? { stripeSubscriptionId: `sub_overview_${stamp}_${tenantId.slice(-6)}` }
        : {}),
    },
  });
}

try {
  const base = await getAdminOverview(now);
  const baseSignups = await getSignupsSeries(7, now);
  const baseRevenue = await getRevenueSeries(12, now);

  // t1..t8
  const t1 = await makeTenant(); // Stripe ACTIVE BASIC, open-ended
  const t2 = await makeTenant(); // Stripe ACTIVE PREMIUM, open-ended
  const t3 = await makeTenant(); // Stripe PAST_DUE PREMIUM (at risk)
  const t4 = await makeTenant(); // MANUAL ACTIVE BASIC, live window
  const t5 = await makeTenant(); // MANUAL ACTIVE PREMIUM, starts in the future
  const t6 = await makeTenant(); // Stripe CANCELED PREMIUM, ended this month → churn
  const t7 = await makeTenant(); // no subscription at all
  const t8 = await makeTenant(); // Stripe BASIC, live 5→2 months ago (lapsed)
  tenantIds.push(t1.id, t2.id, t3.id, t4.id, t5.id, t6.id, t7.id, t8.id);

  await sub(t1.id, { tier: 'BASIC', status: 'ACTIVE', source: 'STRIPE' });
  await sub(t2.id, { tier: 'PREMIUM', status: 'ACTIVE', source: 'STRIPE' });
  await sub(t3.id, { tier: 'PREMIUM', status: 'PAST_DUE', source: 'STRIPE' });
  await sub(t4.id, {
    tier: 'BASIC',
    status: 'ACTIVE',
    source: 'MANUAL',
    startDate: new Date(now.getTime() - 10 * DAY),
    endDate: new Date(now.getTime() + 20 * DAY),
  });
  await sub(t5.id, {
    tier: 'PREMIUM',
    status: 'ACTIVE',
    source: 'MANUAL',
    startDate: new Date(now.getTime() + 5 * DAY),
    endDate: new Date(now.getTime() + 35 * DAY),
  });
  await sub(t6.id, {
    tier: 'PREMIUM',
    status: 'CANCELED',
    source: 'STRIPE',
    startDate: new Date(now.getTime() - 40 * DAY),
    // guaranteed inside [monthStart, now] regardless of where in the month we are
    endDate: new Date(Math.max(monthStart.getTime() + 1000, now.getTime() - 2 * DAY)),
  });
  await sub(t8.id, {
    tier: 'BASIC',
    status: 'EXPIRED',
    source: 'STRIPE',
    startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 15)),
    endDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 15)),
  });

  const o = await getAdminOverview(now);

  // --- MRR ------------------------------------------------------------
  check(
    'MRR total +€70.00 (BASIC 1000 + PREMIUM 3000 + PAST_DUE PREMIUM 3000)',
    o.mrr.totalMinor - base.mrr.totalMinor === 7000,
    `${o.mrr.totalMinor - base.mrr.totalMinor}`,
  );
  check(
    'MRR by tier: BASIC +1000, PREMIUM +6000',
    o.mrr.byTier.BASIC - base.mrr.byTier.BASIC === 1000 &&
      o.mrr.byTier.PREMIUM - base.mrr.byTier.PREMIUM === 6000,
  );
  check('MRR at-risk +3000 (the PAST_DUE sub)', o.mrr.atRiskMinor - base.mrr.atRiskMinor === 3000);
  check('MRR currency is EUR', o.mrr.currency === 'EUR');

  // --- active subscriptions ----------------------------------------
  check(
    'active subs +4 (2 Stripe ACTIVE, 1 Stripe PAST_DUE, 1 live MANUAL)',
    o.activeSubscriptions.total - base.activeSubscriptions.total === 4,
    `${o.activeSubscriptions.total - base.activeSubscriptions.total}`,
  );
  check(
    'active by tier: BASIC +2, PREMIUM +2',
    o.activeSubscriptions.byTier.BASIC - base.activeSubscriptions.byTier.BASIC === 2 &&
      o.activeSubscriptions.byTier.PREMIUM - base.activeSubscriptions.byTier.PREMIUM === 2,
  );
  check(
    'active by source: stripe +3, manual +1',
    o.activeSubscriptions.bySource.stripe - base.activeSubscriptions.bySource.stripe === 3 &&
      o.activeSubscriptions.bySource.manual - base.activeSubscriptions.bySource.manual === 1,
  );

  // --- signups ---------------------------------------------------
  check(
    'signups today / 7d / 30d / total all +8',
    o.signups.today - base.signups.today === 8 &&
      o.signups.last7Days - base.signups.last7Days === 8 &&
      o.signups.last30Days - base.signups.last30Days === 8 &&
      o.signups.total - base.signups.total === 8,
    `today ${o.signups.today - base.signups.today}`,
  );

  // --- churn ---------------------------------------------------
  check(
    'churn this month +1 (the sub whose window closed this month)',
    o.churn.thisMonth - base.churn.thisMonth === 1,
    `${o.churn.thisMonth - base.churn.thisMonth}`,
  );
  check(
    'churn rate is basis points in [0, 10000]',
    o.churn.rateBps >= 0 && o.churn.rateBps <= 10_000,
  );

  // --- conversion -------------------------------------------
  check(
    'conversion: paidTenants +7 (all but the no-sub tenant), totalTenants +8',
    o.conversion.paidTenants - base.conversion.paidTenants === 7 &&
      o.conversion.totalTenants - base.conversion.totalTenants === 8,
    `paid ${o.conversion.paidTenants - base.conversion.paidTenants}`,
  );
  check(
    'conversion rate ≈ paidTenants / totalTenants in bps',
    o.conversion.rateBps ===
      Math.round((o.conversion.paidTenants * 10_000) / o.conversion.totalTenants),
  );

  // --- signups series ------------------------------------
  const s = await getSignupsSeries(7, now);
  check('signups series has 7 daily buckets', s.points.length === 7);
  check('signups series newest bucket is today', s.points.at(-1)?.date === isoDay(now));
  check(
    'signups series buckets are contiguous and zero-filled',
    s.points.every((p, i) => {
      if (typeof p.count !== 'number') return false;
      if (i === 0) return true;
      const prev = new Date(`${s.points[i - 1]!.date}T00:00:00Z`).getTime();
      return new Date(`${p.date}T00:00:00Z`).getTime() - prev === DAY;
    }),
  );
  check(
    "today's bucket rose by 8",
    (s.points.at(-1)?.count ?? 0) - (baseSignups.points.at(-1)?.count ?? 0) === 8,
  );

  // --- revenue series -----------------------------------
  const r = await getRevenueSeries(12, now);
  check('revenue series has 12 monthly buckets, oldest first', r.points.length === 12);
  check('revenue series newest bucket is this month', r.points.at(-1)?.month === isoMonth(now));
  check('revenue series is flagged reconstructed', r.reconstructed === true);
  const curDelta = (r.points.at(-1)?.mrrMinor ?? 0) - (baseRevenue.points.at(-1)?.mrrMinor ?? 0);
  check('current month MRR rose by 7000 (live Stripe subs only)', curDelta === 7000, `${curDelta}`);
  // t8 was live 5→2 months ago: its 1000 should land in the month-4 bucket.
  const idx4 = r.points.findIndex(
    (p) => p.month === isoMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, 1))),
  );
  const monthMinus4Delta =
    (r.points[idx4]?.mrrMinor ?? 0) - (baseRevenue.points[idx4]?.mrrMinor ?? 0);
  check(
    'a month-4 bucket rose by 1000 (the lapsed sub, reconstructed from its dates)',
    monthMinus4Delta === 1000,
    `${monthMinus4Delta}`,
  );
} finally {
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
}

console.log(
  failures === 0 ? '\nadmin-overview: all checks passed.' : `\nadmin-overview: ${failures} FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
