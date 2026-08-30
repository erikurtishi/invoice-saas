import type { Client, Prisma } from '@prisma/client';
import type {
  ClientInput,
  ClientListQuery,
  ClientListResponse,
  ClientResponse,
  ClientSort,
} from '@invoice-saas/shared';

import type { ScopedPrismaClient } from '../db/tenant-scope.js';
import { ApiError } from '../lib/api-error.js';

/**
 * Client reads and writes (backlog Epic 2.1). Every function takes the
 * tenant-scoped `req.db` (`ScopedPrismaClient`) — the extension in
 * `db/tenant-scope.ts` injects `tenantId` into every `where` and every `data`, so
 * nothing here mentions the tenant. A route that reached for the raw `prisma`
 * client instead would leak across tenants; that is why `db` is a parameter, not
 * an import.
 *
 * Soft delete (decision D4): `deletedAt` is stamped, never a row removed. Every
 * read here filters `deletedAt: null`; historical invoices resolve a deleted
 * client through their own (unfiltered) relation load.
 */

function toClientResponse(row: Client): ClientResponse {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    taxId: row.taxId,
    addressMode: row.addressMode,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    postalCode: row.postalCode,
    country: row.country,
    addressText: row.addressText,
    currency: row.currency,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Shared column mapping for create and update — the form submits the whole object
 * (no partial updates), so both write every field, normalising an absent optional
 * to an explicit `null`. */
function toWriteData(input: ClientInput) {
  return {
    name: input.name,
    email: input.email ?? null,
    taxId: input.taxId ?? null,
    addressMode: input.addressMode,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? null,
    addressText: input.addressText ?? null,
    currency: input.currency ?? null,
    notes: input.notes ?? null,
  };
}

const ORDER_BY: Record<ClientSort, Prisma.ClientOrderByWithRelationInput> = {
  name: { name: 'asc' },
  '-name': { name: 'desc' },
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
};

export async function listClients(
  db: ScopedPrismaClient,
  query: ClientListQuery,
): Promise<ClientListResponse> {
  const where: Prisma.ClientWhereInput = { deletedAt: null };

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
      { taxId: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where,
      orderBy: ORDER_BY[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: rows.map(toClientResponse),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** Loads a live (non-deleted) client or throws 404. */
async function loadClient(db: ScopedPrismaClient, id: string): Promise<Client> {
  const client = await db.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) throw ApiError.notFound('That client no longer exists.');
  return client;
}

export async function getClient(db: ScopedPrismaClient, id: string): Promise<ClientResponse> {
  return toClientResponse(await loadClient(db, id));
}

export async function createClient(
  db: ScopedPrismaClient,
  input: ClientInput,
): Promise<ClientResponse> {
  // `tenantId` is injected by the tenant-scope extension (`db/tenant-scope.ts`) at
  // query time — it is deliberately absent here, so the create payload doesn't
  // satisfy `ClientCreateInput` (which wants `tenant`) on its own. This cast is the
  // seam between "the type says provide the owner" and "the extension always does".
  const data = toWriteData(input) as unknown as Prisma.ClientCreateInput;
  const client = await db.client.create({ data });
  return toClientResponse(client);
}

export async function updateClient(
  db: ScopedPrismaClient,
  id: string,
  input: ClientInput,
): Promise<ClientResponse> {
  await loadClient(db, id);
  const client = await db.client.update({ where: { id }, data: toWriteData(input) });
  return toClientResponse(client);
}

/** Soft delete (decision D4). Idempotent only in effect — a second call 404s
 * because the row is already `deletedAt`-filtered out. */
export async function deleteClient(db: ScopedPrismaClient, id: string): Promise<void> {
  await loadClient(db, id);
  await db.client.update({ where: { id }, data: { deletedAt: new Date() } });
}
