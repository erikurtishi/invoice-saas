import type { Prisma, Subscription } from '@prisma/client';
import type {
  ManualGrant,
  ManualGrantCreate,
  ManualGrantUpdate,
  TenantGrants,
} from '@invoice-saas/shared';

import { prisma } from '../db/client.js';
import { ApiError } from '../lib/api-error.js';
import { resolveEntitlements } from '../lib/entitlements.js';
import { recordAdminAction } from './admin-audit-service.js';

/**
 * Admin-issued cash grants (backlog Epic 6.3, spec §9). A manual grant is just a
 * `Subscription` row with `source: MANUAL` and a fixed `[startDate, endDate]`
 * window — resolved by the exact same entitlement logic as a Stripe sub
 * (decision D5 "most access wins", D22). This service is the only writer of
 * `MANUAL` rows.
 *
 * It runs on the unscoped `prisma` client with an explicit `tenantId`, like the
 * rest of the billing seam — admin actions are cross-tenant by definition and
 * never carry a `req.db`.
 *
 * Automatic expiry (6.3.3) needs no code here: `resolveEntitlements` flips a
 * granting row past its `endDate` to `EXPIRED` on the next lookup, and
 * `scripts/expire-grants.ts` does the same sweep for a crontab.
 *
 * Every mutation here appends an `admin_audit_logs` row via `recordAdminAction`
 * (backlog 8.1.2). That call is best-effort — it never throws — so a logging
 * failure can't fail an otherwise-successful grant. `actingUserId` (the admin, or
 * `null` for the CLI) is threaded through all three writers for the trail.
 */

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` → the first instant of that UTC day. */
function dayStart(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
/** `YYYY-MM-DD` → the last instant of that UTC day, so the whole day is covered. */
function dayEnd(iso: string): Date {
  return new Date(`${iso}T23:59:59.999Z`);
}

function daysRemaining(endDate: Date, now: Date): number {
  const ms = endDate.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

function toManualGrant(row: Subscription, now = new Date()): ManualGrant {
  if (row.endDate === null) {
    // A MANUAL row always has an end date; this keeps the type honest.
    throw new ApiError('INTERNAL_ERROR', 'Manual grant is missing its end date.', { status: 500 });
  }
  return {
    id: row.id,
    tenantId: row.tenantId,
    tier: row.tier as 'BASIC' | 'PREMIUM',
    status: row.status,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    note: row.note,
    grantedByUserId: row.grantedByUserId,
    createdAt: row.createdAt.toISOString(),
    daysRemaining: daysRemaining(row.endDate, now),
  };
}

async function requireTenantByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, businessName: true },
  });
  if (!user) throw ApiError.notFound('No account with that email address.');
  return user;
}

/** Issue a new grant (backlog 6.3.1). `actingUserId` is the admin, or `null` for
 *  the CLI. */
export async function createManualGrant(
  actingUserId: string | null,
  input: ManualGrantCreate,
): Promise<ManualGrant> {
  const tenant = await requireTenantByEmail(input.email);

  const row = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      tier: input.tier,
      status: 'ACTIVE',
      source: 'MANUAL',
      startDate: dayStart(input.startDate),
      endDate: dayEnd(input.endDate),
      note: input.note ?? null,
      grantedByUserId: actingUserId,
    },
  });

  // Reconcile the `users.tier` cache (and lazily EXPIRE the row if it was
  // back-dated into the past), then return the reconciled state.
  await resolveEntitlements(tenant.id).catch(() => undefined);

  await recordAdminAction({
    actorUserId: actingUserId,
    action: 'grant.create',
    targetTenantId: tenant.id,
    subjectType: 'Subscription',
    subjectId: row.id,
    summary: `Granted ${input.tier} to ${tenant.email} (${input.startDate} → ${input.endDate})`,
    metadata: {
      tier: input.tier,
      startDate: input.startDate,
      endDate: input.endDate,
      note: input.note ?? null,
    },
  });

  return toManualGrant(await reload(row.id));
}

/** `YYYY-MM-DD` slice of a Date, for audit-log diffs. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Extend / shorten / re-note a grant (backlog 6.3.4). `actingUserId` is the
 *  admin, or `null` for the CLI. */
export async function updateManualGrant(
  id: string,
  input: ManualGrantUpdate,
  actingUserId: string | null = null,
): Promise<ManualGrant> {
  const row = await prisma.subscription.findFirst({ where: { id, source: 'MANUAL' } });
  if (!row) throw ApiError.notFound('Manual grant not found.');

  const data: Prisma.SubscriptionUpdateInput = {};
  if (input.startDate !== undefined) data.startDate = dayStart(input.startDate);
  if (input.endDate !== undefined) data.endDate = dayEnd(input.endDate);
  if (input.note !== undefined) data.note = input.note; // null clears it

  // Extending a lapsed grant back into the future revives it.
  const nextEnd = input.endDate !== undefined ? dayEnd(input.endDate) : row.endDate;
  if (row.status !== 'ACTIVE' && nextEnd !== null && nextEnd > new Date()) {
    data.status = 'ACTIVE';
  }

  await prisma.subscription.update({ where: { id }, data });
  await resolveEntitlements(row.tenantId).catch(() => undefined);

  // Only the fields that actually moved, old → new.
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (input.startDate !== undefined && isoDay(row.startDate) !== input.startDate) {
    changes.startDate = { from: isoDay(row.startDate), to: input.startDate };
  }
  if (input.endDate !== undefined && (!row.endDate || isoDay(row.endDate) !== input.endDate)) {
    changes.endDate = { from: row.endDate ? isoDay(row.endDate) : null, to: input.endDate };
  }
  if (input.note !== undefined && (row.note ?? null) !== (input.note ?? null)) {
    changes.note = { from: row.note ?? null, to: input.note ?? null };
  }
  if (data.status === 'ACTIVE' && row.status !== 'ACTIVE') {
    changes.status = { from: row.status, to: 'ACTIVE' };
  }
  await recordAdminAction({
    actorUserId: actingUserId,
    action: 'grant.update',
    targetTenantId: row.tenantId,
    subjectType: 'Subscription',
    subjectId: row.id,
    summary: `Modified ${row.tier} grant ${row.id} (${Object.keys(changes).join(', ') || 'no change'})`,
    metadata: { tier: row.tier as 'BASIC' | 'PREMIUM', changes },
  });

  return toManualGrant(await reload(id));
}

/** Revoke a grant immediately (backlog 6.3.4). The row is kept (decision D5 —
 *  "both records preserved"), just marked `CANCELED` and ended now.
 *  `actingUserId` is the admin, or `null` for the CLI. */
export async function revokeManualGrant(
  id: string,
  actingUserId: string | null = null,
): Promise<ManualGrant> {
  const row = await prisma.subscription.findFirst({ where: { id, source: 'MANUAL' } });
  if (!row) throw ApiError.notFound('Manual grant not found.');

  const endedAt = new Date();
  await prisma.subscription.update({
    where: { id },
    data: { status: 'CANCELED', endDate: endedAt },
  });
  await resolveEntitlements(row.tenantId).catch(() => undefined);

  await recordAdminAction({
    actorUserId: actingUserId,
    action: 'grant.revoke',
    targetTenantId: row.tenantId,
    subjectType: 'Subscription',
    subjectId: row.id,
    summary: `Revoked ${row.tier} grant ${row.id}`,
    metadata: { tier: row.tier as 'BASIC' | 'PREMIUM', endedAt: endedAt.toISOString() },
  });

  return toManualGrant(await reload(id));
}

/** Every manual grant a tenant holds, plus their current effective tier
 *  (backlog 6.3.6). */
export async function listTenantGrants(email: string): Promise<TenantGrants> {
  const tenant = await requireTenantByEmail(email);

  // Also lazily expires anything past its window and refreshes the tier cache.
  const entitlements = await resolveEntitlements(tenant.id);

  const rows = await prisma.subscription.findMany({
    where: { tenantId: tenant.id, source: 'MANUAL' },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  return {
    tenant: {
      id: tenant.id,
      email: tenant.email,
      businessName: tenant.businessName,
      tier: entitlements.tier,
    },
    grants: rows.map((row) => toManualGrant(row, now)),
  };
}

async function reload(id: string): Promise<Subscription> {
  const row = await prisma.subscription.findUnique({ where: { id } });
  if (!row) throw ApiError.notFound('Manual grant not found.');
  return row;
}

/**
 * Flips every `MANUAL` grant past its `endDate` to `EXPIRED` and refreshes the
 * affected tenants' tier caches (backlog 6.3.3). Called by
 * `scripts/expire-grants.ts` for a crontab; `resolveEntitlements` already does the
 * same lazily on read, so this is a freshness optimisation, not a correctness
 * requirement. Never touches `STRIPE` rows.
 */
export async function sweepExpiredGrants(now = new Date()): Promise<{
  expired: number;
  tenants: number;
}> {
  const due = await prisma.subscription.findMany({
    where: { source: 'MANUAL', status: { in: ['ACTIVE', 'PAST_DUE'] }, endDate: { lt: now } },
    select: { id: true, tenantId: true },
  });
  if (due.length === 0) return { expired: 0, tenants: 0 };

  await prisma.subscription.updateMany({
    where: { id: { in: due.map((d) => d.id) } },
    data: { status: 'EXPIRED' },
  });
  const tenants = [...new Set(due.map((d) => d.tenantId))];
  for (const tenantId of tenants) {
    await resolveEntitlements(tenantId).catch(() => undefined);
  }
  return { expired: due.length, tenants: tenants.length };
}
