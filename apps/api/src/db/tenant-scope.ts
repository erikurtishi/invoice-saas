import { Prisma } from '@prisma/client';

import { prisma } from './client.js';

/**
 * Prisma models whose rows carry a `tenantId` column (decision D3: named `tenantId`
 * on every child table, referencing `users.id` — `User` itself is the tenant, not
 * scoped to one). Add a model's name here in the same migration that adds its
 * `tenantId` column; nothing else changes — every query through `scopedPrisma()` is
 * scoped automatically from that point on.
 *
 * Empty for now: 0.2.2 adds only `User`, which owns data rather than belonging to a
 * tenant. This is the central mechanism backlog 0.2.4 asks for — built ahead of its
 * first caller so Client (2.1), Product (2.2), Template (3.3) and Invoice (4.1)
 * inherit the scope for free instead of an ad-hoc check per route.
 */
const TENANT_SCOPED_MODELS: readonly Prisma.ModelName[] = [
  'Client',
  'Product',
  'Template',
  'Invoice',
  'InvoiceHistoryEvent',
  'InvoiceNumberSequence',
  'InvoiceNumberingSetting',
  // Billing (Epic 6.1). Listed as a guard so a stray `req.db.subscription` /
  // `req.db.usageCounter` read can't cross tenants — but the sanctioned accessor
  // is `lib/entitlements.ts`, which uses the unscoped client with an explicit
  // `tenantId` (it also runs from auth/session contexts that have no `req.db`).
  'Subscription',
  'UsageCounter',
  // AI drafting (Epic 7.1). Same arrangement as the billing rows — a guard against
  // a stray `req.db.aiGenerationLog` read crossing tenants, while the sanctioned
  // writer (`services/ai-draft-service.ts`) uses the unscoped client with an
  // explicit `tenantId`. Admin cost reads (8.4.1) go through the scoped client.
  'AiGenerationLog',
  // Support tickets (Epic 8.6) carry a `tenantId` too. Admin-only in practice —
  // `services/admin-support-service.ts` uses the unscoped client — so this is
  // purely a guard against a stray `req.db.supportTicket` read.
  'SupportTicket',
];

/** Operations that filter rows via a `where` clause. */
const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/** Operations that create rows via a `data` payload. */
const DATA_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

/**
 * Returns a Prisma client where every query against a tenant-scoped model is
 * confined to `tenantId`, both on the way out (`where`) and on the way in (`data`).
 * This is the *only* sanctioned way a route handler reaches the database for
 * tenant-owned data (backlog 0.2.4: "write this once, centrally — never per-route").
 * `middleware/tenant.ts` is what attaches one of these to `req` per request.
 *
 * A raw `$queryRaw`/`$executeRaw` call bypasses this extension entirely — the only
 * sanctioned use of those is the gapless-numbering transaction (`4.1.3`, decision
 * D11), which must carry its own explicit tenant predicate.
 */
export function scopedPrisma(tenantId: string) {
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.includes(model)) {
            return query(args);
          }

          if (WHERE_OPERATIONS.has(operation)) {
            const scoped = args as { where?: Record<string, unknown> };
            scoped.where = { ...scoped.where, tenantId };
          } else if (DATA_OPERATIONS.has(operation)) {
            const scoped = args as {
              data?: Record<string, unknown> | Record<string, unknown>[];
            };
            scoped.data = Array.isArray(scoped.data)
              ? scoped.data.map((row) => ({ ...row, tenantId }))
              : { ...scoped.data, tenantId };
          }

          return query(args);
        },
      },
    },
  });
}

export type ScopedPrismaClient = ReturnType<typeof scopedPrisma>;
