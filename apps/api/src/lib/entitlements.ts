import type { UserTier } from '@prisma/client';

import { prisma } from '../db/client.js';
import { ApiError } from './api-error.js';

/**
 * The single seam where the app reads `user.tier` to decide what an account may do
 * (spec §9, backlog 3.3.6). Decision D19: this file exists so tier is branched on
 * in exactly one place even before Phase 6 — `6.1.2` swaps the bodies to resolve
 * `Subscription` records (Stripe + manual grants, decision D5) without touching
 * any call site. Until then, the `users.tier` column IS the answer (D14).
 *
 * TODO(6.1.2): replace the direct `tier` reads with the entitlement service.
 */

/** Basic and Premium can create and customise templates; Free gets the default only. */
export function canManageTemplates(tier: UserTier): boolean {
  return tier !== 'FREE';
}

/** Throws 403 with an upgrade-oriented message if the account can't manage templates. */
export async function requireCanManageTemplates(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true },
  });
  if (!user) throw ApiError.unauthorized();
  if (!canManageTemplates(user.tier)) {
    throw ApiError.forbidden(
      'Creating and editing templates is on the Basic and Premium plans. Upgrade to design your own.',
    );
  }
}
