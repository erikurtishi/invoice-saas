import type { Prisma, SupportMessage, SupportTicket } from '@prisma/client';
import {
  type AdminSupportListQuery,
  type AdminSupportListResponse,
  type SupportMessageCreate,
  type SupportTicketCreate,
  type SupportTicketDetail,
  type SupportTicketSummary,
  type SupportTicketUpdate,
} from '@invoice-saas/shared';

import { prisma } from '../db/client.js';
import { ApiError } from '../lib/api-error.js';
import { recordAdminAction } from './admin-audit-service.js';

/**
 * The admin support inbox (backlog 8.6.1, spec §12 "Support"). Admin-only case
 * tracker — nothing tenant-facing writes here. Unscoped `prisma`, like the rest
 * of the admin surface.
 *
 * Audit-logged actions are the meaningful lifecycle transitions only —
 * `support.ticket.open` / `.close` / `.reopen`. Routine edits (priority,
 * assignee, adding a message) are not, to keep `AdminAuditLog` legible.
 */

function toSummary(
  row: SupportTicket,
  messageCount: number,
  lastMessageAt: Date | null,
): SupportTicketSummary {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantEmail: row.tenantEmail,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    openedByUserId: row.openedByUserId,
    assigneeUserId: row.assigneeUserId,
    messageCount,
    lastMessageAt: lastMessageAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

function toMessage(m: SupportMessage) {
  return {
    id: m.id,
    author: m.author,
    authorUserId: m.authorUserId,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  };
}

const SUMMARY_INCLUDE = {
  _count: { select: { messages: true } },
  messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
} satisfies Prisma.SupportTicketInclude;

type SummaryRow = SupportTicket & {
  _count: { messages: number };
  messages: { createdAt: Date }[];
};

export async function listSupportTickets(
  query: AdminSupportListQuery,
): Promise<AdminSupportListResponse> {
  const where: Prisma.SupportTicketWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.tenantId) where.tenantId = query.tenantId;
  if (query.assigneeUserId) where.assigneeUserId = query.assigneeUserId;
  if (query.q) where.subject = { contains: query.q, mode: 'insensitive' };

  const orderBy: Prisma.SupportTicketOrderByWithRelationInput =
    query.sort === 'newest'
      ? { createdAt: 'desc' }
      : query.sort === 'oldest'
        ? { createdAt: 'asc' }
        : { updatedAt: 'desc' };

  const [total, rows, byStatus] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: SUMMARY_INCLUDE,
    }),
    prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const countFor = (s: 'OPEN' | 'PENDING') =>
    byStatus.find((g) => g.status === s)?._count._all ?? 0;

  return {
    items: rows.map((r: SummaryRow) =>
      toSummary(r, r._count.messages, r.messages[0]?.createdAt ?? null),
    ),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    openCount: countFor('OPEN'),
    pendingCount: countFor('PENDING'),
  };
}

export async function getSupportTicket(id: string): Promise<SupportTicketDetail> {
  const row = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!row) throw ApiError.notFound('No support ticket with that id.');

  return {
    ...toSummary(row, row._count.messages, row.messages.at(-1)?.createdAt ?? null),
    messages: row.messages.map(toMessage),
  };
}

export async function createSupportTicket(
  actingUserId: string,
  input: SupportTicketCreate,
): Promise<SupportTicketDetail> {
  const tenant = await prisma.user.findUnique({
    where: { email: input.tenantEmail },
    select: { id: true },
  });

  const ticket = await prisma.supportTicket.create({
    data: {
      tenantId: tenant?.id ?? null,
      tenantEmail: input.tenantEmail,
      subject: input.subject,
      priority: input.priority,
      openedByUserId: actingUserId,
      messages: {
        create: { author: 'ADMIN', authorUserId: actingUserId, body: input.body },
      },
    },
  });

  await recordAdminAction({
    actorUserId: actingUserId,
    action: 'support.ticket.open',
    targetTenantId: tenant?.id ?? null,
    targetTenantEmail: input.tenantEmail,
    subjectType: 'SupportTicket',
    subjectId: ticket.id,
    summary: `Opened support ticket "${input.subject}" for ${input.tenantEmail}`,
    metadata: { ticketSubject: input.subject, ticketStatus: 'OPEN' },
  });

  return getSupportTicket(ticket.id);
}

export async function updateSupportTicket(
  id: string,
  actingUserId: string,
  input: SupportTicketUpdate,
): Promise<SupportTicketDetail> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw ApiError.notFound('No support ticket with that id.');

  const data: Prisma.SupportTicketUpdateInput = {};
  if (input.subject !== undefined) data.subject = input.subject;
  if (input.priority !== undefined) data.priority = input.priority;

  if (input.assigneeEmail !== undefined) {
    if (input.assigneeEmail === null) {
      data.assigneeUserId = null;
    } else {
      const admin = await prisma.user.findUnique({
        where: { email: input.assigneeEmail },
        select: { id: true, role: true },
      });
      if (!admin || admin.role !== 'ADMIN') {
        throw new ApiError('VALIDATION_ERROR', 'The assignee must be an existing admin.', {
          status: 400,
        });
      }
      data.assigneeUserId = admin.id;
    }
  }

  let transition: 'close' | 'reopen' | null = null;
  if (input.status !== undefined && input.status !== ticket.status) {
    data.status = input.status;
    if (input.status === 'CLOSED') {
      data.closedAt = new Date();
      transition = 'close';
    } else if (ticket.status === 'CLOSED') {
      data.closedAt = null;
      transition = 'reopen';
    }
  }

  await prisma.supportTicket.update({ where: { id }, data });

  if (transition) {
    await recordAdminAction({
      actorUserId: actingUserId,
      action: transition === 'close' ? 'support.ticket.close' : 'support.ticket.reopen',
      targetTenantId: ticket.tenantId,
      targetTenantEmail: ticket.tenantEmail,
      subjectType: 'SupportTicket',
      subjectId: ticket.id,
      summary: `${transition === 'close' ? 'Closed' : 'Reopened'} support ticket "${ticket.subject}"`,
      metadata: {
        ticketSubject: ticket.subject,
        ticketStatus: transition === 'close' ? 'CLOSED' : input.status,
      },
    });
  }

  return getSupportTicket(id);
}

export async function addSupportMessage(
  id: string,
  actingUserId: string,
  input: SupportMessageCreate,
): Promise<SupportTicketDetail> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
  if (!ticket) throw ApiError.notFound('No support ticket with that id.');

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: { ticketId: id, author: input.author, authorUserId: actingUserId, body: input.body },
    }),
    // Bump the ticket so `sort=updated` surfaces active threads.
    prisma.supportTicket.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);

  return getSupportTicket(id);
}
