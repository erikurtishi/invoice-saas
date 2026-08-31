/**
 * Admin audit-log check (backlog 8.1.2). Drives the real `admin-audit-service`
 * through the `manual-grant-service` call sites against throwaway users:
 *
 *  - issuing / updating / revoking a manual grant each appends exactly one
 *    `admin_audit_logs` row, attributed to the acting admin (id + email snapshot),
 *    pointed at the affected tenant (id + email snapshot) and the Subscription row
 *  - `grant.update` records a `changes` diff of only the fields that moved
 *  - a CLI-issued grant (`actingUserId: null`) logs with a null actor
 *  - `listAdminAuditLog` filters by actor / tenant / action / date range and
 *    paginates newest-first
 *  - `recordAdminAction` is best-effort: a bad actor id still writes a row (email
 *    snapshot null); invalid metadata is dropped, not thrown, and writes nothing
 *  - the service exposes no update or delete — the log is append-only
 *
 *   npm run admin:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';

import {
  createManualGrant,
  revokeManualGrant,
  updateManualGrant,
} from '../src/services/manual-grant-service.js';
import * as auditService from '../src/services/admin-audit-service.js';
import { listAdminAuditLog, recordAdminAction } from '../src/services/admin-audit-service.js';

const prisma = new PrismaClient();
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}
function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const stamp = Date.now();
const admin = await prisma.user.create({
  data: {
    email: `audit-check-admin+${stamp}@example.test`,
    passwordHash: 'x',
    businessName: 'Admin Co',
    role: 'ADMIN',
  },
});
const tenant = await prisma.user.create({
  data: {
    email: `audit-check-tenant+${stamp}@example.test`,
    passwordHash: 'x',
    businessName: 'Tenant Co',
  },
});

async function rowsForTenant() {
  return prisma.adminAuditLog.findMany({
    where: { targetTenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
  });
}

try {
  // --- grant.create -----------------------------------------------------
  const grant = await createManualGrant(admin.id, {
    email: tenant.email,
    tier: 'BASIC',
    startDate: isoInDays(0),
    endDate: isoInDays(30),
    note: '€20 cash',
  });
  let rows = await rowsForTenant();
  const created = rows.at(-1);
  check(
    'grant.create logs one row, attributed to the admin, pointed at the tenant + Subscription',
    rows.length === 1 &&
      created?.action === 'grant.create' &&
      created.actorUserId === admin.id &&
      created.actorEmail === admin.email &&
      created.targetTenantId === tenant.id &&
      created.targetTenantEmail === tenant.email &&
      created.subjectType === 'Subscription' &&
      created.subjectId === grant.id,
    created?.action,
  );
  check(
    'grant.create metadata carries tier + window + note',
    (created?.metadata as Record<string, unknown>)?.tier === 'BASIC' &&
      (created?.metadata as Record<string, unknown>)?.startDate === isoInDays(0) &&
      (created?.metadata as Record<string, unknown>)?.note === '€20 cash',
    JSON.stringify(created?.metadata),
  );

  // --- grant.update: only changed fields land in `changes` -------------
  await updateManualGrant(grant.id, { endDate: isoInDays(60) }, admin.id);
  rows = await rowsForTenant();
  const updated = rows.at(-1);
  const changes = (
    updated?.metadata as { changes?: Record<string, { from: unknown; to: unknown }> }
  )?.changes;
  check(
    'grant.update logs one row with an endDate diff and no spurious fields',
    rows.length === 2 &&
      updated?.action === 'grant.update' &&
      updated.actorUserId === admin.id &&
      !!changes &&
      Object.keys(changes).length === 1 &&
      changes.endDate?.to === isoInDays(60),
    JSON.stringify(changes),
  );

  // --- grant.revoke --------------------------------------------------
  await revokeManualGrant(grant.id, admin.id);
  rows = await rowsForTenant();
  const revoked = rows.at(-1);
  check(
    'grant.revoke logs one row with an endedAt timestamp',
    rows.length === 3 &&
      revoked?.action === 'grant.revoke' &&
      typeof (revoked?.metadata as Record<string, unknown>)?.endedAt === 'string',
    revoked?.action,
  );

  // --- CLI-issued grant → null actor -------------------------------
  await createManualGrant(null, {
    email: tenant.email,
    tier: 'PREMIUM',
    startDate: isoInDays(0),
    endDate: isoInDays(10),
  });
  rows = await rowsForTenant();
  const cli = rows.at(-1);
  check(
    'a CLI grant (actingUserId null) logs with a null actor',
    cli?.action === 'grant.create' && cli.actorUserId === null && cli.actorEmail === null,
  );

  // --- listAdminAuditLog: filters + pagination --------------------
  const byTenant = await listAdminAuditLog({ targetTenantId: tenant.id, page: 1, pageSize: 30 });
  check(
    'list filters by tenant, newest first',
    byTenant.total === 4 &&
      byTenant.items.length === 4 &&
      byTenant.items[0]!.createdAt >= byTenant.items[3]!.createdAt,
    `total ${byTenant.total}`,
  );
  const byActor = await listAdminAuditLog({ actorUserId: admin.id, page: 1, pageSize: 30 });
  check('list filters by actor (3 of the 4 rows)', byActor.total === 3);
  const byAction = await listAdminAuditLog({
    targetTenantId: tenant.id,
    action: 'grant.create',
    page: 1,
    pageSize: 30,
  });
  check('list filters by action slug', byAction.total === 2);
  const paged = await listAdminAuditLog({ targetTenantId: tenant.id, page: 1, pageSize: 2 });
  check(
    'list paginates',
    paged.items.length === 2 && paged.total === 4 && paged.totalPages === 2,
    `${paged.items.length}/${paged.total}/${paged.totalPages}`,
  );
  const future = await listAdminAuditLog({
    targetTenantId: tenant.id,
    dateFrom: isoInDays(1),
    page: 1,
    pageSize: 30,
  });
  check('list date range excludes rows before dateFrom', future.total === 0);

  // --- best-effort: bad actor id still writes; email snapshot null ---
  await recordAdminAction({
    actorUserId: 'nonexistent-user-id',
    action: 'grant.create',
    targetTenantId: tenant.id,
    subjectType: 'Subscription',
    subjectId: 'x',
    summary: 'bad actor test',
  });
  rows = await rowsForTenant();
  check(
    'a non-existent actor id still logs, with a null email snapshot',
    rows.length === 5 && rows.at(-1)?.actorEmail === null,
  );

  // --- best-effort: invalid metadata is swallowed, writes nothing ---
  const before = (await rowsForTenant()).length;
  await recordAdminAction({
    actorUserId: admin.id,
    action: 'grant.create',
    targetTenantId: tenant.id,
    summary: 'invalid metadata test',
    // @ts-expect-error — deliberately violates adminAuditMetadataSchema.strict()
    metadata: { bogusKey: true },
  });
  const after = (await rowsForTenant()).length;
  check('invalid metadata → no throw, no row', after === before);

  // --- append-only: no update / delete surface --------------------
  check(
    'admin-audit-service exposes only recordAdminAction + listAdminAuditLog',
    Object.keys(auditService).sort().join(',') === 'listAdminAuditLog,recordAdminAction',
    Object.keys(auditService).join(','),
  );
} finally {
  await prisma.adminAuditLog.deleteMany({
    where: { OR: [{ targetTenantId: tenant.id }, { actorUserId: admin.id }] },
  });
  await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, tenant.id] } } });
  await prisma.$disconnect();
}

console.log(
  failures === 0 ? '\nadmin-audit: all checks passed.' : `\nadmin-audit: ${failures} FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
