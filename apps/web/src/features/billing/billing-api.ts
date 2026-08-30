import {
  type BillingRedirect,
  billingRedirectSchema,
  type CheckoutRequest,
  type Entitlements,
  entitlementsSchema,
} from '@invoice-saas/shared';

import { apiFetch } from '../../lib/api-client';

/**
 * Thin wrappers over `/billing` (backlog Epics 6.1 / 6.2). Same shape as the
 * other `features/<x>/<x>-api.ts` files; the TanStack Query wiring is in
 * `use-billing.ts`.
 *
 * Responses are validated against the shared schemas so a drift between what the
 * server enforces and what the UI gates on is caught at the boundary.
 */

export function fetchEntitlements(): Promise<Entitlements> {
  return apiFetch<unknown>('/billing/entitlements').then((body) => entitlementsSchema.parse(body));
}

/** Whether the server has Stripe configured — lets the web hide checkout buttons
 *  rather than surface a 503 on click. */
export function fetchBillingConfig(): Promise<{ stripeEnabled: boolean }> {
  return apiFetch<{ stripeEnabled: boolean }>('/billing/config');
}

export function startCheckout(tier: CheckoutRequest['tier']): Promise<BillingRedirect> {
  return apiFetch<unknown>('/billing/checkout', { method: 'POST', body: { tier } }).then((body) =>
    billingRedirectSchema.parse(body),
  );
}

export function openBillingPortal(): Promise<BillingRedirect> {
  return apiFetch<unknown>('/billing/portal', { method: 'POST' }).then((body) =>
    billingRedirectSchema.parse(body),
  );
}
