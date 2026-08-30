import { type CheckoutRequest, checkoutRequestSchema } from '@invoice-saas/shared';
import { type Request, Router } from 'express';

import { billingEnabled, createCheckoutUrl, createPortalUrl } from '../lib/billing/index.js';
import { resolveEntitlements } from '../lib/entitlements.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';

/**
 * Billing surface for the tenant's own account (backlog Epics 6.1 / 6.2). Mounted
 * at `/billing` in `index.ts`, behind `authenticate` only — payloads come from the
 * entitlement service and the Stripe port, not `req.db`.
 *
 * `GET  /billing/entitlements` → the `Entitlements` shape (6.1.2): effective tier,
 *   its source/expiry/renewal, and the invoice / AI allowances with usage.
 * `POST /billing/checkout`  `{ tier }` → `{ url }` of a Stripe Checkout Session
 *   (6.2.2). 503 when `STRIPE_SECRET_KEY` is unset.
 * `POST /billing/portal` → `{ url }` of a Customer Portal session (6.2.4). 409 if
 *   the account has never started billing.
 *
 * The Stripe webhook is **not** here — it needs the raw body and no auth, so it
 * is mounted separately in `index.ts` before `express.json()`.
 */
export const billingRouter: Router = Router();

billingRouter.use(authenticate);

billingRouter.get('/entitlements', async (req, res) => {
  res.json(await resolveEntitlements(req.auth!.userId));
});

billingRouter.get('/config', (_req, res) => {
  // Lets the web hide the checkout buttons when the server has no Stripe key,
  // rather than surfacing a 503 on click.
  res.json({ stripeEnabled: billingEnabled });
});

billingRouter.post(
  '/checkout',
  validate({ body: checkoutRequestSchema }),
  async (req: Request<never, unknown, CheckoutRequest>, res) => {
    const url = await createCheckoutUrl({ userId: req.auth!.userId, tier: req.body.tier });
    res.json({ url });
  },
);

billingRouter.post('/portal', async (req, res) => {
  const url = await createPortalUrl(req.auth!.userId);
  res.json({ url });
});
