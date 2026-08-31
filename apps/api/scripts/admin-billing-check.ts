/**
 * Admin billing-view check (backlog Epic 8.5). Drives `admin-billing-service`
 * against throwaway subscriptions. Time-sensitive reads use a far-future `now`
 * so real dev-DB rows fall outside the windows; summary counts are asserted as
 * deltas over a pre-fixture snapshot.
 *
 *  - subscriptions list: Stripe + manual, each `source`-labelled; `sort=expiry`
 *    orders by `endDate ?? currentPeriodEnd`; computed `effectiveEnd` /
 *    `daysUntilEnd` (negative once lapsed, null for an open-ended sub)
 *  - summary: byStatus / bySource / cancelingAtPeriodEnd move by the fixtures
 *  - attention: `failedPayments` = PAST_DUE Stripe; `upcomingRenewals` = active,
 *    not cancelling, renewing inside the window; the window bound is respected
 *
 *   npm run billing:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';

import {
  getBillingAttention,
  listBillingSubscriptions,
} from '../src/services/admin-billing-service.js';

const prisma = new PrismaClient();
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}

const DAY = 86_400_000;
const stamp = Date.now();
const tag = `billing-check-${stamp}`;
const fnow = new Date(Date.now() + 500 * DAY);

const ids: string[] = [];
async function sub(data: {
  source: 'STRIPE' | 'MANUAL';
  tier: 'BASIC' | 'PREMIUM';
  status: 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELED';
  currentPeriodEnd?: Date | null;
  endDate?: Date | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const u = await prisma.user.create({
    data: {
      email: `${tag}-${ids.length}@example.test`,
      passwordHash: 'x',
      businessName: `Biz ${ids.length}`,
    },
  });
  ids.push(u.id);
  const s = await prisma.subscription.create({
    data: {
      tenantId: u.id,
      source: data.source,
      tier: data.tier,
      status: data.status,
      startDate: new Date(fnow.getTime() - 30 * DAY),
      endDate: data.endDate ?? null,
      currentPeriodEnd: data.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
      ...(data.source === 'STRIPE'
        ? {
            stripeSubscriptionId: `sub_${tag}_${ids.length}`,
            stripePriceId: `price_${tag}`,
          }
        : {}),
    },
  });
  return { user: u, sub: s };
}

try {
  const before = await listBillingSubscriptions(
    { source: 'all', sort: 'newest', page: 1, pageSize: 100 },
    fnow,
  );
  const attnBefore = await getBillingAttention({ renewalWindowDays: 30 }, fnow);

  const a = await sub({
    source: 'STRIPE',
    tier: 'PREMIUM',
    status: 'ACTIVE',
    currentPeriodEnd: new Date(fnow.getTime() + 10 * DAY),
  });
  const b = await sub({
    source: 'STRIPE',
    tier: 'BASIC',
    status: 'PAST_DUE',
    currentPeriodEnd: new Date(fnow.getTime() + 3 * DAY),
  });
  const c = await sub({
    source: 'STRIPE',
    tier: 'BASIC',
    status: 'ACTIVE',
    cancelAtPeriodEnd: true,
    currentPeriodEnd: new Date(fnow.getTime() + 5 * DAY),
    endDate: new Date(fnow.getTime() + 5 * DAY),
  });
  const d = await sub({
    source: 'MANUAL',
    tier: 'BASIC',
    status: 'ACTIVE',
    endDate: new Date(fnow.getTime() + 2 * DAY),
  });
  const e = await sub({
    source: 'MANUAL',
    tier: 'PREMIUM',
    status: 'EXPIRED',
    endDate: new Date(fnow.getTime() - 5 * DAY),
  });
  const f = await sub({
    source: 'STRIPE',
    tier: 'PREMIUM',
    status: 'ACTIVE',
    currentPeriodEnd: new Date(fnow.getTime() + 100 * DAY),
  });

  // --- list: source filter + labels + computed fields ---------------
  const stripeList = await listBillingSubscriptions(
    { source: 'stripe', sort: 'newest', page: 1, pageSize: 100 },
    fnow,
  );
  const mine = new Map(
    stripeList.items.filter((r) => ids.includes(r.tenantId)).map((r) => [r.id, r]),
  );
  check(
    'list source=stripe returns my 4 Stripe fixtures, all labelled STRIPE',
    mine.size === 4 && [...mine.values()].every((r) => r.source === 'STRIPE'),
    `${mine.size}`,
  );
  const aRow = mine.get(a.sub.id);
  check(
    'list: open-ended Stripe row → effectiveEnd = currentPeriodEnd, daysUntilEnd ≈ 10',
    aRow?.endDate === null &&
      aRow?.effectiveEnd === a.sub.currentPeriodEnd?.toISOString() &&
      aRow?.daysUntilEnd === 10,
    `${aRow?.daysUntilEnd}`,
  );

  const manualExpiry = await listBillingSubscriptions(
    { source: 'manual', sort: 'expiry', page: 1, pageSize: 100 },
    fnow,
  );
  const idxE = manualExpiry.items.findIndex((r) => r.id === e.sub.id);
  const idxD = manualExpiry.items.findIndex((r) => r.id === d.sub.id);
  check(
    'list source=manual sort=expiry: the lapsed grant (end -5d) sorts before the live one (end +2d)',
    idxE >= 0 && idxD >= 0 && idxE < idxD,
    `E@${idxE} D@${idxD}`,
  );
  const eRow = manualExpiry.items[idxE];
  const dRow = manualExpiry.items[idxD];
  check(
    'list: manual rows carry note/grant fields + signed daysUntilEnd',
    eRow?.source === 'MANUAL' &&
      eRow?.daysUntilEnd === -5 &&
      dRow?.daysUntilEnd === 2 &&
      dRow?.effectiveEnd === d.sub.endDate?.toISOString(),
    `${eRow?.daysUntilEnd}/${dRow?.daysUntilEnd}`,
  );
  check(
    'list: totalPages is consistent with total / pageSize',
    manualExpiry.totalPages === Math.max(1, Math.ceil(manualExpiry.total / manualExpiry.pageSize)),
  );

  // --- summary deltas --------------------------------------------
  const after = await listBillingSubscriptions(
    { source: 'all', sort: 'newest', page: 1, pageSize: 100 },
    fnow,
  );
  const dS = (k: 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELED') =>
    after.summary.byStatus[k] - before.summary.byStatus[k];
  check(
    'summary byStatus deltas: ACTIVE +4 (A,C,D,F), PAST_DUE +1 (B), EXPIRED +1 (E)',
    dS('ACTIVE') === 4 && dS('PAST_DUE') === 1 && dS('EXPIRED') === 1 && dS('CANCELED') === 0,
    `A${dS('ACTIVE')} P${dS('PAST_DUE')} E${dS('EXPIRED')}`,
  );
  check(
    'summary bySource deltas: stripe +4, manual +2',
    after.summary.bySource.stripe - before.summary.bySource.stripe === 4 &&
      after.summary.bySource.manual - before.summary.bySource.manual === 2,
  );
  check(
    'summary cancelingAtPeriodEnd delta: +1 (fixture C)',
    after.summary.cancelingAtPeriodEnd - before.summary.cancelingAtPeriodEnd === 1,
  );

  // --- attention ------------------------------------------
  const attn = await getBillingAttention({ renewalWindowDays: 30 }, fnow);
  check('attention echoes the renewal window', attn.renewalWindowDays === 30);
  check(
    'attention.failedPayments +1 and includes the PAST_DUE fixture',
    attn.failedPayments.length - attnBefore.failedPayments.length === 1 &&
      attn.failedPayments.some((r) => r.id === b.sub.id),
  );
  const renewalIds = new Set(attn.upcomingRenewals.map((r) => r.id));
  check(
    'attention.upcomingRenewals includes the active in-window sub (A)',
    renewalIds.has(a.sub.id),
  );
  check(
    'attention.upcomingRenewals excludes cancelling (C), past-due (B), manual (D) and far-off (F)',
    !renewalIds.has(c.sub.id) &&
      !renewalIds.has(b.sub.id) &&
      !renewalIds.has(d.sub.id) &&
      !renewalIds.has(f.sub.id),
  );
  const wide = await getBillingAttention({ renewalWindowDays: 120 }, fnow);
  check(
    'attention: widening the window to 120d pulls in the +100d renewal (F)',
    wide.upcomingRenewals.some((r) => r.id === f.sub.id),
  );
} finally {
  await prisma.subscription.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}

console.log(
  failures === 0 ? '\nadmin-billing: all checks passed.' : `\nadmin-billing: ${failures} FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
