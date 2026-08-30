import {
  PLAN_CATALOG,
  PREMIUM_AI_MONTHLY_LIMIT,
  type Entitlements,
  type UserTierName,
} from '@invoice-saas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Minus } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { QueryBoundary } from '../../components/state/query-boundary';
import { Button, Card, CardContent, CardHeader, CardTitle } from '../../components/ui';
import { Skeleton } from '../../components/ui/skeleton';
import {
  billingKeys,
  useBillingConfig,
  useEntitlements,
  useOpenBillingPortal,
  useStartCheckout,
} from '../../features/billing/use-billing';
import { useToast } from '../../hooks/use-toast';
import { cn } from '../../lib/cn';
import { toUserMessage } from '../../lib/error-message';
import { formatDate } from '../../lib/format-time';

/** TODO(X.1.1): placeholder copy, see decision D9. */
const COPY = {
  title: 'Plan & billing',
  subtitle: "Your current plan and what each one includes. You're on the Free plan by default.",
  yourPlan: 'Your plan',
  manageBilling: 'Manage billing',
  checkoutDisabled:
    'Card checkout is not enabled on this server yet. Ask an admin to set a plan up for you.',
  successBanner: 'Payment received — your plan updates in a moment.',
  cancelledBanner: 'Checkout cancelled. Nothing was charged.',
  current: 'Current plan',
  upgrade: 'Upgrade',
  changePlan: 'Change plan',
  downgrade: 'Downgrade',
  comingSoon: 'Coming soon',
  checkoutError: "Couldn't start checkout. Try again.",
  portalError: "Couldn't open the billing portal. Try again.",
} as const;

const TIER_LABEL: Record<UserTierName, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  PREMIUM: 'Premium',
};

const TIER_ORDER: readonly UserTierName[] = ['FREE', 'BASIC', 'PREMIUM'];

function formatEur(minor: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(minor / 100);
}

function priceLabel(tier: UserTierName): string {
  const { priceMinor } = PLAN_CATALOG[tier];
  return priceMinor === 0 ? 'Free' : `${formatEur(priceMinor)} / mo`;
}

function invoicesLabel(tier: UserTierName): string {
  const { invoices } = PLAN_CATALOG[tier];
  if (invoices.kind === 'unlimited') return 'Unlimited';
  return invoices.lifetimeLimit === 1
    ? '1 invoice, lifetime'
    : `${invoices.lifetimeLimit} invoices, lifetime`;
}

function templatesLabel(tier: UserTierName): string {
  return PLAN_CATALOG[tier].templates === 'full-editor'
    ? 'Unlimited, full editor'
    : 'Default template only';
}

// --- "Your plan" summary ---------------------------------------------------

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </li>
  );
}

function YourPlanSummary({ entitlements }: { entitlements: Entitlements }) {
  const { tier, invoices, ai, canUseAi, accessEndsAt, renewsAt, cancelAtPeriodEnd } = entitlements;
  const atLimit = !invoices.unlimited && (invoices.remaining ?? 0) <= 0;

  return (
    <ul className="space-y-2 text-sm">
      <SummaryRow label="Current plan" value={<strong>{TIER_LABEL[tier]}</strong>} />
      <SummaryRow
        label="Invoices"
        value={
          invoices.unlimited ? (
            'Unlimited'
          ) : (
            <span className={atLimit ? 'text-destructive' : undefined}>
              {invoices.used} / {invoices.limit} used{atLimit ? ' — limit reached' : ''}
            </span>
          )
        }
      />
      <SummaryRow
        label={canUseAi ? 'AI drafts this month' : 'AI drafting'}
        value={
          canUseAi
            ? `${ai.used} / ${ai.limit} used${
                ai.periodResetsAt ? ` — resets ${formatDate(ai.periodResetsAt)}` : ''
              }`
            : 'Premium only'
        }
      />
      {cancelAtPeriodEnd && accessEndsAt && (
        <SummaryRow label="Cancels on" value={formatDate(accessEndsAt)} />
      )}
      {!cancelAtPeriodEnd && accessEndsAt && (
        <SummaryRow label="Access ends" value={formatDate(accessEndsAt)} />
      )}
      {renewsAt && <SummaryRow label="Renews on" value={formatDate(renewsAt)} />}
    </ul>
  );
}

// --- comparison table ---------------------------------------------------

function FeatureCell({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 text-sm text-foreground">{children}</td>;
}

interface CtaState {
  currentTier: UserTierName | undefined;
  stripeEnabled: boolean;
  canManageBilling: boolean;
  busy: boolean;
  onCheckout: (tier: 'BASIC' | 'PREMIUM') => void;
  onPortal: () => void;
}

function PlanCta({ tier, state }: { tier: UserTierName; state: CtaState }) {
  const isCurrent = state.currentTier === tier;

  if (isCurrent) {
    return (
      <span className="inline-flex h-8 items-center rounded-md border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary">
        {COPY.current}
      </span>
    );
  }

  // Free column for a paid account → the way "down" is the Customer Portal.
  if (tier === 'FREE') {
    return state.canManageBilling ? (
      <Button size="sm" variant="outline" isLoading={state.busy} onClick={state.onPortal}>
        {COPY.downgrade}
      </Button>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    );
  }

  if (!state.stripeEnabled) {
    return (
      <Button size="sm" variant="outline" disabled title={COPY.checkoutDisabled}>
        {COPY.comingSoon}
      </Button>
    );
  }

  // Already subscribed → plan changes go through the portal (Checkout would open a
  // second subscription); otherwise start a Checkout Session for this tier.
  return state.canManageBilling ? (
    <Button size="sm" variant="outline" isLoading={state.busy} onClick={state.onPortal}>
      {COPY.changePlan}
    </Button>
  ) : (
    <Button size="sm" isLoading={state.busy} onClick={() => state.onCheckout(tier)}>
      {COPY.upgrade}
    </Button>
  );
}

function PlanComparison({ cta }: { cta: CtaState }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Feature
            </th>
            {TIER_ORDER.map((tier) => (
              <th
                key={tier}
                className={cn('px-4 py-3 text-left', cta.currentTier === tier && 'bg-primary/5')}
              >
                <span className="block text-sm font-semibold text-foreground">
                  {TIER_LABEL[tier]}
                </span>
                <span className="block text-xs text-muted-foreground">{priceLabel(tier)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
              Invoices
            </th>
            {TIER_ORDER.map((tier) => (
              <FeatureCell key={tier}>{invoicesLabel(tier)}</FeatureCell>
            ))}
          </tr>
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
              Templates
            </th>
            {TIER_ORDER.map((tier) => (
              <FeatureCell key={tier}>{templatesLabel(tier)}</FeatureCell>
            ))}
          </tr>
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
              AI drafting
            </th>
            {TIER_ORDER.map((tier) => (
              <FeatureCell key={tier}>
                {PLAN_CATALOG[tier].ai ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="size-4 text-primary" aria-hidden />
                    {PREMIUM_AI_MONTHLY_LIMIT} / month
                  </span>
                ) : (
                  <Minus className="size-4 text-muted-foreground" aria-label="Not included" />
                )}
              </FeatureCell>
            ))}
          </tr>
          <tr>
            <th className="px-4 py-3" />
            {TIER_ORDER.map((tier) => (
              <td
                key={tier}
                className={cn('px-4 py-3', cta.currentTier === tier && 'bg-primary/5')}
              >
                <PlanCta tier={tier} state={cta} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// --- page -------------------------------------------------------------

/**
 * Plan & billing (backlog 6.1.6 + 6.2.7). A "your plan" panel driven by
 * `GET /billing/entitlements` through `<QueryBoundary>` (skeleton / inline error +
 * retry / summary), and the always-rendered tier comparison from the shared
 * `PLAN_CATALOG` — so a failed entitlements read still leaves a useful page
 * (partial state). No empty state: an authenticated account always has an
 * entitlements answer.
 *
 * Upgrade → `POST /billing/checkout` → redirect to Stripe Checkout. An account
 * that already has a Stripe customer manages plan changes / cancellation through
 * `POST /billing/portal` (the Customer Portal) instead. The `?checkout=success`
 * return refetches entitlements (the webhook that actually flips the tier is
 * async).
 */
export function PricingPage() {
  const entitlementsQuery = useEntitlements();
  const configQuery = useBillingConfig();
  const checkout = useStartCheckout();
  const portal = useOpenBillingPortal();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  const checkoutStatus = params.get('checkout');

  // Handle the return from Stripe Checkout: confirm with a toast, drop the query
  // param, and — because the subscription webhook is still in flight — refetch
  // entitlements now and once more shortly after so the panel catches up.
  useEffect(() => {
    if (checkoutStatus !== 'success' && checkoutStatus !== 'cancelled') return;
    if (checkoutStatus === 'success') {
      toast.success(COPY.successBanner);
      void qc.invalidateQueries({ queryKey: billingKeys.entitlements() });
    } else {
      toast.info(COPY.cancelledBanner);
    }
    setParams({}, { replace: true });
    const t = setTimeout(
      () => void qc.invalidateQueries({ queryKey: billingKeys.entitlements() }),
      2500,
    );
    return () => clearTimeout(t);
    // Runs once for the value present on mount; `setParams` clears it immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cta: CtaState = {
    currentTier: entitlementsQuery.data?.tier,
    stripeEnabled: configQuery.data?.stripeEnabled ?? false,
    canManageBilling: entitlementsQuery.data?.canManageBilling ?? false,
    busy: checkout.isPending || portal.isPending,
    onCheckout: (tier) =>
      checkout.mutate(tier, {
        onError: (err) => toast.error(toUserMessage(err) || COPY.checkoutError),
      }),
    onPortal: () =>
      portal.mutate(undefined, {
        onError: (err) => toast.error(toUserMessage(err) || COPY.portalError),
      }),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">{COPY.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{COPY.subtitle}</p>
      </header>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle>{COPY.yourPlan}</CardTitle>
          {entitlementsQuery.data?.canManageBilling && (
            <Button size="sm" variant="outline" isLoading={portal.isPending} onClick={cta.onPortal}>
              {COPY.manageBilling}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <QueryBoundary
            query={entitlementsQuery}
            isEmpty={() => false}
            loading={
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            }
          >
            {(entitlements) => <YourPlanSummary entitlements={entitlements} />}
          </QueryBoundary>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compare plans</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <PlanComparison cta={cta} />
          {!cta.stripeEnabled && (
            <p className="px-6 pt-4 text-xs text-muted-foreground">{COPY.checkoutDisabled}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
