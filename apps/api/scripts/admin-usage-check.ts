/**
 * Admin cost & usage monitoring check (backlog Epic 8.4). The time-windowed
 * endpoints are driven at a far-future `now` so no real dev-DB rows fall in the
 * window and the assertions can be absolute; storage (not time-based) is checked
 * as a delta.
 *
 *  - AI: window totals + by-status + cost + tokens, a row aged out of the window
 *    is excluded, per-tenant ranking, current-month counter vs the Premium cap
 *  - email: SENT-event volume, zero-filled daily buckets, per-tenant ranking,
 *    an out-of-window event excluded
 *  - storage: logo count + summed bytes, a dangling `logoUrl` reports null bytes
 *    and adds nothing, `pdfBytes` is always 0
 *  - anomalies: last-24h vs 7-day-mean spike signal — ratio-flagged and
 *    zero-baseline-flagged branches, and the quiet (no data) case
 *
 *   npm run usage:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';

import { storage } from '../src/lib/storage/index.js';
import {
  getAiUsage,
  getEmailUsage,
  getStorageUsage,
  getUsageAnomalies,
} from '../src/services/admin-usage-service.js';

const prisma = new PrismaClient();
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}

const DAY = 86_400_000;
const stamp = Date.now();
const tag = `usage-check-${stamp}`;
const future = new Date(Date.now() + 400 * DAY);
const futureKey = `${future.getUTCFullYear()}-${String(future.getUTCMonth() + 1).padStart(2, '0')}`;

const ids: string[] = [];
let logoKey: string | null = null;

async function tenant(over: Record<string, unknown> = {}) {
  const u = await prisma.user.create({
    data: {
      email: `${tag}-${ids.length}@example.test`,
      passwordHash: 'x',
      businessName: `Biz ${ids.length}`,
      ...over,
    },
  });
  ids.push(u.id);
  return u;
}
async function aiLog(
  tenantId: string,
  createdAt: Date,
  status: 'SUCCESS' | 'INVALID_OUTPUT' | 'PROVIDER_ERROR' | 'RATE_LIMITED',
  costMicros: number,
  tokens = { input: 0, output: 0 },
) {
  return prisma.aiGenerationLog.create({
    data: {
      tenantId,
      model: 'claude-sonnet-5',
      status,
      costMicros,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      createdAt,
    },
  });
}

try {
  const t1 = await tenant();
  const t2 = await tenant();

  // --- 8.4.1 AI --------------------------------------------------------
  // In-window (future - 5d): t1 spends 300 across 3 rows (2 SUCCESS, 1 error);
  // t2 spends 100 in 1 SUCCESS row. Out-of-window (future - 40d): ignored.
  await aiLog(t1.id, new Date(future.getTime() - 5 * DAY), 'SUCCESS', 100, {
    input: 10,
    output: 20,
  });
  await aiLog(t1.id, new Date(future.getTime() - 5 * DAY), 'SUCCESS', 150, { input: 5, output: 5 });
  await aiLog(t1.id, new Date(future.getTime() - 5 * DAY), 'PROVIDER_ERROR', 50);
  await aiLog(t2.id, new Date(future.getTime() - 5 * DAY), 'SUCCESS', 100);
  await aiLog(t1.id, new Date(future.getTime() - 40 * DAY), 'SUCCESS', 9999);

  await prisma.usageCounter.create({
    data: { tenantId: t1.id, aiGenerationsInPeriod: 7, aiPeriodKey: futureKey },
  });
  await prisma.usageCounter.create({
    data: { tenantId: t2.id, aiGenerationsInPeriod: 4, aiPeriodKey: '1999-01' },
  });

  const ai = await getAiUsage({ days: 30, limit: 20 }, future);
  check(
    'AI totals: 4 in-window generations (40d-old row excluded), 3 SUCCESS',
    ai.totals.generations === 4 && ai.totals.successGenerations === 3,
    `${ai.totals.generations}/${ai.totals.successGenerations}`,
  );
  check('AI totals: cost = 400 micros', ai.totals.costMicros === 400, `${ai.totals.costMicros}`);
  check(
    'AI totals: by-status + tokens',
    ai.totals.byStatus.SUCCESS === 3 &&
      ai.totals.byStatus.PROVIDER_ERROR === 1 &&
      ai.totals.inputTokens === 15 &&
      ai.totals.outputTokens === 25,
  );
  check(
    'AI current period: only the futureKey counter counts (7, not 7+4)',
    ai.currentPeriod.periodKey === futureKey &&
      ai.currentPeriod.generationsUsed === 7 &&
      ai.currentPeriod.perTenantLimit === 50,
    `${ai.currentPeriod.generationsUsed}`,
  );
  const t1Row = ai.perTenant.find((r) => r.tenantId === t1.id);
  const t2Row = ai.perTenant.find((r) => r.tenantId === t2.id);
  check(
    'AI per-tenant: t1 ranked first (300 > 100), aggregates correct',
    ai.perTenant[0]?.tenantId === t1.id &&
      t1Row?.generations === 3 &&
      t1Row?.successGenerations === 2 &&
      t1Row?.costMicros === 300 &&
      t1Row?.currentPeriodUsed === 7,
  );
  check(
    'AI per-tenant: t2 present with a stale counter → currentPeriodUsed 0',
    t2Row?.costMicros === 100 && t2Row?.currentPeriodUsed === 0,
  );

  // --- 8.4.2 email ----------------------------------------------
  const inv = await prisma.invoice.create({
    data: { tenantId: t1.id, status: 'ISSUED', number: `${tag}-1`, issueDate: future },
  });
  const sent = async (at: Date, who = t1.id, invId = inv.id) =>
    prisma.invoiceHistoryEvent.create({
      data: { tenantId: who, invoiceId: invId, eventType: 'SENT', userId: who, timestamp: at },
    });
  const dayA = new Date(future.getTime() - 3 * DAY);
  const dayB = new Date(future.getTime() - 10 * DAY);
  await sent(dayA);
  await sent(new Date(dayA.getTime() + 3600_000));
  await sent(dayB);
  await sent(new Date(future.getTime() - 40 * DAY)); // out of a 30d window

  const email = await getEmailUsage({ days: 30, limit: 20 }, future);
  check('email: 3 sends in the 30d window (40d-old excluded)', email.totalSends === 3);
  check('email: 30 zero-filled daily buckets', email.daily.length === 30);
  const bucket = (d: Date) =>
    email.daily.find((x) => x.date === d.toISOString().slice(0, 10))?.sends;
  check('email: day A bucket = 2, day B bucket = 1', bucket(dayA) === 2 && bucket(dayB) === 1);
  check(
    'email: per-tenant has t1 with 3 sends',
    email.perTenant.find((r) => r.tenantId === t1.id)?.sends === 3,
  );

  // --- 8.4.3 storage -------------------------------------
  const s0 = await getStorageUsage({ days: 30, limit: 100 });
  const body = Buffer.from(`fake-logo-${stamp}`.repeat(4));
  const put = await storage.put({ key: `logos/${tag}.bin`, body, contentType: 'image/webp' });
  logoKey = storage.keyFromUrl(put.url);
  await prisma.user.update({ where: { id: t1.id }, data: { logoUrl: put.url } });
  await prisma.user.update({
    where: { id: t2.id },
    data: { logoUrl: `/uploads/logos/missing-${stamp}.webp` },
  });

  const s1 = await getStorageUsage({ days: 30, limit: 100 });
  check(
    'storage: logo count +2, bytes += only the real file',
    s1.logoCount - s0.logoCount === 2 && s1.logoBytes - s0.logoBytes === body.length,
    `count +${s1.logoCount - s0.logoCount}, bytes +${s1.logoBytes - s0.logoBytes}`,
  );
  check('storage: pdfBytes is always 0', s1.pdfBytes === 0);
  check(
    'storage: real logo reports its byte size',
    s1.perTenant.find((r) => r.tenantId === t1.id)?.bytes === body.length,
  );
  check(
    'storage: dangling logoUrl reports null bytes',
    s1.perTenant.find((r) => r.tenantId === t2.id)?.bytes === null,
  );

  // --- 8.4.4 anomalies ----------------------------------
  // A far-future instant with a clean window: baseline in [t-8d, t-24h], spike in
  // the last 24h.
  const tA = new Date(Date.now() + 800 * DAY);
  const t3 = await tenant();
  const invA = await prisma.invoice.create({
    data: { tenantId: t3.id, status: 'ISSUED', number: `${tag}-A`, issueDate: tA },
  });
  // AI: baseline 600 micros over the prior week, 1000 in the last 24h → ~11.7× → flagged.
  for (let i = 0; i < 3; i += 1) {
    await aiLog(t3.id, new Date(tA.getTime() - 4 * DAY), 'SUCCESS', 200);
  }
  await aiLog(t3.id, new Date(tA.getTime() - 2 * 3600_000), 'SUCCESS', 500);
  await aiLog(t3.id, new Date(tA.getTime() - 3 * 3600_000), 'SUCCESS', 500);
  // Email: no baseline, 1 send in the last 24h → zero-baseline flagged.
  await prisma.invoiceHistoryEvent.create({
    data: {
      tenantId: t3.id,
      invoiceId: invA.id,
      eventType: 'SENT',
      userId: t3.id,
      timestamp: new Date(tA.getTime() - 3600_000),
    },
  });

  const anom = await getUsageAnomalies(tA);
  check(
    'anomalies: AI cost spike is ratio-flagged',
    anom.aiCostMicros.last24h === 1000 &&
      Math.round(anom.aiCostMicros.baselineDailyAvg) === 86 &&
      anom.aiCostMicros.ratioBps !== null &&
      anom.aiCostMicros.ratioBps >= anom.thresholdBps &&
      anom.aiCostMicros.flagged === true,
    `ratio ${anom.aiCostMicros.ratioBps}`,
  );
  check(
    'anomalies: email spike against a zero baseline is flagged (null ratio)',
    anom.emailSends.last24h === 1 &&
      anom.emailSends.baselineDailyAvg === 0 &&
      anom.emailSends.ratioBps === null &&
      anom.emailSends.flagged === true,
  );

  // A quiet far-future instant — nothing in either window.
  const quiet = await getUsageAnomalies(new Date(Date.now() + 1200 * DAY));
  check(
    'anomalies: quiet window → nothing flagged',
    quiet.aiCostMicros.last24h === 0 &&
      quiet.aiCostMicros.flagged === false &&
      quiet.emailSends.flagged === false,
  );
} finally {
  if (logoKey) await storage.delete(logoKey).catch(() => undefined);
  await prisma.invoiceHistoryEvent.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.invoice.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.aiGenerationLog.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.usageCounter.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}

console.log(
  failures === 0 ? '\nadmin-usage: all checks passed.' : `\nadmin-usage: ${failures} FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
