/**
 * Provisions the Stripe catalog for Epic 6.2 — idempotent, safe to re-run.
 *
 *  - one Product per plan (Basic, Premium — "one Product per plan", per Stripe's
 *    billing best practices), each with a single recurring EUR Price carrying a
 *    stable `lookup_key` (`basic_monthly` / `premium_monthly`). The API resolves
 *    the price by that key at runtime, so nothing here needs to be pasted into
 *    `.env` unless you want to pin exact ids.
 *  - a Customer Portal configuration allowing plan switch / cancel-at-period-end /
 *    payment-method + invoice history.
 *
 * Prices are integer minor units straight from `@invoice-saas/shared`'s
 * `PLAN_CATALOG` (CLAUDE.md: money is always minor units).
 *
 *   STRIPE_SECRET_KEY=rk_test_… npm run stripe:setup -w @invoice-saas/api
 */
import { PLAN_CATALOG } from '@invoice-saas/shared';
import Stripe from 'stripe';

import { env } from '../src/config/env.js';

if (!env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY is not set — nothing to do.');
  process.exit(1);
}
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { typescript: true });

interface PlanSpec {
  plan: 'BASIC' | 'PREMIUM';
  productName: string;
  lookupKey: string;
  priceMinor: number;
}

const PLANS: PlanSpec[] = [
  {
    plan: 'BASIC',
    productName: 'Invoice SaaS — Basic',
    lookupKey: 'basic_monthly',
    priceMinor: PLAN_CATALOG.BASIC.priceMinor,
  },
  {
    plan: 'PREMIUM',
    productName: 'Invoice SaaS — Premium',
    lookupKey: 'premium_monthly',
    priceMinor: PLAN_CATALOG.PREMIUM.priceMinor,
  },
];

async function ensurePlan(spec: PlanSpec): Promise<{ productId: string; priceId: string }> {
  const existing = await stripe.prices.list({
    lookup_keys: [spec.lookupKey],
    active: true,
    limit: 1,
  });
  const found = existing.data[0];
  if (found) {
    const productId = typeof found.product === 'string' ? found.product : found.product.id;
    const amountOk = found.unit_amount === spec.priceMinor && found.currency === 'eur';
    console.log(
      `${amountOk ? 'OK  ' : 'WARN'} ${spec.plan.padEnd(7)} price ${found.id} ` +
        `(${(found.unit_amount ?? 0) / 100} ${found.currency}/${found.recurring?.interval})` +
        (amountOk ? '' : `  — expected ${spec.priceMinor / 100} eur/month`),
    );
    return { productId, priceId: found.id };
  }

  const product = await stripe.products.create({
    name: spec.productName,
    metadata: { app: 'invoice-saas', plan: spec.plan },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: spec.priceMinor,
    currency: 'eur',
    recurring: { interval: 'month' },
    lookup_key: spec.lookupKey,
    transfer_lookup_key: true,
    metadata: { app: 'invoice-saas', plan: spec.plan },
  });
  console.log(
    `NEW  ${spec.plan.padEnd(7)} product ${product.id}  price ${price.id} ` +
      `(${spec.priceMinor / 100} eur/month, lookup_key=${spec.lookupKey})`,
  );
  return { productId: product.id, priceId: price.id };
}

async function ensurePortalConfiguration(
  plans: { productId: string; priceId: string }[],
): Promise<string> {
  const params: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: { headline: 'Invoice SaaS — manage your subscription' },
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id', 'name'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        products: plans.map((p) => ({ product: p.productId, prices: [p.priceId] })),
      },
    },
    metadata: { app: 'invoice-saas' },
  };

  const list = await stripe.billingPortal.configurations.list({ limit: 100 });
  const mine = list.data.find((c) => c.metadata?.app === 'invoice-saas');
  const config = mine
    ? await stripe.billingPortal.configurations.update(mine.id, params)
    : await stripe.billingPortal.configurations.create(params);
  console.log(`${mine ? 'OK  ' : 'NEW '} portal  configuration ${config.id}`);
  return config.id;
}

const results = [];
for (const spec of PLANS) {
  results.push(await ensurePlan(spec));
}
const portalConfigId = await ensurePortalConfiguration(results);

console.log('\n--- summary (optional .env pins) ---');
console.log(`STRIPE_PRICE_BASIC=${results[0]!.priceId}`);
console.log(`STRIPE_PRICE_PREMIUM=${results[1]!.priceId}`);
console.log(`STRIPE_PORTAL_CONFIG_ID=${portalConfigId}`);
console.log('\nstripe:setup complete.');
