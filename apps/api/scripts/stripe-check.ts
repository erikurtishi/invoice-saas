/**
 * Stripe integration check (backlog Epic 6.2). Exercises the real Stripe test
 * sandbox + our webhook service end-to-end, without a browser:
 *
 *  - `ensureStripeCustomer` creates + persists a `cus_…` with `metadata.userId`
 *  - `createCheckoutUrl` / `createPortalUrl` return hosted Stripe URLs
 *  - a real `subscriptions.create` → `customer.subscription.created` webhook →
 *    our `Subscription` row (tier BASIC, ACTIVE, source STRIPE) + `users.tier`
 *    cache flipped, entitlements say BASIC / unlimited / canManageBilling
 *  - webhook idempotency: replaying the same event id is a no-op
 *  - price switch → `customer.subscription.updated` → tier PREMIUM, AI unlocked
 *  - `past_due` still grants (grace = Stripe dunning), `cancel_at_period_end`
 *    surfaces an end date while access continues
 *  - `customer.subscription.deleted` → CANCELED, access drops to FREE
 *  - signature verification accepts a correctly-signed body, rejects a bad one
 *
 *   STRIPE_SECRET_KEY=rk_test_… STRIPE_WEBHOOK_SECRET=whsec_test npm run stripe:check -w @invoice-saas/api
 *
 * `STRIPE_WEBHOOK_SECRET` only needs to be any `whsec_…` string for the signing
 * round-trip below — this script signs its own payloads.
 */
import { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';

import { env } from '../src/config/env.js';
import {
  createCheckoutUrl,
  createPortalUrl,
  ensureStripeCustomer,
} from '../src/lib/billing/index.js';
import { stripe } from '../src/lib/billing/stripe.js';
import { verifyWebhook } from '../src/lib/billing/index.js';
import { resolveEntitlements } from '../src/lib/entitlements.js';
import { handleStripeEvent } from '../src/services/stripe-webhook-service.js';

if (!stripe) {
  console.error('STRIPE_SECRET_KEY is not set — cannot run.');
  process.exit(1);
}
const s: Stripe = stripe;
const prisma = new PrismaClient();

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  — ${detail}` : ''}`);
}

let evtSeq = 0;
function fakeEvent(type: string, object: unknown): Stripe.Event {
  evtSeq += 1;
  return {
    id: `evt_check_${Date.now()}_${evtSeq}`,
    object: 'event',
    type,
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: { object },
  } as unknown as Stripe.Event;
}

const tenant = await prisma.user.create({
  data: {
    email: `stripe-check+${Date.now()}@example.test`,
    passwordHash: 'x',
    businessName: 'Stripe Check Co',
  },
});

const createdSubIds: string[] = [];
const eventIds: string[] = [];

try {
  // --- customer -----------------------------------------------------------
  const customerId = await ensureStripeCustomer(tenant.id);
  const again = await ensureStripeCustomer(tenant.id);
  check(
    'ensureStripeCustomer creates + persists one customer',
    customerId.startsWith('cus_') && again === customerId,
  );
  const persisted = await prisma.user.findUnique({
    where: { id: tenant.id },
    select: { stripeCustomerId: true },
  });
  check('users.stripeCustomerId is persisted', persisted?.stripeCustomerId === customerId);
  const stripeCustomer = await s.customers.retrieve(customerId);
  check(
    'Stripe customer carries metadata.userId',
    !stripeCustomer.deleted && stripeCustomer.metadata?.userId === tenant.id,
  );

  // --- checkout + portal URLs ------------------------------------------
  const checkoutUrl = await createCheckoutUrl({ userId: tenant.id, tier: 'BASIC' });
  check(
    'createCheckoutUrl returns a hosted Checkout URL',
    /^https:\/\/checkout\.stripe\.com\//.test(checkoutUrl),
    checkoutUrl.slice(0, 48),
  );
  const portalUrl = await createPortalUrl(tenant.id);
  check(
    'createPortalUrl returns a hosted Portal URL',
    /^https:\/\/billing\.stripe\.com\//.test(portalUrl),
    portalUrl.slice(0, 48),
  );

  // --- a real subscription, then the webhook that mirrors it ----------
  const pm = await s.paymentMethods.attach('pm_card_visa', { customer: customerId });
  await s.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });

  const sub = await s.subscriptions.create({
    customer: customerId,
    items: [{ price: env.STRIPE_PRICE_BASIC! }],
    metadata: { userId: tenant.id },
  });
  createdSubIds.push(sub.id);

  const createdEvt = fakeEvent('customer.subscription.created', sub);
  eventIds.push(createdEvt.id);
  await handleStripeEvent(createdEvt);

  const row = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
  check(
    'webhook created our Subscription row (BASIC / ACTIVE / STRIPE)',
    row?.tier === 'BASIC' &&
      row.status === 'ACTIVE' &&
      row.source === 'STRIPE' &&
      row.tenantId === tenant.id,
    row ? `${row.tier}/${row.status}` : 'missing',
  );
  check(
    'row captured currentPeriodEnd + priceId',
    row?.currentPeriodEnd instanceof Date && row?.stripePriceId === env.STRIPE_PRICE_BASIC,
  );

  let ent = await resolveEntitlements(tenant.id);
  check(
    'entitlements: BASIC, unlimited invoices, billing manageable, renews',
    ent.tier === 'BASIC' &&
      ent.invoices.unlimited &&
      ent.canManageBilling &&
      ent.source === 'stripe' &&
      ent.renewsAt !== null,
    JSON.stringify({ tier: ent.tier, renewsAt: ent.renewsAt }),
  );
  const cached = await prisma.user.findUnique({ where: { id: tenant.id }, select: { tier: true } });
  check('users.tier cache flipped to BASIC', cached?.tier === 'BASIC');

  // --- idempotency ---------------------------------------------------
  await handleStripeEvent(createdEvt); // replay same id
  const rowCount = await prisma.subscription.count({ where: { stripeSubscriptionId: sub.id } });
  const evtCount = await prisma.processedStripeEvent.count({ where: { id: createdEvt.id } });
  check('replaying the same event id is a no-op', rowCount === 1 && evtCount === 1);

  // --- price switch: BASIC → PREMIUM -------------------------------
  const updated = await s.subscriptions.update(sub.id, {
    items: [{ id: sub.items.data[0]!.id, price: env.STRIPE_PRICE_PREMIUM! }],
    proration_behavior: 'none',
  });
  const upEvt = fakeEvent('customer.subscription.updated', updated);
  eventIds.push(upEvt.id);
  await handleStripeEvent(upEvt);
  ent = await resolveEntitlements(tenant.id);
  check(
    'price switch → PREMIUM, AI unlocked',
    ent.tier === 'PREMIUM' && ent.canUseAi && ent.ai.limit === 50,
    JSON.stringify({ tier: ent.tier, ai: ent.ai.limit }),
  );

  // --- past_due still grants (grace = Stripe dunning) ------------
  const pastDue = { ...updated, status: 'past_due' as Stripe.Subscription.Status };
  const pdEvt = fakeEvent('customer.subscription.updated', pastDue);
  eventIds.push(pdEvt.id);
  await handleStripeEvent(pdEvt);
  const pdRow = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
  ent = await resolveEntitlements(tenant.id);
  check(
    'past_due maps to PAST_DUE but still grants PREMIUM',
    pdRow?.status === 'PAST_DUE' && ent.tier === 'PREMIUM',
  );

  // recover
  await handleStripeEvent(fakeEvent('customer.subscription.updated', updated));

  // --- cancel at period end -------------------------------------
  const cancelling = await s.subscriptions.update(sub.id, { cancel_at_period_end: true });
  const cEvt = fakeEvent('customer.subscription.updated', cancelling);
  eventIds.push(cEvt.id);
  await handleStripeEvent(cEvt);
  ent = await resolveEntitlements(tenant.id);
  check(
    'cancel_at_period_end: access continues, end date shown, no renewal',
    ent.tier === 'PREMIUM' &&
      ent.cancelAtPeriodEnd &&
      ent.accessEndsAt !== null &&
      ent.renewsAt === null,
    JSON.stringify({ endsAt: ent.accessEndsAt, cancel: ent.cancelAtPeriodEnd }),
  );

  // --- subscription deleted → downgrade -----------------------
  const deleted = await s.subscriptions.cancel(sub.id);
  const dEvt = fakeEvent('customer.subscription.deleted', deleted);
  eventIds.push(dEvt.id);
  await handleStripeEvent(dEvt);
  const delRow = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
  ent = await resolveEntitlements(tenant.id);
  const cacheBack = await prisma.user.findUnique({
    where: { id: tenant.id },
    select: { tier: true },
  });
  check(
    'deleted → CANCELED, access drops to FREE, cache reverts',
    delRow?.status === 'CANCELED' &&
      delRow.endDate !== null &&
      ent.tier === 'FREE' &&
      cacheBack?.tier === 'FREE',
    JSON.stringify({ status: delRow?.status, tier: ent.tier }),
  );

  // --- signature verification ---------------------------------
  const body = JSON.stringify({ id: 'evt_sig', object: 'event', type: 'ping' });
  const header = s.webhooks.generateTestHeaderString({
    payload: body,
    secret: env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test',
  });
  let verified = false;
  try {
    verifyWebhook(body, header);
    verified = true;
  } catch {
    verified = false;
  }
  check('verifyWebhook accepts a correctly-signed body', verified);
  let rejected = false;
  try {
    verifyWebhook(body, 't=1,v1=deadbeef');
  } catch {
    rejected = true;
  }
  check('verifyWebhook rejects a bad signature', rejected);
} finally {
  for (const id of createdSubIds) {
    await s.subscriptions.cancel(id).catch(() => undefined);
  }
  await prisma.processedStripeEvent.deleteMany({ where: { id: { in: eventIds } } });
  const cust = await prisma.user.findUnique({
    where: { id: tenant.id },
    select: { stripeCustomerId: true },
  });
  if (cust?.stripeCustomerId) await s.customers.del(cust.stripeCustomerId).catch(() => undefined);
  await prisma.user.delete({ where: { id: tenant.id } });
  await prisma.$disconnect();
}

console.log(failures === 0 ? '\nstripe: all checks passed.' : `\nstripe: ${failures} FAILED.`);
process.exit(failures === 0 ? 0 : 1);
