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

/**
 * Can this account create/issue another invoice right now?
 *
 * TODO(6.1.5): the real rule is "Free = 1 invoice generation, lifetime". That
 * needs the usage counter (`6.1.3`) and the entitlement service (`6.1.2`), both
 * Phase 6. Wired as the seam now — every invoice-creating endpoint already calls
 * `requireCanCreateInvoice`, so Phase 6 only fills in the body (D19 pattern: no
 * call-site changes).
 */
export function canCreateInvoice(_tier: UserTier): boolean {
  return true;
}

/** Throws 403 with an upgrade-oriented message when the invoice allowance is spent. */
export async function requireCanCreateInvoice(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true },
  });
  if (!user) throw ApiError.unauthorized();
  if (!canCreateInvoice(user.tier)) {
    throw ApiError.forbidden(
      'You’ve used the free invoice for this account. Upgrade to Basic or Premium for unlimited invoices.',
    );
  }
}
