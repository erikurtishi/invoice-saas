import { useMutation, useQuery } from '@tanstack/react-query';
import type { CheckoutRequest, Entitlements } from '@invoice-saas/shared';

import { HttpError } from '../../lib/http-error';
import {
  fetchBillingConfig,
  fetchEntitlements,
  openBillingPortal,
  startCheckout,
} from './billing-api';

/**
 * Billing as TanStack Query (backlog Epics 6.1 / 6.2). Entitlements are read
 * through `<QueryBoundary>` on the pricing page and directly (with a fallback)
 * where a screen just needs a gating hint — the server re-checks every gated
 * action regardless (6.1.4).
 *
 * Checkout / portal are mutations that resolve to a Stripe hosted URL; the caller
 * sends the browser there with `window.location.assign`.
 */

export const billingKeys = {
  all: ['billing'] as const,
  entitlements: () => [...billingKeys.all, 'entitlements'] as const,
  config: () => [...billingKeys.all, 'config'] as const,
};

export function useEntitlements() {
  return useQuery<Entitlements, HttpError>({
    queryKey: billingKeys.entitlements(),
    queryFn: fetchEntitlements,
    staleTime: 60 * 1000,
  });
}

export function useBillingConfig() {
  return useQuery<{ stripeEnabled: boolean }, HttpError>({
    queryKey: billingKeys.config(),
    queryFn: fetchBillingConfig,
    staleTime: 10 * 60 * 1000,
  });
}

export function useStartCheckout() {
  return useMutation<{ url: string }, HttpError, CheckoutRequest['tier']>({
    mutationFn: (tier) => startCheckout(tier),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

export function useOpenBillingPortal() {
  return useMutation<{ url: string }, HttpError, void>({
    mutationFn: () => openBillingPortal(),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}
