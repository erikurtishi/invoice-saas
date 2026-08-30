/**
 * Sweep expired manual grants (backlog 6.3.3 — "scheduled job AND lazy check").
 * The lazy check in `resolveEntitlements` is the correctness guarantee; this is
 * the crontab companion so a dormant tenant's row and `users.tier` cache don't
 * sit stale until their next request.
 *
 *   npm run grants:expire -w @invoice-saas/api
 *   # crontab: 0 * * * * cd /path/to/app && npm run grants:expire -w @invoice-saas/api
 *
 * Only touches `source: MANUAL` rows — Stripe subscription lifecycle is owned by
 * the webhook handler.
 */
import { PrismaClient } from '@prisma/client';

import { sweepExpiredGrants } from '../src/services/manual-grant-service.js';

const prisma = new PrismaClient();

try {
  const { expired, tenants } = await sweepExpiredGrants();
  console.log(
    expired === 0
      ? 'grants:expire — nothing to do.'
      : `grants:expire — expired ${expired} grant(s) across ${tenants} tenant(s).`,
  );
} finally {
  await prisma.$disconnect();
}
