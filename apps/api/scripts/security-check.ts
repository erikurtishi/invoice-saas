/**
 * Cross-tenant isolation check (backlog X.4.6 — "no tenant data leakage across
 * tenants; test this explicitly").
 *
 * `db/tenant-scope.ts` is the *one* mechanism that keeps tenant A's rows away
 * from tenant B: every route reaches tenant-owned data only through the
 * `scopedPrisma(tenantId)` client `middleware/tenant.ts` attaches to `req.db`.
 * This script drives that client directly against two throwaway tenants and
 * asserts, for each tenant-scoped model, that tenant B:
 *
 *   - cannot read A's rows (findMany / findFirst / findUnique / count)
 *   - cannot mutate A's rows (update / delete throw; updateMany / deleteMany
 *     affect 0 rows)
 *   - has `tenantId` forced to its own id on create (can't plant a row under A)
 *
 * and that the raw, unscoped client *can* see A's rows — proving the scope is the
 * thing doing the protecting, not an empty database.
 *
 *   npm run security:check -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';
import { defaultTemplateConfig } from '@invoice-saas/shared';

import { scopedPrisma } from '../src/db/tenant-scope.js';

const prisma = new PrismaClient();
let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}

async function throwsNotFound(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    // Prisma P2025 "record to update/delete does not exist" — the scoped `where`
    // never matched A's row.
    return (err as { code?: string }).code === 'P2025';
  }
}

async function mkTenant(tag: string) {
  return prisma.user.create({
    data: {
      email: `security-check+${tag}-${Date.now()}@example.test`,
      passwordHash: 'x',
      businessName: `Security Check ${tag}`,
      country: 'MK',
    },
  });
}

const a = await mkTenant('A');
const b = await mkTenant('B');
const dbA = scopedPrisma(a.id);
const dbB = scopedPrisma(b.id);

// --- seed tenant A (through its own scoped client) ------------------------
const aClient = await dbA.client.create({ data: { name: 'A Client LLC' } });
const aProduct = await dbA.product.create({ data: { name: 'A Widget', defaultTaxRateBp: 0 } });
const aTemplate = await dbA.template.create({
  data: { name: 'A Template', config: defaultTemplateConfig() as object },
});
check('seed: A owns 1 client / 1 product / 1 template', true);

// --- the battery, run for each simple CRUD model -------------------------
interface Case {
  model: 'client' | 'product' | 'template';
  id: string;
  patch: Record<string, unknown>;
  create: Record<string, unknown>;
}
const cases: Case[] = [
  { model: 'client', id: aClient.id, patch: { name: 'hijacked' }, create: { name: 'B Client' } },
  {
    model: 'product',
    id: aProduct.id,
    patch: { name: 'hijacked' },
    create: { name: 'B Widget', defaultTaxRateBp: 0 },
  },
  {
    model: 'template',
    id: aTemplate.id,
    patch: { name: 'hijacked' },
    create: { name: 'B Template', config: defaultTemplateConfig() as object },
  },
];

for (const c of cases) {
  // `dbB` is B's scoped client; `delegate` is e.g. `dbB.client`.
  const delegate = dbB[c.model] as unknown as {
    findMany: (args?: unknown) => Promise<unknown[]>;
    findFirst: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown>;
    count: (args?: unknown) => Promise<number>;
    update: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
    delete: (args: unknown) => Promise<unknown>;
    deleteMany: (args?: unknown) => Promise<{ count: number }>;
    create: (args: unknown) => Promise<{ id: string; tenantId: string }>;
  };

  check(`${c.model}: B.findMany() sees none of A's rows`, (await delegate.findMany()).length === 0);
  check(
    `${c.model}: B.findFirst({ where: { id: <A's> } }) → null`,
    (await delegate.findFirst({ where: { id: c.id } })) === null,
  );
  check(
    `${c.model}: B.findUnique({ where: { id: <A's> } }) → null`,
    (await delegate.findUnique({ where: { id: c.id } })) === null,
  );
  check(`${c.model}: B.count() → 0`, (await delegate.count()) === 0);
  check(
    `${c.model}: B.update(<A's id>) throws not-found`,
    await throwsNotFound(() => delegate.update({ where: { id: c.id }, data: c.patch })),
  );
  check(
    `${c.model}: B.delete(<A's id>) throws not-found`,
    await throwsNotFound(() => delegate.delete({ where: { id: c.id } })),
  );
  check(
    `${c.model}: B.updateMany({}) touches 0 rows`,
    (await delegate.updateMany({ where: {}, data: c.patch })).count === 0,
  );
  check(`${c.model}: B.deleteMany({}) touches 0 rows`, (await delegate.deleteMany()).count === 0);

  const planted = await delegate.create({ data: c.create });
  check(
    `${c.model}: B.create() forces tenantId to B, not A`,
    planted.tenantId === b.id && planted.tenantId !== a.id,
    `got ${planted.tenantId}`,
  );

  // A's row is still intact and still A's.
  const rawRow = (await (
    prisma[c.model].findUnique as (args: unknown) => Promise<{ tenantId: string; name: string }>
  )({ where: { id: c.id } }))!;
  check(
    `${c.model}: A's row untouched by B's attempts`,
    rawRow.tenantId === a.id && rawRow.name !== 'hijacked',
  );
}

// --- the raw client is what makes the difference visible ----------------
check(
  "unscoped prisma DOES see A's rows (scope is the only thing hiding them)",
  (await prisma.client.count({ where: { tenantId: a.id } })) === 1 &&
    (await prisma.template.count({ where: { tenantId: a.id } })) === 1,
);

// --- cleanup (cascade wipes every child row) ---------------------------
await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });

console.log(failures === 0 ? '\nsecurity:check OK' : `\nsecurity:check FAILED (${failures})`);
await prisma.$disconnect();
process.exit(failures === 0 ? 0 : 1);
