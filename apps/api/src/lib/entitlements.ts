import type { Prisma, UserTier } from '@prisma/client';
import {
  FREE_INVOICE_LIFETIME_LIMIT,
  PREMIUM_AI_MONTHLY_LIMIT,
  higherTier,
  type Allowance,
  type Entitlements,
  type UserTierName,
} from '@invoice-saas/shared';

import { prisma } from '../db/client.js';
import { ApiError } from './api-error.js';

/**
 * The one place the app decides what an account may do (spec §9, backlog 6.1.2,
 * decision D19). Everything else calls a `require*` guard or reads
 * `resolveEntitlements` — no other file compares tiers or counts usage.
 *
 * Resolution (decision D5, "most access wins"):
 *   1. Read every `Subscription` row for the tenant.
 *   2. Lazily flip `ACTIVE` rows whose `endDate` has passed to `EXPIRED` (6.3.3).
 *   3. The effective tier is the highest among the still-active rows, or `FREE`.
 *   4. Write that tier back to `users.tier` as a denormalised cache (decision
 *      D14 — the column is kept, and this service is its only writer). Auth keeps
 *      reading the cache via `AuthUser.tier`; nothing trusts it for enforcement.
 *   5. Layer the `UsageCounter` meters on top (Free invoice limit 6.1.5, AI
 *      monthly cap D6 / Phase 7).
 *
 * The per-tier numbers live in `PLAN_RULES` below and in `@invoice-saas/shared`
 * (`billing.ts`) — config, not scattered `if (tier === …)` branches (D6).
 */

interface PlanRule {
  canManageTemplates: boolean;
  canUseAi: boolean;
  /** Lifetime invoice-generation cap; `null` = unlimited. */
  invoiceLifetimeLimit: number | null;
  /** Successful AI generations per calendar month; `null` = AI not available. */
  aiMonthlyLimit: number | null;
}

const PLAN_RULES: Record<UserTier, PlanRule> = {
  FREE: {
    canManageTemplates: false,
    canUseAi: false,
    invoiceLifetimeLimit: FREE_INVOICE_LIFETIME_LIMIT,
    aiMonthlyLimit: null,
  },
  BASIC: {
    canManageTemplates: true,
    canUseAi: false,
    invoiceLifetimeLimit: null,
    aiMonthlyLimit: null,
  },
  PREMIUM: {
    canManageTemplates: true,
    canUseAi: true,
    invoiceLifetimeLimit: null,
    aiMonthlyLimit: PREMIUM_AI_MONTHLY_LIMIT,
  },
};

// --- month bucket for the AI counter (decision D6: calendar month, UTC) -------

/** `"YYYY-MM"` in UTC — the key `UsageCounter.aiPeriodKey` is compared against. */
function currentPeriodKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** First instant of next month, UTC — when the AI allowance next resets. */
function periodResetsAt(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

// --- subscription resolution ------------------------------------------------

interface ResolvedAccess {
  tier: UserTier;
  source: Entitlements['source'];
  accessEndsAt: Date | null;
  renewsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  canManageBilling: boolean;
}

/** Stripe rows count as granting access while `PAST_DUE` too — the grace period
 *  is Stripe's own dunning schedule, which ends by cancelling the subscription
 *  (decision, Epic 6.2). Manual grants are only ever `ACTIVE`. */
const GRANTING_STATUSES: ReadonlySet<string> = new Set(['ACTIVE', 'PAST_DUE']);

/**
 * Resolves the tenant's live subscriptions to an effective tier and refreshes the
 * `users.tier` cache. Runs on every entitlement lookup, so a manual grant's
 * expiry (6.3.3) and a cache that drifted from the `Subscription` rows both heal
 * on the next gated action without a scheduled job.
 */
async function resolveAccess(userId: string, now: Date): Promise<ResolvedAccess> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true, stripeCustomerId: true },
  });
  if (!user) throw ApiError.unauthorized();

  const subs = await prisma.subscription.findMany({ where: { tenantId: userId } });

  // Lazy expiry (6.3.3): a still-granting row whose `endDate` has passed becomes
  // EXPIRED. Covers a manual grant lapsing and a Stripe sub set to cancel at
  // period end (Stripe also sends `customer.subscription.deleted`, which is fine
  // — both outcomes are "no longer granting").
  const newlyExpired = subs.filter(
    (s) => GRANTING_STATUSES.has(s.status) && s.endDate !== null && s.endDate <= now,
  );
  if (newlyExpired.length > 0) {
    await prisma.subscription.updateMany({
      where: { id: { in: newlyExpired.map((s) => s.id) } },
      data: { status: 'EXPIRED' },
    });
  }

  const active = subs.filter(
    (s) =>
      GRANTING_STATUSES.has(s.status) &&
      !newlyExpired.includes(s) &&
      s.startDate <= now &&
      (s.endDate === null || s.endDate > now),
  );

  const effectiveTier = active.reduce<UserTierName>((acc, s) => higherTier(acc, s.tier), 'FREE');

  // Among the rows that actually grant the effective tier, describe the one the
  // user's "your plan" copy should reflect: prefer open-ended access, else the
  // grant that lasts longest.
  const granting = active
    .filter((s) => s.tier === effectiveTier)
    .sort((a, b) => {
      if (a.endDate === null) return -1;
      if (b.endDate === null) return 1;
      return b.endDate.getTime() - a.endDate.getTime();
    });
  const winner = granting[0] ?? null;

  const resolved: ResolvedAccess = {
    tier: winner?.tier ?? 'FREE',
    source: winner ? (winner.source === 'STRIPE' ? 'stripe' : 'manual') : 'none',
    accessEndsAt: winner?.endDate ?? null,
    renewsAt:
      winner && winner.source === 'STRIPE' && !winner.cancelAtPeriodEnd
        ? winner.currentPeriodEnd
        : null,
    cancelAtPeriodEnd: winner?.cancelAtPeriodEnd ?? false,
    canManageBilling: user.stripeCustomerId !== null,
  };

  if (user.tier !== resolved.tier) {
    await prisma.user.update({ where: { id: userId }, data: { tier: resolved.tier } });
  }

  return resolved;
}

// --- usage meters --------------------------------------------------------

async function readUsage(userId: string, now: Date) {
  const row = await prisma.usageCounter.findUnique({ where: { tenantId: userId } });
  const periodKey = currentPeriodKey(now);
  return {
    lifetimeInvoicesGenerated: row?.lifetimeInvoicesGenerated ?? 0,
    // A counter from a previous month reads as 0 until the next increment
    // rewrites the key (see `recordAiGeneration`).
    aiGenerationsInPeriod: row && row.aiPeriodKey === periodKey ? row.aiGenerationsInPeriod : 0,
  };
}

function allowance(limit: number | null, used: number): Allowance {
  return limit === null
    ? { unlimited: true, limit: null, used, remaining: null }
    : { unlimited: false, limit, used, remaining: Math.max(0, limit - used) };
}

// --- public API --------------------------------------------------------

/** The full "what can this tenant do right now" answer (backlog 6.1.2). */
export async function resolveEntitlements(
  userId: string,
  now: Date = new Date(),
): Promise<Entitlements> {
  const access = await resolveAccess(userId, now);
  const rule = PLAN_RULES[access.tier];
  const usage = await readUsage(userId, now);

  // A tier without AI reports a spent zero allowance rather than "unlimited" — no
  // tier actually has uncapped AI, so `unlimited` here would only mislead.
  const ai = rule.canUseAi
    ? {
        ...allowance(rule.aiMonthlyLimit, usage.aiGenerationsInPeriod),
        periodResetsAt: periodResetsAt(now).toISOString(),
      }
    : { unlimited: false, limit: 0, used: 0, remaining: 0, periodResetsAt: null };

  return {
    tier: access.tier,
    source: access.source,
    accessEndsAt: access.accessEndsAt?.toISOString() ?? null,
    renewsAt: access.renewsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: access.cancelAtPeriodEnd,
    canManageBilling: access.canManageBilling,
    canManageTemplates: rule.canManageTemplates,
    canUseAi: rule.canUseAi,
    invoices: allowance(rule.invoiceLifetimeLimit, usage.lifetimeInvoicesGenerated),
    ai,
  };
}

/** Pure tier → capability check, kept for callers that already hold the tier. */
export function canManageTemplates(tier: UserTier): boolean {
  return PLAN_RULES[tier].canManageTemplates;
}

/** 403 + upgrade message if the account can't create/customise templates (3.3.6). */
export async function requireCanManageTemplates(userId: string): Promise<void> {
  const { canManageTemplates: ok } = await resolveEntitlements(userId);
  if (!ok) {
    throw ApiError.forbidden(
      'Creating and editing templates is on the Basic and Premium plans. Upgrade to design your own.',
    );
  }
}

/** 403 + upgrade message when the invoice allowance is spent (6.1.5). Gates every
 *  invoice-creating endpoint — draft create, finalize and duplicate. */
export async function requireCanCreateInvoice(userId: string): Promise<void> {
  const { invoices } = await resolveEntitlements(userId);
  if (!invoices.unlimited && (invoices.remaining ?? 0) <= 0) {
    throw ApiError.forbidden(
      'You’ve used the free invoice for this account. Upgrade to Basic or Premium for unlimited invoices.',
    );
  }
}

/** 403 when AI drafting isn't available or this month's cap is spent (Phase 7 seam). */
export async function requireCanUseAi(userId: string): Promise<void> {
  const { canUseAi, ai } = await resolveEntitlements(userId);
  if (!canUseAi) {
    throw ApiError.forbidden(
      'AI drafting is a Premium feature. Upgrade to Premium to generate invoices from a sentence.',
    );
  }
  if (!ai.unlimited && (ai.remaining ?? 0) <= 0) {
    throw ApiError.forbidden(
      'You’ve reached this month’s AI drafting limit. It resets at the start of next month.',
    );
  }
}

// --- meter writers -----------------------------------------------------

/**
 * Bumps the lifetime invoice-generation counter. Called from inside
 * `finalizeInvoice`'s transaction (on the unscoped client, with an explicit
 * `tenantId`) so the count and the allocated number commit together — a
 * soft-deleted invoice never gives a Free account its lifetime slot back (6.1.5).
 */
export async function recordInvoiceGenerated(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.usageCounter.upsert({
    where: { tenantId },
    create: { tenantId, lifetimeInvoicesGenerated: 1 },
    update: { lifetimeInvoicesGenerated: { increment: 1 } },
  });
}

/**
 * Increments this month's AI generation counter, rolling the period bucket over
 * when the month has changed (decision D6). Phase 7 calls this only on a
 * successful, schema-valid generation (7.1.6).
 */
export async function recordAiGeneration(userId: string, now: Date = new Date()): Promise<void> {
  const periodKey = currentPeriodKey(now);
  const existing = await prisma.usageCounter.findUnique({ where: { tenantId: userId } });
  if (!existing || existing.aiPeriodKey !== periodKey) {
    await prisma.usageCounter.upsert({
      where: { tenantId: userId },
      create: { tenantId: userId, aiGenerationsInPeriod: 1, aiPeriodKey: periodKey },
      update: { aiGenerationsInPeriod: 1, aiPeriodKey: periodKey },
    });
    return;
  }
  await prisma.usageCounter.update({
    where: { tenantId: userId },
    data: { aiGenerationsInPeriod: { increment: 1 } },
  });
}
