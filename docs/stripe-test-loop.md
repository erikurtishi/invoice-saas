# Stripe test-mode loop (backlog L4.2 / reused at V1.7.3)

Two layers prove the billing loop:

1. **Automated — `npm run stripe:check -w @invoice-saas/api`.** Runs the whole
   lifecycle against Stripe **test** infrastructure with no browser: `ensureStripeCustomer`
   → `createCheckoutUrl` (real `cs_test_…` URL) → `createPortalUrl` → webhook creates the
   `Subscription` row (BASIC/ACTIVE/STRIPE) → entitlements flip → **replay the same event
   id is a no-op** (idempotency) → price switch to PREMIUM (AI unlocked) → `past_due` →
   `PAST_DUE` still grants → `cancel_at_period_end` (access to period end, no renewal) →
   `deleted` → CANCELED → FREE → `verifyWebhook` accepts a good signature, rejects a bad
   one. This is the loop; run it in CI and before any billing change.

2. **Manual — the hosted Checkout + `stripe listen` forwarder.** Only this exercises the
   real browser redirect and the raw-body path through the live Express app
   (`app.post('/billing/webhook', express.raw(...))` at `index.ts:81`, before
   `express.json()` at `:83`; the path is also in `UNLIMITED_PATHS`).

## Manual run

Prereqs: Stripe **test** keys in `apps/api/.env` (`STRIPE_SECRET_KEY=rk_test_…` /
`sk_test_…`), `stripe` CLI (`brew install stripe/stripe-cli/stripe`), prices created
(`npm run stripe:setup -w @invoice-saas/api`).

1. `stripe login` (once).
2. Terminal A: `stripe listen --forward-to localhost:4000/billing/webhook` — copy the
   `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET` in `apps/api/.env`.
3. Terminal B: `npm run dev:api`  ·  Terminal C: `npm run dev:web`.
4. Sign up a fresh account. Create invoices until the **Free** plan limit blocks the next
   one (the paywall/upgrade prompt appears).
5. Click upgrade → **Checkout**. Pay with `4242 4242 4242 4242`, any future expiry, any
   CVC/ZIP. (`/stripe:test-cards` for more scenarios.)
6. Back in the app: entitlements have flipped — invoice limit gone, plan shows BASIC/
   PREMIUM. Terminal A shows `checkout.session.completed` +
   `customer.subscription.created` forwarded `[200]`.
7. Open **Manage billing** → Customer Portal. Switch plan (BASIC↔PREMIUM) → confirm the
   tier and AI entitlement follow within a few seconds.
8. In the Portal, **Cancel** the subscription. App shows "access until <period end>", no
   renewal date. Entitlements stay until the period end, then drop to FREE (test with
   `stripe subscriptions cancel <sub_id>` or a clock advance if you don't want to wait).
9. Idempotency spot-check: `stripe events resend <evt_id>` for one already-processed event
   → Terminal A shows `[200]`, no duplicate `Subscription` row, no entitlement change.

**Done when:** signup → Free limit → Checkout → entitlements flip → Portal → cancel →
entitlements drop all work locally in test mode, webhooks included, and a resent event is
a no-op.
