/**
 * Deletes the throwaway tenants the Playwright happy-path specs create (backlog
 * X.5.3). They all use an `e2e-<timestamp>-…@example.test` email; this wipes any
 * that a crashed run left behind. Cascade removes all their child rows.
 *
 *   npm run e2e:cleanup -w @invoice-saas/api
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const { count } = await prisma.user.deleteMany({
  where: {
    email: { startsWith: 'e2e-', mode: 'insensitive' },
    AND: { email: { endsWith: '@example.test' } },
  },
});
console.log(`e2e:cleanup — removed ${count} throwaway tenant(s)`);
await prisma.$disconnect();
