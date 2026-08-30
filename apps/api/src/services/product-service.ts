import type { Prisma, Product } from '@prisma/client';
import type {
  ProductInput,
  ProductListQuery,
  ProductListResponse,
  ProductResponse,
  ProductSort,
} from '@invoice-saas/shared';

import type { ScopedPrismaClient } from '../db/tenant-scope.js';
import { ApiError } from '../lib/api-error.js';

/**
 * Product reads and writes (backlog Epic 2.2). Same shape as `client-service.ts`:
 * every function takes the tenant-scoped `req.db`, so `tenantId` is never written
 * here — the extension in `db/tenant-scope.ts` injects it. Soft delete (decision
 * D4): reads filter `deletedAt: null`; a deleted product still resolves through an
 * invoice's own relation load.
 */

function toProductResponse(row: Product): ProductResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    unit: row.unit,
    defaultPriceMinor: row.defaultPriceMinor,
    defaultTaxRateBp: row.defaultTaxRateBp,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The form submits the whole object (no partial updates), so create and update
 * both write every column, normalising an absent optional to `null`. */
function toWriteData(input: ProductInput) {
  return {
    name: input.name,
    description: input.description ?? null,
    unit: input.unit ?? null,
    defaultPriceMinor: input.defaultPriceMinor ?? null,
    defaultTaxRateBp: input.defaultTaxRateBp,
  };
}

const ORDER_BY: Record<ProductSort, Prisma.ProductOrderByWithRelationInput> = {
  name: { name: 'asc' },
  '-name': { name: 'desc' },
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
};

export async function listProducts(
  db: ScopedPrismaClient,
  query: ProductListQuery,
): Promise<ProductListResponse> {
  const where: Prisma.ProductWhereInput = { deletedAt: null };

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: ORDER_BY[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: rows.map(toProductResponse),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** Loads a live (non-deleted) product or throws 404. */
async function loadProduct(db: ScopedPrismaClient, id: string): Promise<Product> {
  const product = await db.product.findFirst({ where: { id, deletedAt: null } });
  if (!product) throw ApiError.notFound('That product no longer exists.');
  return product;
}

export async function getProduct(db: ScopedPrismaClient, id: string): Promise<ProductResponse> {
  return toProductResponse(await loadProduct(db, id));
}

export async function createProduct(
  db: ScopedPrismaClient,
  input: ProductInput,
): Promise<ProductResponse> {
  // `tenantId` is injected by the tenant-scope extension at query time — see the
  // matching note in `client-service.ts createClient` for why this cast is here.
  const data = toWriteData(input) as unknown as Prisma.ProductCreateInput;
  const product = await db.product.create({ data });
  return toProductResponse(product);
}

export async function updateProduct(
  db: ScopedPrismaClient,
  id: string,
  input: ProductInput,
): Promise<ProductResponse> {
  await loadProduct(db, id);
  const product = await db.product.update({ where: { id }, data: toWriteData(input) });
  return toProductResponse(product);
}

/** Soft delete (decision D4). 404s on a second call — the row is `deletedAt`-filtered. */
export async function deleteProduct(db: ScopedPrismaClient, id: string): Promise<void> {
  await loadProduct(db, id);
  await db.product.update({ where: { id }, data: { deletedAt: new Date() } });
}
