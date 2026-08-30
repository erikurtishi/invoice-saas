import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';

import { prisma } from '../db/client.js';
import {
  normalizeSubscription,
  retrieveCustomer,
  retrieveSubscription,
} from '../lib/billing/index.js';
import { resolveEntitlements } from '../lib/entitlements.js';

/**
 * Applies a **signature-verified** Stripe event to our data model (backlog
 * 6.2.3). Idempotent: the event id is claimed in `processed_stripe_events` before
 * any work, so a duplicate delivery (Stripe retries, or `stripe listen` + a live
 * endpoint both firing) is a no-op.
 *
 * Every subscription-shaped event funnels through `upsertFromStripe`, which
 * writes one `Subscription` row per `stripeSubscriptionId` and then refreshes the
 * `users.tier` cache via the entitlement service — nothing else in the codebase
 * reads Stripe state (decision D22).
 */

const HANDLED: ReadonlySet<string> = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.paid',
]);

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  try {
    await prisma.processedStripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    if (isUniqueViolation(err)) return; // already processed
    throw err;
  }

  if (!HANDLED.has(event.type)) return;

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription' || !session.subscription) return;
      const subId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const userIdHint = session.client_reference_id ?? null;
      if (userIdHint && session.customer) {
        const customerId =
          typeof session.customer === 'string' ? session.customer : session.customer.id;
        await prisma.user
          .update({ where: { id: userIdHint }, data: { stripeCustomerId: customerId } })
          .catch(() => undefined);
      }
      await upsertFromStripe(await retrieveSubscription(subId), userIdHint);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await upsertFromStripe(
        sub,
        typeof sub.metadata?.userId === 'string' ? sub.metadata.userId : null,
      );
      break;
    }

    case 'invoice.payment_failed':
    case 'invoice.paid': {
      const invoice = event.data.object;
      const subId = invoiceSubscriptionId(invoice);
      if (!subId) return;
      await upsertFromStripe(await retrieveSubscription(subId), null);
      break;
    }
  }
}

async function upsertFromStripe(
  sub: Stripe.Subscription,
  userIdHint: string | null,
): Promise<void> {
  const norm = await normalizeSubscription(sub);
  const tenantId = await resolveTenantId(norm.stripeCustomerId, userIdHint);
  if (!tenantId) {
    console.warn(
      `[stripe] no tenant for customer ${norm.stripeCustomerId} (sub ${norm.stripeSubscriptionId}) — skipped`,
    );
    return;
  }

  const startDate = new Date((sub.start_date ?? sub.created) * 1000);

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: norm.stripeSubscriptionId },
    create: {
      tenantId,
      source: 'STRIPE',
      // Our two Prices always resolve to a tier; the fallback only guards a
      // manually-created test sub on some other price.
      tier: norm.tier ?? 'BASIC',
      status: norm.status,
      startDate,
      endDate: norm.endDate,
      stripeSubscriptionId: norm.stripeSubscriptionId,
      stripePriceId: norm.stripePriceId,
      currentPeriodEnd: norm.currentPeriodEnd,
      cancelAtPeriodEnd: norm.cancelAtPeriodEnd,
    },
    update: {
      ...(norm.tier ? { tier: norm.tier } : {}),
      status: norm.status,
      endDate: norm.endDate,
      stripePriceId: norm.stripePriceId,
      currentPeriodEnd: norm.currentPeriodEnd,
      cancelAtPeriodEnd: norm.cancelAtPeriodEnd,
    },
  });

  // Keep `users.tier` (the AuthUser cache) in step immediately rather than
  // waiting for the tenant's next gated action to reconcile it.
  await resolveEntitlements(tenantId).catch(() => undefined);
}

/** Resolve our tenant from the Stripe customer: by the persisted id, then by the
 *  `client_reference_id` / `subscription.metadata.userId` hint, then by the
 *  customer's own `metadata.userId`. Backfills `users.stripeCustomerId` when it
 *  learns the link. */
async function resolveTenantId(
  customerId: string,
  userIdHint: string | null,
): Promise<string | null> {
  const byCustomer = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (byCustomer) return byCustomer.id;

  if (userIdHint) {
    const byHint = await prisma.user.findUnique({
      where: { id: userIdHint },
      select: { id: true },
    });
    if (byHint) {
      await linkCustomer(userIdHint, customerId);
      return userIdHint;
    }
  }

  const customer = await retrieveCustomer(customerId).catch(() => null);
  const metaUserId =
    customer && !customer.deleted && typeof customer.metadata?.userId === 'string'
      ? customer.metadata.userId
      : undefined;
  if (metaUserId) {
    const byMeta = await prisma.user.findUnique({
      where: { id: metaUserId },
      select: { id: true },
    });
    if (byMeta) {
      await linkCustomer(metaUserId, customerId);
      return metaUserId;
    }
  }

  return null;
}

async function linkCustomer(userId: string, customerId: string): Promise<void> {
  await prisma.user
    .update({ where: { id: userId }, data: { stripeCustomerId: customerId } })
    .catch(() => undefined); // a unique clash means another row already owns it — leave it
}

/** The subscription id an invoice belongs to, across API-version shapes. */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object') return direct.id;

  const parentSub = invoice.parent?.subscription_details?.subscription;
  if (typeof parentSub === 'string') return parentSub;
  if (parentSub && typeof parentSub === 'object') return parentSub.id;

  const lineSub = (
    invoice.lines?.data?.[0] as unknown as { subscription?: string | { id: string } } | undefined
  )?.subscription;
  if (typeof lineSub === 'string') return lineSub;
  if (lineSub && typeof lineSub === 'object') return lineSub.id;

  return null;
}
