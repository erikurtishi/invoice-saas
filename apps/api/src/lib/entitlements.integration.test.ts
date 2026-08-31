import type { User } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../db/client.js';
import {
  recordAiGeneration,
  requireCanCreateInvoice,
  requireCanManageTemplates,
  requireCanUseAi,
  resolveEntitlements,
} from './entitlements.js';

/**
 * Entitlement matrix (backlog X.5.2) — each tier can / can't do the right things.
 *
 * Hits the local Postgres in `apps/api/.env` (decision D2), like the
 * `*-check.ts` scripts. The deeper lifecycle (finalize spends the free slot, soft
 * delete doesn't refund, grants expire lazily, AI counter rolls over) stays in
 * `scripts/entitlements-check.ts`; this pins the capability grid.
 */

const RUN = `ent-matrix-${Date.now()}`;
const tenants: Record<'free' | 'basic' | 'premium', User> = {} as never;

/** Did the guard throw a 403? */
async function forbids(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    return (err as { status?: number }).status === 403;
  }
}

beforeAll(async () => {
  for (const key of ['free', 'basic', 'premium'] as const) {
    tenants[key] = await prisma.user.create({
      data: { email: `${RUN}-${key}@example.test`, passwordHash: 'x', businessName: `${key} co` },
    });
  }
  const future = new Date(Date.now() + 90 * 864e5);
  await prisma.subscription.create({
    data: {
      tenantId: tenants.basic.id,
      tier: 'BASIC',
      source: 'MANUAL',
      status: 'ACTIVE',
      endDate: future,
    },
  });
  await prisma.subscription.create({
    data: {
      tenantId: tenants.premium.id,
      tier: 'PREMIUM',
      source: 'MANUAL',
      status: 'ACTIVE',
      endDate: future,
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: Object.values(tenants).map((t) => t.id) } },
  });
  await prisma.$disconnect();
});

describe('FREE tier', () => {
  it('resolves to FREE with a single lifetime invoice and no AI', async () => {
    const e = await resolveEntitlements(tenants.free.id);
    expect(e.tier).toBe('FREE');
    expect(e.invoices).toMatchObject({ unlimited: false, limit: 1, used: 0, remaining: 1 });
    expect(e.canUseAi).toBe(false);
    expect(e.canManageTemplates).toBe(false);
  });

  it('may create its first invoice but not manage templates or use AI', async () => {
    expect(await forbids(() => requireCanCreateInvoice(tenants.free.id))).toBe(false);
    expect(await forbids(() => requireCanManageTemplates(tenants.free.id))).toBe(true);
    expect(await forbids(() => requireCanUseAi(tenants.free.id))).toBe(true);
  });
});

describe('BASIC tier', () => {
  it('has unlimited invoices and template management, still no AI', async () => {
    const e = await resolveEntitlements(tenants.basic.id);
    expect(e.tier).toBe('BASIC');
    expect(e.invoices).toMatchObject({ unlimited: true, remaining: null });
    expect(e.canManageTemplates).toBe(true);
    expect(e.canUseAi).toBe(false);

    expect(await forbids(() => requireCanCreateInvoice(tenants.basic.id))).toBe(false);
    expect(await forbids(() => requireCanManageTemplates(tenants.basic.id))).toBe(false);
    expect(await forbids(() => requireCanUseAi(tenants.basic.id))).toBe(true);
  });

  it('writes the users.tier cache (D14)', async () => {
    await resolveEntitlements(tenants.basic.id);
    const row = await prisma.user.findUnique({
      where: { id: tenants.basic.id },
      select: { tier: true },
    });
    expect(row?.tier).toBe('BASIC');
  });
});

describe('PREMIUM tier', () => {
  it('unlocks AI with a metered monthly allowance', async () => {
    const e = await resolveEntitlements(tenants.premium.id);
    expect(e.tier).toBe('PREMIUM');
    expect(e.canUseAi).toBe(true);
    expect(e.ai).toMatchObject({ unlimited: false, limit: 50 });

    expect(await forbids(() => requireCanCreateInvoice(tenants.premium.id))).toBe(false);
    expect(await forbids(() => requireCanManageTemplates(tenants.premium.id))).toBe(false);
    expect(await forbids(() => requireCanUseAi(tenants.premium.id))).toBe(false);
  });

  it('meters AI generations against the monthly limit', async () => {
    await recordAiGeneration(tenants.premium.id);
    const e = await resolveEntitlements(tenants.premium.id);
    expect(e.ai.used).toBe(1);
    expect(e.ai.remaining).toBe(49);
  });
});
