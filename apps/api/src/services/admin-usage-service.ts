import {
  type AdminAiUsage,
  type AdminEmailUsage,
  type AdminStorageUsage,
  type AdminUsageAnomalies,
  AI_GENERATION_STATUSES,
  type AdminUsageQuery,
  PREMIUM_AI_MONTHLY_LIMIT,
  USAGE_SPIKE_RATIO_BPS,
} from '@invoice-saas/shared';

import { prisma } from '../db/client.js';
import { storage } from '../lib/storage/index.js';

/**
 * Admin cost & usage monitoring (backlog Epic 8.4, spec §12). Read-only,
 * unscoped, computed live — same shape as the rest of the admin surface. All
 * money stays in integer USD micros (decision D17); the web divides for display.
 */

const DAY_MS = 86_400_000;

/** Current `YYYY-MM` UTC — matches `UsageCounter.aiPeriodKey`. */
function currentPeriodKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Attach current email addresses to a set of tenant ids. */
async function emailsFor(ids: string[]): Promise<Map<string, string>> {
  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true },
  });
  return new Map(rows.map((r) => [r.id, r.email]));
}

// --- 8.4.1 AI ------------------------------------------------------------

export async function getAiUsage(
  { days, limit }: AdminUsageQuery,
  now = new Date(),
): Promise<AdminAiUsage> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const periodKey = currentPeriodKey(now);

  const [logs, currentCounters] = await Promise.all([
    prisma.aiGenerationLog.findMany({
      where: { createdAt: { gte: since } },
      select: {
        tenantId: true,
        status: true,
        costMicros: true,
        inputTokens: true,
        outputTokens: true,
      },
    }),
    prisma.usageCounter.findMany({
      where: { aiPeriodKey: periodKey },
      select: { tenantId: true, aiGenerationsInPeriod: true },
    }),
  ]);

  const byStatus = Object.fromEntries(
    AI_GENERATION_STATUSES.map((s) => [s, 0]),
  ) as AdminAiUsage['totals']['byStatus'];
  const totals = {
    generations: 0,
    successGenerations: 0,
    byStatus,
    costMicros: 0,
    inputTokens: 0,
    outputTokens: 0,
  };

  interface TenantAgg {
    generations: number;
    successGenerations: number;
    costMicros: number;
  }
  const perTenant = new Map<string, TenantAgg>();

  for (const l of logs) {
    totals.generations += 1;
    totals.byStatus[l.status] += 1;
    totals.costMicros += l.costMicros;
    totals.inputTokens += l.inputTokens;
    totals.outputTokens += l.outputTokens;
    const isSuccess = l.status === 'SUCCESS';
    if (isSuccess) totals.successGenerations += 1;

    const agg = perTenant.get(l.tenantId) ?? {
      generations: 0,
      successGenerations: 0,
      costMicros: 0,
    };
    agg.generations += 1;
    if (isSuccess) agg.successGenerations += 1;
    agg.costMicros += l.costMicros;
    perTenant.set(l.tenantId, agg);
  }

  const currentUsedByTenant = new Map(
    currentCounters.map((c) => [c.tenantId, c.aiGenerationsInPeriod]),
  );

  const ranked = [...perTenant.entries()]
    .sort((a, b) => b[1].costMicros - a[1].costMicros || b[1].generations - a[1].generations)
    .slice(0, limit);
  const emails = await emailsFor(ranked.map(([id]) => id));

  return {
    windowDays: days,
    totals,
    currentPeriod: {
      periodKey,
      generationsUsed: currentCounters.reduce((s, c) => s + c.aiGenerationsInPeriod, 0),
      perTenantLimit: PREMIUM_AI_MONTHLY_LIMIT,
    },
    perTenant: ranked.map(([tenantId, agg]) => ({
      tenantId,
      email: emails.get(tenantId) ?? '(deleted)',
      generations: agg.generations,
      successGenerations: agg.successGenerations,
      costMicros: agg.costMicros,
      currentPeriodUsed: currentUsedByTenant.get(tenantId) ?? 0,
      periodLimit: PREMIUM_AI_MONTHLY_LIMIT,
    })),
  };
}

// --- 8.4.2 email ---------------------------------------------------

export async function getEmailUsage(
  { days, limit }: AdminUsageQuery,
  now = new Date(),
): Promise<AdminEmailUsage> {
  const toDay = startOfUtcDay(now);
  const fromDay = new Date(toDay.getTime() - (days - 1) * DAY_MS);

  const events = await prisma.invoiceHistoryEvent.findMany({
    where: { eventType: 'SENT', timestamp: { gte: fromDay } },
    select: { tenantId: true, timestamp: true },
  });

  const dailyCounts = new Map<string, number>();
  const perTenant = new Map<string, number>();
  for (const e of events) {
    const key = isoDay(e.timestamp);
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
    perTenant.set(e.tenantId, (perTenant.get(e.tenantId) ?? 0) + 1);
  }

  const daily: AdminEmailUsage['daily'] = [];
  for (let i = 0; i < days; i += 1) {
    const key = isoDay(new Date(fromDay.getTime() + i * DAY_MS));
    daily.push({ date: key, sends: dailyCounts.get(key) ?? 0 });
  }

  const ranked = [...perTenant.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const emails = await emailsFor(ranked.map(([id]) => id));

  return {
    windowDays: days,
    totalSends: events.length,
    daily,
    perTenant: ranked.map(([tenantId, sends]) => ({
      tenantId,
      email: emails.get(tenantId) ?? '(deleted)',
      sends,
    })),
  };
}

// --- 8.4.3 storage ---------------------------------------------

export async function getStorageUsage({ limit }: AdminUsageQuery): Promise<AdminStorageUsage> {
  const withLogo = await prisma.user.findMany({
    where: { logoUrl: { not: null } },
    select: { id: true, email: true, logoUrl: true },
  });

  const sized = await Promise.all(
    withLogo.map(async (u) => {
      const key = u.logoUrl ? storage.keyFromUrl(u.logoUrl) : null;
      const bytes = key ? await storage.sizeOf(key) : null;
      return { tenantId: u.id, email: u.email, bytes };
    }),
  );

  const logoBytes = sized.reduce((s, r) => s + (r.bytes ?? 0), 0);
  const perTenant = [...sized].sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0)).slice(0, limit);

  return { logoCount: withLogo.length, logoBytes, pdfBytes: 0, perTenant };
}

// --- 8.4.4 anomalies -----------------------------------------

/** last-24h volume vs the mean daily volume of the preceding 7 days. */
function signal(last24h: number, prior7dTotal: number) {
  const baselineDailyAvg = prior7dTotal / 7;
  const ratioBps = baselineDailyAvg > 0 ? Math.round((last24h / baselineDailyAvg) * 10_000) : null;
  const flagged = ratioBps === null ? last24h > 0 : ratioBps >= USAGE_SPIKE_RATIO_BPS;
  return { last24h, baselineDailyAvg, ratioBps, flagged };
}

export async function getUsageAnomalies(now = new Date()): Promise<AdminUsageAnomalies> {
  const h24 = new Date(now.getTime() - DAY_MS);
  const d8 = new Date(now.getTime() - 8 * DAY_MS);

  const [recentAi, priorAi, recentSends, priorSends] = await Promise.all([
    prisma.aiGenerationLog.aggregate({
      where: { createdAt: { gte: h24 } },
      _sum: { costMicros: true },
    }),
    prisma.aiGenerationLog.aggregate({
      where: { createdAt: { gte: d8, lt: h24 } },
      _sum: { costMicros: true },
    }),
    prisma.invoiceHistoryEvent.count({
      where: { eventType: 'SENT', timestamp: { gte: h24 } },
    }),
    prisma.invoiceHistoryEvent.count({
      where: { eventType: 'SENT', timestamp: { gte: d8, lt: h24 } },
    }),
  ]);

  return {
    generatedAt: now.toISOString(),
    thresholdBps: USAGE_SPIKE_RATIO_BPS,
    aiCostMicros: signal(recentAi._sum.costMicros ?? 0, priorAi._sum.costMicros ?? 0),
    emailSends: signal(recentSends, priorSends),
  };
}
