import Stripe from 'stripe';

import { env } from '../../config/env.js';

/**
 * The one Stripe client for the process (backlog Epic 6.2). `null` when
 * `STRIPE_SECRET_KEY` is unset — the app still boots, and the billing endpoints
 * degrade to 503 (same "pluggable, degrade don't crash" shape as the `Mailer`
 * (D13) and `Storage` (D15) ports). **Nothing outside `lib/billing/` imports the
 * `stripe` package** — that boundary is the port.
 *
 * `apiVersion` is intentionally left at the SDK default: pinning a string the
 * installed SDK's types don't recognise breaks the build, and test-mode Epic 6.2
 * does not need version pinning. A hardening pass can pin it to the account's
 * version once the SDK is upgraded in lockstep.
 */
export const stripe: Stripe | null = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, { typescript: true })
  : null;

export const billingEnabled: boolean = stripe !== null;
