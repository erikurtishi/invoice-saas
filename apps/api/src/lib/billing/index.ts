import type { SubscriptionStatus, UserTier } from '@prisma/client';
import type Stripe from 'stripe';

import { appUrl, env } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import { ApiError } from '../api-error.js';
import { billingEnabled, stripe } from './stripe.js';

export { billingEnabled };

/** The two paid plans, and the `lookup_key` each plan's Price carries in Stripe
 *  (created by `scripts/stripe-setup.ts`). */
export const PLAN_LOOKUP_KEYS: Record<'BASIC' | 'PREMIUM', string> = {
  BASIC: 'basic_monthly',
  PREMIUM: 'premium_monthly',
};

function requireStripe(): Stripe {
  if (!stripe) {
    throw new ApiError(
      'INTERNAL_ERROR',
      'Card billing is not configured on this server. Set STRIPE_SECRET_KEY to enable it.',
      { status: 503 },
    );
  }
  return stripe;
}

// --- price ↔ tier resolution (memoised) ----------------------------------

const priceIdByPlan = new Map<'BASIC' | 'PREMIUM', string>();
const planByPriceId = new Map<string, 'BASIC' | 'PREMIUM'>();

function envPriceId(plan: 'BASIC' | 'PREMIUM'): string | undefined {
  return plan === 'BASIC' ? env.STRIPE_PRICE_BASIC : env.STRIPE_PRICE_PREMIUM;
}

/** The Stripe Price id for a plan — env override first, else looked up by
 *  `lookup_key` and cached. */
export async function resolvePriceId(plan: 'BASIC' | 'PREMIUM'): Promise<string> {
  const override = envPriceId(plan);
  if (override) return override;

  const cached = priceIdByPlan.get(plan);
  if (cached) return cached;

  const s = requireStripe();
  const { data } = await s.prices.list({
    lookup_keys: [PLAN_LOOKUP_KEYS[plan]],
    active: true,
    limit: 1,
  });
  const price = data[0];
  if (!price) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `No active Stripe Price with lookup_key "${PLAN_LOOKUP_KEYS[plan]}". Run: npm run stripe:setup -w @invoice-saas/api`,
      { status: 503 },
    );
  }
  priceIdByPlan.set(plan, price.id);
  planByPriceId.set(price.id, plan);
  return price.id;
}

/** Which paid plan a Stripe Price id represents, or `null` if it's unrecognised. */
export async function planForPriceId(priceId: string): Promise<'BASIC' | 'PREMIUM' | null> {
  if (env.STRIPE_PRICE_BASIC === priceId) return 'BASIC';
  if (env.STRIPE_PRICE_PREMIUM === priceId) return 'PREMIUM';

  const cached = planByPriceId.get(priceId);
  if (cached) return cached;

  // Populate the cache from lookup_keys, then re-check.
  await Promise.all([resolvePriceId('BASIC'), resolvePriceId('PREMIUM')]).catch(() => undefined);
  return planByPriceId.get(priceId) ?? null;
}

// --- customer ----------------------------------------------------------

/**
 * Returns the tenant's Stripe Customer id, creating (and persisting) one on first
 * use. The customer carries `metadata.userId` so a webhook can resolve the tenant
 * even before `users.stripeCustomerId` is set.
 */
export async function ensureStripeCustomer(userId: string): Promise<string> {
  const s = requireStripe();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, businessName: true, stripeCustomerId: true },
  });
  if (!user) throw ApiError.unauthorized();
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await s.customers.create({
    email: user.email,
    name: user.businessName,
    metadata: { userId: user.id },
  });
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

// --- checkout & portal ------------------------------------------------

/** Creates a subscription Checkout Session and returns its hosted URL (6.2.2). */
export async function createCheckoutUrl(params: {
  userId: string;
  tier: 'BASIC' | 'PREMIUM';
}): Promise<string> {
  const s = requireStripe();
  const customerId = await ensureStripeCustomer(params.userId);
  const price = await resolvePriceId(params.tier);

  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: params.userId,
    // No `payment_method_types` — let Stripe pick eligible methods dynamically.
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { userId: params.userId } },
    success_url: `${appUrl}/pricing?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=cancelled`,
  });
  if (!session.url) {
    throw new ApiError('INTERNAL_ERROR', 'Stripe did not return a checkout URL.', { status: 502 });
  }
  return session.url;
}

/** Creates a Customer Portal session and returns its URL (6.2.4). */
export async function createPortalUrl(userId: string): Promise<string> {
  const s = requireStripe();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  if (!user) throw ApiError.unauthorized();
  if (!user.stripeCustomerId) {
    throw ApiError.conflict('This account has no billing set up yet. Start a plan first.');
  }

  const session = await s.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl}/pricing`,
    ...(env.STRIPE_PORTAL_CONFIG_ID ? { configuration: env.STRIPE_PORTAL_CONFIG_ID } : {}),
  });
  return session.url;
}

// --- webhooks --------------------------------------------------------

/** Verifies the Stripe signature and returns the parsed event (6.2.3). */
export function verifyWebhook(payload: Buffer | string, signature: string): Stripe.Event {
  const s = requireStripe();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new ApiError('INTERNAL_ERROR', 'STRIPE_WEBHOOK_SECRET is not set.', { status: 503 });
  }
  return s.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
}

/** Retrieves a subscription from Stripe (used by the webhook handler to expand
 *  the object referenced by a `checkout.session.completed`). */
export async function retrieveSubscription(id: string): Promise<Stripe.Subscription> {
  return requireStripe().subscriptions.retrieve(id);
}

/** Retrieves a customer (used only as a last-resort tenant lookup in the webhook). */
export async function retrieveCustomer(
  id: string,
): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
  return requireStripe().customers.retrieve(id);
}

// --- mapping Stripe → our model -------------------------------------

/** Stripe's subscription `status` → our four-state `SubscriptionStatus`.
 *  `PAST_DUE` still grants access (decision: mirror Stripe dunning — the grace
 *  period is Stripe's own retry schedule, ending in `customer.subscription.deleted`). */
export function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'ACTIVE';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'canceled':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return 'CANCELED';
    default:
      return 'CANCELED';
  }
}

export interface NormalizedSubscription {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string | null;
  tier: UserTier | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** When access should stop: the period end if cancelling at period end, else
   *  now if already cancelled, else null (keeps renewing). */
  endDate: Date | null;
}

function periodEndOf(sub: Stripe.Subscription): Date | null {
  // API ≥ 2025-03 moved `current_period_end` onto each subscription item; older
  // shapes keep it on the subscription. Handle both.
  const itemEnd = sub.items.data[0]?.current_period_end;
  const raw = itemEnd ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof raw === 'number' ? new Date(raw * 1000) : null;
}

/** Flattens a Stripe subscription into the columns of our `Subscription` row. */
export async function normalizeSubscription(
  sub: Stripe.Subscription,
): Promise<NormalizedSubscription> {
  const priceId = sub.items.data[0]?.price.id ?? null;
  const plan = priceId ? await planForPriceId(priceId) : null;
  const status = mapStripeStatus(sub.status);
  const currentPeriodEnd = periodEndOf(sub);
  const cancelAtPeriodEnd = sub.cancel_at_period_end;

  let endDate: Date | null = null;
  if (status === 'CANCELED') {
    endDate = sub.ended_at ? new Date(sub.ended_at * 1000) : new Date();
  } else if (cancelAtPeriodEnd) {
    endDate = currentPeriodEnd;
  }

  return {
    stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripePriceId: priceId,
    tier: plan,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    endDate,
  };
}
