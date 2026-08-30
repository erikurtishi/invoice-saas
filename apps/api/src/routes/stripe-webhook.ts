import type { RequestHandler } from 'express';

import { verifyWebhook } from '../lib/billing/index.js';
import { handleStripeEvent } from '../services/stripe-webhook-service.js';

/**
 * `POST /billing/webhook` (backlog 6.2.3). Mounted in `index.ts` with
 * `express.raw()` **before** `express.json()` — signature verification needs the
 * exact bytes Stripe sent — and with no `authenticate` (the signature is the
 * auth).
 *
 * Deliberately does not go through the central `errorHandler`: Stripe cares about
 * the status code, not our JSON error body. 2xx = "got it, stop retrying";
 * 400 = permanently bad (bad signature); 5xx = "retry later" (our handler is
 * idempotent, so a retry after a transient DB error is safe).
 */
export const stripeWebhookHandler: RequestHandler = async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  let event;
  try {
    event = verifyWebhook(req.body as Buffer, signature);
  } catch (err) {
    console.warn(`[stripe] webhook rejected: ${(err as Error).message}`);
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    return;
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    console.error(`[stripe] handler failed for ${event.type} (${event.id})`, err);
    res.status(500).send('handler error');
    return;
  }

  res.json({ received: true });
};
