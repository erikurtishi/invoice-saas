/**
 * Admin tenant-management check (backlog Epic 8.3). Exercises the real
 * `admin-tenant-service` + the disable enforcement in `middleware/tenant.ts` and
 * `auth-service.login` against throwaway tenants:
 *
 *  - list: derived tier/source per tenant, invoice count, last-active proxy,
 *    `q` search, `tier` / `source` / `status` filters, pagination
 *  - detail: usage summary counts, subscription history (newest first), recent
 *    activity, live entitlements
 *  - disable → `disabledAt` set, refresh tokens revoked, `account.disable`
 *    audit row; `requireTenant` 403s and `login` 403s; enable reverses it and
 *    logs `account.enable`; both are idempotent
 *  - guards: cannot disable / delete an ADMIN or your own account (400)
 *  - delete → every child row gone, `deletedCounts` accurate, user gone, and the
 *    `tenant.delete` audit row survives with an email snapshot
 *
 *   npm run tenants:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';

import { hashPassword } from '../src/lib/password.js';
import { requireTenant } from '../src/middleware/tenant.js';
import { login } from '../src/services/auth-service.js';
import {
  deleteTenant,
  disableTenant,
  enableTenant,
  getTenantDetail,
  listTenants,
} from '../src/services/admin-tenant-service.js';

const prisma = new PrismaClient();
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}
async function statusOf(fn: () => Promise<unknown>): Promise<number | 'ok'> {
  try {
    await fn();
    return 'ok';
  } catch (err) {
    return (err as { status?: number }).status ?? -1;
  }
}

const DAY = 86_400_000;
const now = new Date();
const stamp = Date.now();
const tag = `tenants-check-${stamp}`;

let seq = 0;
async function makeTenant(over: Record<string, unknown> = {}) {
  seq += 1;
  return prisma.user.create({
    data: {
      email: `${tag}-${seq}@example.test`,
      passwordHash: 'x',
      businessName: `Biz ${tag} ${seq}`,
      ...over,
    },
  });
}
async function liveSub(tenantId: string, tier: 'BASIC' | 'PREMIUM', source: 'STRIPE' | 'MANUAL') {
  return prisma.subscription.create({
    data: {
      tenantId,
      tier,
      status: 'ACTIVE',
      source,
      startDate: new Date(now.getTime() - DAY),
      endDate: source === 'MANUAL' ? new Date(now.getTime() + 30 * DAY) : null,
      ...(source === 'STRIPE' ? { stripeSubscriptionId: `sub_${tag}_${tenantId.slice(-6)}` } : {}),
    },
  });
}

const ids: string[] = [];
const adminUser = await prisma.user.create({
  data: {
    email: `${tag}-admin@example.test`,
    passwordHash: 'x',
    businessName: 'Admin',
    role: 'ADMIN',
  },
});
ids.push(adminUser.id);

try {
  // --- fixtures ------------------------------------------------------
  const free = await makeTenant();
  const basicStripe = await makeTenant();
  const premiumManual = await makeTenant();
  const disabled = await makeTenant({ disabledAt: new Date(), disabledReason: 'spam' });
  ids.push(free.id, basicStripe.id, premiumManual.id, disabled.id);

  await liveSub(basicStripe.id, 'BASIC', 'STRIPE');
  await liveSub(premiumManual.id, 'PREMIUM', 'MANUAL');

  // one finalized-invoice counter + one history event for the "last active" proxy
  await prisma.usageCounter.create({
    data: { tenantId: basicStripe.id, lifetimeInvoicesGenerated: 3 },
  });
  const inv = await prisma.invoice.create({
    data: { tenantId: basicStripe.id, status: 'ISSUED', number: `${tag}-1`, issueDate: now },
  });
  const evt = await prisma.invoiceHistoryEvent.create({
    data: {
      tenantId: basicStripe.id,
      invoiceId: inv.id,
      eventType: 'CREATED',
      userId: basicStripe.id,
    },
  });

  // --- 8.3.1 list -------------------------------------------------
  const all = await listTenants({ q: tag, sort: 'oldest', page: 1, pageSize: 50 }, now);
  check('list: q matches the 4 fixture tenants + admin by tag', all.total === 5, `${all.total}`);
  const byId = new Map(all.items.map((t) => [t.id, t]));
  check(
    'list: Free tenant → FREE / none, 0 invoices, no last-active',
    byId.get(free.id)?.effectiveTier === 'FREE' &&
      byId.get(free.id)?.accessSource === 'none' &&
      byId.get(free.id)?.invoicesCreated === 0 &&
      byId.get(free.id)?.lastActiveAt === null,
  );
  check(
    'list: Stripe BASIC tenant → BASIC / stripe, 3 invoices, last-active set',
    byId.get(basicStripe.id)?.effectiveTier === 'BASIC' &&
      byId.get(basicStripe.id)?.accessSource === 'stripe' &&
      byId.get(basicStripe.id)?.invoicesCreated === 3 &&
      byId.get(basicStripe.id)?.lastActiveAt === evt.timestamp.toISOString(),
  );
  check(
    'list: Manual PREMIUM tenant → PREMIUM / manual',
    byId.get(premiumManual.id)?.effectiveTier === 'PREMIUM' &&
      byId.get(premiumManual.id)?.accessSource === 'manual',
  );
  check('list: disabled tenant carries disabledAt', byId.get(disabled.id)?.disabledAt !== null);

  const tierFiltered = await listTenants(
    { q: tag, tier: 'PREMIUM', sort: 'newest', page: 1, pageSize: 50 },
    now,
  );
  check(
    'list: tier=PREMIUM filter returns only the manual-premium tenant',
    tierFiltered.total === 1 && tierFiltered.items[0]?.id === premiumManual.id,
  );
  const sourceFiltered = await listTenants(
    { q: tag, source: 'none', sort: 'newest', page: 1, pageSize: 50 },
    now,
  );
  check(
    'list: source=none filter returns the Free + disabled + admin tenants (no live sub)',
    sourceFiltered.total === 3 && sourceFiltered.items.every((t) => t.accessSource === 'none'),
    `${sourceFiltered.total}`,
  );
  const statusFiltered = await listTenants(
    { q: tag, status: 'disabled', sort: 'newest', page: 1, pageSize: 50 },
    now,
  );
  check(
    'list: status=disabled returns only the disabled tenant',
    statusFiltered.total === 1 && statusFiltered.items[0]?.id === disabled.id,
  );
  const page1 = await listTenants({ q: tag, sort: 'oldest', page: 1, pageSize: 2 }, now);
  check(
    'list: pagination (pageSize 2 over 5) → 3 pages',
    page1.items.length === 2 && page1.total === 5 && page1.totalPages === 3,
  );

  // --- 8.3.2 detail --------------------------------------------
  const detail = await getTenantDetail(basicStripe.id);
  check(
    'detail: usage counts (3 lifetime invoices, 1 issued, 0 clients)',
    detail.usage.lifetimeInvoicesGenerated === 3 &&
      detail.usage.invoicesIssued === 1 &&
      detail.usage.invoicesDraft === 0 &&
      detail.usage.clients === 0,
  );
  check(
    'detail: entitlements resolve to BASIC / stripe',
    detail.entitlements.tier === 'BASIC' && detail.entitlements.source === 'stripe',
  );
  check(
    'detail: subscription history has the one Stripe row',
    detail.subscriptionHistory.length === 1 &&
      detail.subscriptionHistory[0]?.source === 'STRIPE' &&
      detail.subscriptionHistory[0]?.tier === 'BASIC',
  );
  check('detail: recent activity has the CREATED event', detail.recentActivity.length === 1);
  check('detail: unknown id → 404', (await statusOf(() => getTenantDetail('nope'))) === 404);

  // --- 8.3.4 disable / enable --------------------------------
  await prisma.refreshToken.create({
    data: {
      tokenHash: `${tag}-rt`,
      userId: basicStripe.id,
      expiresAt: new Date(now.getTime() + 30 * DAY),
    },
  });
  const afterDisable = await disableTenant(basicStripe.id, adminUser.id, 'abuse report');
  check('disable: disabledAt + reason set', afterDisable.disabledAt !== null);
  check('disable: reason persisted', afterDisable.disabledReason === 'abuse report');
  const rt = await prisma.refreshToken.findUnique({ where: { tokenHash: `${tag}-rt` } });
  check('disable: outstanding refresh tokens revoked', rt?.revokedAt !== null);

  const auditDisable = await prisma.adminAuditLog.findFirst({
    where: { action: 'account.disable', targetTenantId: basicStripe.id },
  });
  check(
    'disable: audit row written, attributed to the admin',
    auditDisable?.actorUserId === adminUser.id &&
      (auditDisable?.metadata as Record<string, unknown>)?.reason === 'abuse report',
  );

  // enforcement: requireTenant + login
  async function callRequireTenant(userId: string): Promise<{ arg: unknown }> {
    return new Promise((resolve) => {
      const req = { auth: { userId } } as unknown as Request;
      const next: NextFunction = (arg?: unknown) => resolve({ arg });
      void requireTenant(req, {} as Response, next);
    });
  }
  const guardDisabled = await callRequireTenant(basicStripe.id);
  check(
    'disable: requireTenant 403s the disabled tenant',
    (guardDisabled.arg as { status?: number })?.status === 403,
  );
  const guardActive = await callRequireTenant(premiumManual.id);
  check('disable: requireTenant still passes an active tenant', guardActive.arg === undefined);

  const loginPwUser = await makeTenant({ passwordHash: await hashPassword('correct-horse') });
  ids.push(loginPwUser.id);
  check(
    'login: an active account with the right password succeeds',
    (await statusOf(() => login({ email: loginPwUser.email, password: 'correct-horse' }, {}))) ===
      'ok',
  );
  await disableTenant(loginPwUser.id, adminUser.id);
  check(
    'login: a disabled account with the right password → 403',
    (await statusOf(() => login({ email: loginPwUser.email, password: 'correct-horse' }, {}))) ===
      403,
  );

  const idempotent = await disableTenant(basicStripe.id, adminUser.id, 'again');
  const auditDisableCount = await prisma.adminAuditLog.count({
    where: { action: 'account.disable', targetTenantId: basicStripe.id },
  });
  check(
    'disable: calling it again is a no-op (no second audit row, reason unchanged)',
    auditDisableCount === 1 && idempotent.disabledReason === 'abuse report',
  );

  const afterEnable = await enableTenant(basicStripe.id, adminUser.id);
  check(
    'enable: clears disabledAt + reason, logs account.enable',
    afterEnable.disabledAt === null &&
      afterEnable.disabledReason === null &&
      (await prisma.adminAuditLog.count({
        where: { action: 'account.enable', targetTenantId: basicStripe.id },
      })) === 1,
  );
  check(
    'enable: requireTenant passes the re-enabled tenant',
    (await callRequireTenant(basicStripe.id)).arg === undefined,
  );

  // --- guards -----------------------------------------------
  check(
    'guard: cannot disable an ADMIN account (400)',
    (await statusOf(() => disableTenant(adminUser.id, adminUser.id))) === 400,
  );
  const otherAdmin = await prisma.user.create({
    data: {
      email: `${tag}-admin2@example.test`,
      passwordHash: 'x',
      businessName: 'A2',
      role: 'ADMIN',
    },
  });
  ids.push(otherAdmin.id);
  check(
    'guard: cannot delete an ADMIN account (400)',
    (await statusOf(() => deleteTenant(otherAdmin.id, adminUser.id))) === 400,
  );
  check(
    'guard: cannot act on your own account (400)',
    (await statusOf(() => disableTenant(adminUser.id, adminUser.id))) === 400,
  );

  // --- 8.3.5 delete -------------------------------------
  const doomed = await makeTenant();
  ids.push(doomed.id);
  await liveSub(doomed.id, 'BASIC', 'MANUAL');
  const dInv = await prisma.invoice.create({
    data: { tenantId: doomed.id, status: 'ISSUED', number: `${tag}-D1`, issueDate: now },
  });
  await prisma.invoiceHistoryEvent.create({
    data: { tenantId: doomed.id, invoiceId: dInv.id, eventType: 'CREATED', userId: doomed.id },
  });
  await prisma.client.create({ data: { tenantId: doomed.id, name: 'C' } });

  const res = await deleteTenant(doomed.id, adminUser.id);
  check(
    'delete: response reports what was removed',
    res.email === doomed.email &&
      res.deletedCounts.invoices === 1 &&
      res.deletedCounts.subscriptions === 1 &&
      res.deletedCounts.clients === 1 &&
      res.deletedCounts.invoiceHistoryEvents === 1,
    JSON.stringify(res.deletedCounts),
  );
  const leftovers = await Promise.all([
    prisma.user.findUnique({ where: { id: doomed.id } }),
    prisma.invoice.count({ where: { tenantId: doomed.id } }),
    prisma.subscription.count({ where: { tenantId: doomed.id } }),
    prisma.invoiceHistoryEvent.count({ where: { tenantId: doomed.id } }),
    prisma.client.count({ where: { tenantId: doomed.id } }),
  ]);
  check(
    'delete: user + every child row gone (cascade)',
    leftovers[0] === null && leftovers.slice(1).every((c) => c === 0),
    JSON.stringify(leftovers.slice(1)),
  );
  const auditDelete = await prisma.adminAuditLog.findFirst({
    where: { action: 'tenant.delete', subjectId: doomed.id },
  });
  check(
    'delete: tenant.delete audit row survives with an email snapshot',
    auditDelete?.targetTenantEmail === doomed.email &&
      auditDelete?.actorUserId === adminUser.id &&
      (auditDelete?.metadata as Record<string, unknown>)?.businessName === doomed.businessName,
  );
  check(
    'delete: unknown id → 404',
    (await statusOf(() => deleteTenant('nope', adminUser.id))) === 404,
  );
} finally {
  await prisma.adminAuditLog.deleteMany({
    where: { OR: [{ actorUserId: adminUser.id }, { targetTenantId: { in: ids } }] },
  });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}

console.log(
  failures === 0 ? '\nadmin-tenant: all checks passed.' : `\nadmin-tenant: ${failures} FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
