/**
 * Manual (cash) grant check (backlog Epic 6.3). Drives the real
 * `manual-grant-service` + the `requireAdmin` middleware against throwaway users:
 *
 *  - issue a grant → entitlements say the granted tier, source "manual", with an
 *    end date; `users.tier` cache flips
 *  - a future-dated grant does not grant yet
 *  - overlapping grants + a Stripe row → highest tier wins, all rows preserved (6.3.5)
 *  - extend / shorten / revoke (6.3.4); shortening into the past expires it,
 *    extending back into the future revives it
 *  - `sweepExpiredGrants` flips lapsed MANUAL rows and leaves STRIPE rows alone (6.3.3)
 *  - `requireAdmin` 403s a non-admin, passes an admin
 *  - unknown email → 404; a Stripe row is not a "manual grant" → 404
 *
 *   npm run grants:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';

import { requireAdmin } from '../src/middleware/require-admin.js';
import { resolveEntitlements } from '../src/lib/entitlements.js';
import {
  createManualGrant,
  listTenantGrants,
  revokeManualGrant,
  sweepExpiredGrants,
  updateManualGrant,
} from '../src/services/manual-grant-service.js';

const prisma = new PrismaClient();
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}
async function status(fn: () => Promise<unknown>): Promise<number | 'ok'> {
  try {
    await fn();
    return 'ok';
  } catch (err) {
    return (err as { status?: number }).status ?? -1;
  }
}
function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const stamp = Date.now();
const admin = await prisma.user.create({
  data: {
    email: `grant-check-admin+${stamp}@example.test`,
    passwordHash: 'x',
    businessName: 'Admin Co',
    role: 'ADMIN',
  },
});
const tenant = await prisma.user.create({
  data: {
    email: `grant-check-tenant+${stamp}@example.test`,
    passwordHash: 'x',
    businessName: 'Tenant Co',
  },
});

try {
  // --- issue a grant ----------------------------------------------------
  const basic = await createManualGrant(admin.id, {
    email: tenant.email,
    tier: 'BASIC',
    startDate: isoInDays(0),
    endDate: isoInDays(30),
    note: '€20 cash, 1 month',
  });
  check(
    'grant issued: BASIC, ACTIVE, attributed to the admin, ~30 days left',
    basic.tier === 'BASIC' &&
      basic.status === 'ACTIVE' &&
      basic.grantedByUserId === admin.id &&
      basic.note === '€20 cash, 1 month' &&
      basic.daysRemaining >= 29 &&
      basic.daysRemaining <= 31,
    `${basic.status}/${basic.daysRemaining}d`,
  );

  let ent = await resolveEntitlements(tenant.id);
  check(
    'entitlements: BASIC, source manual, end date set, billing not manageable',
    ent.tier === 'BASIC' &&
      ent.source === 'manual' &&
      ent.accessEndsAt !== null &&
      ent.canManageBilling === false,
    JSON.stringify({ tier: ent.tier, source: ent.source }),
  );
  const cached = await prisma.user.findUnique({ where: { id: tenant.id }, select: { tier: true } });
  check('users.tier cache flipped to BASIC', cached?.tier === 'BASIC');

  const listed = await listTenantGrants(tenant.email);
  check(
    'listTenantGrants returns the tenant + one grant',
    listed.tenant.id === tenant.id && listed.tenant.tier === 'BASIC' && listed.grants.length === 1,
  );

  // --- a future-dated grant does not grant yet -----------------------
  await createManualGrant(admin.id, {
    email: tenant.email,
    tier: 'PREMIUM',
    startDate: isoInDays(10),
    endDate: isoInDays(40),
  });
  ent = await resolveEntitlements(tenant.id);
  check('a future-dated PREMIUM grant is not active yet', ent.tier === 'BASIC');

  // --- overlap: most access wins (6.3.5) --------------------------
  const premiumNow = await createManualGrant(admin.id, {
    email: tenant.email,
    tier: 'PREMIUM',
    startDate: isoInDays(0),
    endDate: isoInDays(20),
  });
  ent = await resolveEntitlements(tenant.id);
  check('overlapping active PREMIUM grant wins over BASIC', ent.tier === 'PREMIUM' && ent.canUseAi);

  // a Stripe row alongside the manual grants
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      tier: 'BASIC',
      status: 'ACTIVE',
      source: 'STRIPE',
      stripeSubscriptionId: `sub_grantcheck_${stamp}`,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  ent = await resolveEntitlements(tenant.id);
  check(
    'manual PREMIUM still wins over a Stripe BASIC row (both preserved)',
    ent.tier === 'PREMIUM',
  );

  // --- extend (6.3.4) --------------------------------------------
  const extended = await updateManualGrant(premiumNow.id, { endDate: isoInDays(60) });
  check(
    'extend pushes the end date out',
    extended.daysRemaining >= 58 && extended.daysRemaining <= 61,
    `${extended.daysRemaining}d`,
  );

  // --- shorten into the past → expires -------------------------
  const shortened = await updateManualGrant(premiumNow.id, { endDate: isoInDays(-1) });
  ent = await resolveEntitlements(tenant.id);
  const shortenedRow = await prisma.subscription.findUnique({ where: { id: premiumNow.id } });
  check(
    'shortening into the past expires the grant; tier falls back to the Stripe BASIC',
    shortenedRow?.status === 'EXPIRED' && shortened.daysRemaining === 0 && ent.tier === 'BASIC',
    `${shortenedRow?.status}/${ent.tier}`,
  );

  // --- extend a lapsed grant back to life ---------------------
  await updateManualGrant(premiumNow.id, { endDate: isoInDays(5) });
  const revived = await prisma.subscription.findUnique({ where: { id: premiumNow.id } });
  ent = await resolveEntitlements(tenant.id);
  check(
    'extending a lapsed grant re-activates it',
    revived?.status === 'ACTIVE' && ent.tier === 'PREMIUM',
  );

  // --- revoke (6.3.4) — record kept -------------------------
  const revoked = await revokeManualGrant(premiumNow.id);
  ent = await resolveEntitlements(tenant.id);
  const revokedRow = await prisma.subscription.findUnique({ where: { id: premiumNow.id } });
  check(
    'revoke → CANCELED, ends now, row preserved, access drops',
    revoked.status === 'CANCELED' &&
      revokedRow !== null &&
      revoked.daysRemaining === 0 &&
      ent.tier === 'BASIC',
  );

  // --- sweepExpiredGrants (6.3.3) --------------------------
  const pastGrant = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      tier: 'PREMIUM',
      status: 'ACTIVE',
      source: 'MANUAL',
      startDate: new Date(Date.now() - 10 * 86_400_000),
      endDate: new Date(Date.now() - 86_400_000),
    },
  });
  const sweep = await sweepExpiredGrants();
  const sweptRow = await prisma.subscription.findUnique({ where: { id: pastGrant.id } });
  const stripeRow = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: `sub_grantcheck_${stamp}` },
  });
  check(
    'sweep expires the lapsed MANUAL row and leaves the STRIPE row untouched',
    sweep.expired >= 1 && sweptRow?.status === 'EXPIRED' && stripeRow?.status === 'ACTIVE',
    `expired ${sweep.expired}`,
  );

  // --- requireAdmin ------------------------------------------
  async function callGuard(userId: string): Promise<{ arg: unknown }> {
    return new Promise((resolve) => {
      const req = { auth: { userId } } as unknown as Request;
      const res = {} as Response;
      const next: NextFunction = (arg?: unknown) => resolve({ arg });
      void requireAdmin(req, res, next);
    });
  }
  const asAdmin = await callGuard(admin.id);
  const asTenant = await callGuard(tenant.id);
  check('requireAdmin passes an ADMIN', asAdmin.arg === undefined);
  check('requireAdmin 403s a non-admin', (asTenant.arg as { status?: number })?.status === 403);

  // --- error paths ----------------------------------------
  check(
    'unknown email → 404',
    (await status(() =>
      createManualGrant(admin.id, {
        email: 'nobody@example.test',
        tier: 'BASIC',
        startDate: isoInDays(0),
        endDate: isoInDays(1),
      }),
    )) === 404,
  );
  check(
    'update a missing grant → 404',
    (await status(() => updateManualGrant('nope', { note: 'x' }))) === 404,
  );
  check(
    'a STRIPE row is not a manual grant → 404',
    (await status(() => updateManualGrant(stripeRow!.id, { note: 'x' }))) === 404,
  );
} finally {
  await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, tenant.id] } } });
  await prisma.$disconnect();
}

console.log(failures === 0 ? '\ngrants: all checks passed.' : `\ngrants: ${failures} FAILED.`);
process.exit(failures === 0 ? 0 : 1);
