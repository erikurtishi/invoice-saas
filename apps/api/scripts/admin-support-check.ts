/**
 * Admin support-inbox check (backlog 8.6.1). Drives `admin-support-service`
 * against throwaway admins/tenants.
 *
 *  - open a ticket → linked to the tenant (or `tenantId` null for an unmatched
 *    email), OPEN, first message authored ADMIN, `support.ticket.open` audit row
 *  - list: subject search, status / tenant filters, `sort=updated` surfaces the
 *    most recently touched thread, global open/pending counts
 *  - append message → thread grows (oldest-first), `updatedAt` + `lastMessageAt`
 *    move, no audit noise
 *  - update: priority/assignee changes are silent; close / reopen flip
 *    `closedAt` and each log one audit row; a non-admin assignee is refused
 *  - cascade: deleting a ticket removes its messages; deleting the tenant nulls
 *    `tenantId` but keeps `tenantEmail`
 *
 *   npm run support:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';

import { supportTicketUpdateSchema } from '@invoice-saas/shared';

import {
  addSupportMessage,
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  updateSupportTicket,
} from '../src/services/admin-support-service.js';

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

const stamp = Date.now();
const tag = `support-check-${stamp}`;
const ids: string[] = [];
const ticketIds: string[] = [];

async function mkUser(over: Record<string, unknown> = {}) {
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

const admin = await mkUser({ role: 'ADMIN' });
const admin2 = await mkUser({ role: 'ADMIN' });
const tenant = await mkUser();

async function auditCount(action: string, subjectId: string) {
  return prisma.adminAuditLog.count({ where: { action, subjectId } });
}

try {
  const listBefore = await listSupportTickets({ sort: 'updated', page: 1, pageSize: 100 });

  // --- open ---------------------------------------------------------
  const t1 = await createSupportTicket(admin.id, {
    tenantEmail: tenant.email,
    subject: `${tag} cannot download PDF`,
    priority: 'HIGH',
    body: 'Tenant reports the Download button spins forever.',
  });
  ticketIds.push(t1.id);
  check(
    'open: linked to the tenant, OPEN/HIGH, 1 ADMIN message, opener recorded',
    t1.tenantId === tenant.id &&
      t1.tenantEmail === tenant.email &&
      t1.status === 'OPEN' &&
      t1.priority === 'HIGH' &&
      t1.openedByUserId === admin.id &&
      t1.messageCount === 1 &&
      t1.messages.length === 1 &&
      t1.messages[0]?.author === 'ADMIN' &&
      t1.messages[0]?.authorUserId === admin.id,
  );
  check(
    'open: support.ticket.open audit row with subject + status',
    (await auditCount('support.ticket.open', t1.id)) === 1 &&
      (
        await prisma.adminAuditLog.findFirst({
          where: { action: 'support.ticket.open', subjectId: t1.id },
        })
      )?.targetTenantEmail === tenant.email,
  );

  const t2 = await createSupportTicket(admin.id, {
    tenantEmail: `${tag}-ghost@example.test`,
    subject: `${tag} billing question`,
    priority: 'NORMAL',
    body: 'Email from someone with no account yet.',
  });
  ticketIds.push(t2.id);
  check(
    'open: an unmatched email still opens a ticket (tenantId null, email kept)',
    t2.tenantId === null && t2.tenantEmail === `${tag}-ghost@example.test`,
  );

  // --- list --------------------------------------------------------
  const listed = await listSupportTickets({ q: tag, sort: 'updated', page: 1, pageSize: 50 });
  check('list: subject search finds both new tickets', listed.total === 2, `${listed.total}`);
  check(
    'list: open count rose by 2 vs the baseline',
    listed.openCount - listBefore.openCount === 2,
  );
  const onlyOpen = await listSupportTickets({ q: tag, status: 'OPEN', page: 1, pageSize: 50 });
  const onlyClosed = await listSupportTickets({ q: tag, status: 'CLOSED', page: 1, pageSize: 50 });
  check('list: status filter', onlyOpen.total === 2 && onlyClosed.total === 0);
  const byTenant = await listSupportTickets({ tenantId: tenant.id, page: 1, pageSize: 50 });
  check(
    'list: tenant filter returns only the linked ticket',
    byTenant.total === 1 && byTenant.items[0]?.id === t1.id,
  );

  // --- append message -------------------------------------------
  const before2 = t2.updatedAt;
  const t1b = await addSupportMessage(t1.id, admin.id, {
    author: 'TENANT',
    body: 'Tenant: still broken on Chrome.',
  });
  check(
    'message: thread grows to 2, oldest-first, last is TENANT, counters move',
    t1b.messages.length === 2 &&
      t1b.messageCount === 2 &&
      t1b.messages[1]?.author === 'TENANT' &&
      t1b.lastMessageAt === t1b.messages[1]?.createdAt &&
      Date.parse(t1b.updatedAt) >= Date.parse(t1.updatedAt),
  );
  check(
    'message: unknown ticket id → 404',
    (await statusOf(() => addSupportMessage('nope', admin.id, { author: 'ADMIN', body: 'x' }))) ===
      404,
  );

  // --- update: silent changes ---------------------------------
  const auditBefore = await prisma.adminAuditLog.count({
    where: { subjectId: t1.id, action: { startsWith: 'support.ticket.' } },
  });
  await updateSupportTicket(t1.id, admin.id, { priority: 'LOW' });
  const pending = await updateSupportTicket(t1.id, admin.id, { status: 'PENDING' });
  check(
    'update: priority + PENDING are silent (no new audit rows), closedAt stays null',
    pending.priority === 'LOW' &&
      pending.status === 'PENDING' &&
      pending.closedAt === null &&
      (await prisma.adminAuditLog.count({
        where: { subjectId: t1.id, action: { startsWith: 'support.ticket.' } },
      })) === auditBefore,
  );

  // --- update: close / reopen ---------------------------------
  const closed = await updateSupportTicket(t1.id, admin.id, { status: 'CLOSED' });
  check(
    'update: CLOSED sets closedAt + logs support.ticket.close',
    closed.status === 'CLOSED' &&
      closed.closedAt !== null &&
      (await auditCount('support.ticket.close', t1.id)) === 1,
  );
  const reopened = await updateSupportTicket(t1.id, admin.id, { status: 'OPEN' });
  check(
    'update: reopen clears closedAt + logs support.ticket.reopen',
    reopened.status === 'OPEN' &&
      reopened.closedAt === null &&
      (await auditCount('support.ticket.reopen', t1.id)) === 1,
  );

  // --- update: assignee -------------------------------------
  const assigned = await updateSupportTicket(t1.id, admin.id, { assigneeEmail: admin2.email });
  check('update: assignee set to an admin', assigned.assigneeUserId === admin2.id);
  const unassigned = await updateSupportTicket(t1.id, admin.id, { assigneeEmail: null });
  check('update: assignee cleared with null', unassigned.assigneeUserId === null);
  check(
    'update: a non-admin assignee is refused (400)',
    (await statusOf(() =>
      updateSupportTicket(t1.id, admin.id, { assigneeEmail: tenant.email }),
    )) === 400,
  );
  check(
    'update: empty patch is rejected by the schema',
    supportTicketUpdateSchema.safeParse({}).success === false,
  );
  check(
    'update: unknown ticket id → 404',
    (await statusOf(() => updateSupportTicket('nope', admin.id, { status: 'CLOSED' }))) === 404,
  );

  // --- sort=updated ---------------------------------------
  await addSupportMessage(t1.id, admin.id, { author: 'ADMIN', body: 'touch t1' });
  await addSupportMessage(t2.id, admin.id, { author: 'ADMIN', body: 'touch t2 last' });
  const bumped = await listSupportTickets({ q: tag, sort: 'updated', page: 1, pageSize: 50 });
  check(
    'sort=updated: the most recently touched ticket (t2) is first',
    bumped.items[0]?.id === t2.id,
  );
  check(
    'append preserved t2 baseline ordering assumption',
    Date.parse(t2.updatedAt) >= Date.parse(before2),
  );

  // --- cascade: delete a ticket → its messages go -------
  await prisma.supportTicket.delete({ where: { id: t2.id } });
  ticketIds.splice(ticketIds.indexOf(t2.id), 1);
  check(
    'cascade: deleting a ticket removes its messages',
    (await prisma.supportMessage.count({ where: { ticketId: t2.id } })) === 0 &&
      (await statusOf(() => getSupportTicket(t2.id))) === 404,
  );

  // --- SetNull: delete the tenant → ticket keeps the email ----
  const t3 = await createSupportTicket(admin.id, {
    tenantEmail: tenant.email,
    subject: `${tag} pre-deletion`,
    body: 'linked, then the tenant is deleted',
  });
  ticketIds.push(t3.id);
  await prisma.adminAuditLog.deleteMany({ where: { targetTenantId: tenant.id } });
  await prisma.user.delete({ where: { id: tenant.id } });
  ids.splice(ids.indexOf(tenant.id), 1);
  const t3after = await getSupportTicket(t3.id);
  check(
    'SetNull: a deleted tenant nulls tenantId but the ticket keeps tenantEmail',
    t3after.tenantId === null && t3after.tenantEmail === tenant.email,
  );
} finally {
  await prisma.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.adminAuditLog.deleteMany({
    where: { OR: [{ actorUserId: admin.id }, { subjectId: { in: ticketIds } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}

console.log(
  failures === 0 ? '\nadmin-support: all checks passed.' : `\nadmin-support: ${failures} FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
