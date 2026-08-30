import { PrismaClient } from '@prisma/client';

import { isProduction } from '../config/env.js';

/**
 * Single Prisma client for the process.
 *
 * `tsx watch` re-evaluates this module on every file change in dev, which would
 * otherwise open a fresh connection pool per reload and exhaust Postgres's
 * connection limit. Caching the instance on `globalThis` survives the reload;
 * production never reloads, so it skips the cache.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
