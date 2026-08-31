import {
  PLAN_CATALOG,
  PREMIUM_AI_MONTHLY_LIMIT,
  type Entitlements,
  type UserTierName,
} from '@invoice-saas/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { Check, Minus } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useFormatters } from '../../i18n/format';
import { useToast } from '../../hooks/use-toast';
import { cn } from '../../lib/cn';
import { toUserMessage } from '../../lib/error-message';

const TIER_LABEL_KEY = {
  FREE: 'billing.tierFree',
  BASIC: 'billing.tierBasic',
  PREMIUM: 'billing.tierPremium',
} as const satisfies Record<UserTierName, string>;

const TIER_ORDER: readonly UserTierName[] = ['FREE', 'BASIC', 'PREMIUM'];

function tierLabel(tier: UserTierName, t: TFunction): string {
  return t(TIER_LABEL_KEY[tier]);
}

function priceLabel(
  tier: UserTierName,
  t: TFunction,
  formatMoney: (m: number, c: string) => string,
): string {
  const { priceMinor } = PLAN_CATALOG[tier];
  return priceMinor === 0
    ? t('billing.free')
    : t('billing.perMonth', { price: formatMoney(priceMinor, 'EUR') });
}

function invoicesLabel(tier: UserTierName, t: TFunction): string {
  const { invoices } = PLAN_CATALOG[tier];
  if (invoices.kind === 'unlimited') return t('billing.unlimited');
  return invoices.lifetimeLimit === 1
    ? t('billing.invoicesOneLifetime')
    : t('billing.invoicesNLifetime', { count: invoices.lifetimeLimit });
}

function templatesLabel(tier: UserTierName, t: TFunction): string {
  return PLAN_CATALOG[tier].templates === 'full-editor'
    ? t('billing.templatesFull')
    : t('billing.templatesDefaultOnly');
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
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const { tier, invoices, ai, canUseAi, accessEndsAt, renewsAt, cancelAtPeriodEnd } = entitlements;
  const atLimit = !invoices.unlimited && (invoices.remaining ?? 0) <= 0;

  return (
    <ul className="space-y-2 text-sm">
      <SummaryRow
        label={t('billing.summaryCurrentPlan')}
        value={<strong>{tierLabel(tier, t)}</strong>}
      />
      <SummaryRow
        label={t('billing.summaryInvoices')}
        value={
          invoices.unlimited ? (
            t('billing.unlimited')
          ) : (
            <span className={atLimit ? 'text-destructive' : undefined}>
              {t('billing.summaryUsed', { used: invoices.used, limit: invoices.limit })}
              {atLimit ? t('billing.summaryLimitReached') : ''}
            </span>
          )
        }
      />
      <SummaryRow
        label={canUseAi ? t('billing.summaryAiThisMonth') : t('billing.summaryAiDrafting')}
        value={
          canUseAi
            ? `${t('billing.summaryAiUsed', { used: ai.used, limit: ai.limit })}${
                ai.periodResetsAt
                  ? t('billing.summaryAiResets', { date: formatDate(ai.periodResetsAt) })
                  : ''
              }`
            : t('billing.summaryPremiumOnly')
        }
      />
      {cancelAtPeriodEnd && accessEndsAt && (
        <SummaryRow label={t('billing.summaryCancelsOn')} value={formatDate(accessEndsAt)} />
      )}
      {!cancelAtPeriodEnd && accessEndsAt && (
        <SummaryRow label={t('billing.summaryAccessEnds')} value={formatDate(accessEndsAt)} />
      )}
      {renewsAt && <SummaryRow label={t('billing.summaryRenewsOn')} value={formatDate(renewsAt)} />}
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
  const { t } = useTranslation();
  const isCurrent = state.currentTier === tier;

  if (isCurrent) {
    return (
      <span className="inline-flex h-8 items-center rounded-md border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary">
        {t('billing.current')}
      </span>
    );
  }

  // Free column for a paid account → the way "down" is the Customer Portal.
  if (tier === 'FREE') {
    return state.canManageBilling ? (
      <Button size="sm" variant="outline" isLoading={state.busy} onClick={state.onPortal}>
        {t('billing.downgrade')}
      </Button>
    ) : (
      <span className="text-xs text-muted-foreground">{t('common.none')}</span>
    );
  }

  if (!state.stripeEnabled) {
    return (
      <Button size="sm" variant="outline" disabled title={t('billing.checkoutDisabled')}>
        {t('billing.comingSoon')}
      </Button>
    );
  }

  // Already subscribed → plan changes go through the portal (Checkout would open a
  // second subscription); otherwise start a Checkout Session for this tier.
  return state.canManageBilling ? (
    <Button size="sm" variant="outline" isLoading={state.busy} onClick={state.onPortal}>
      {t('billing.changePlan')}
    </Button>
  ) : (
    <Button size="sm" isLoading={state.busy} onClick={() => state.onCheckout(tier)}>
      {t('billing.upgrade')}
    </Button>
  );
}

function PlanComparison({ cta }: { cta: CtaState }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormatters();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('billing.featureCol')}
            </th>
            {TIER_ORDER.map((tier) => (
              <th
                key={tier}
                className={cn('px-4 py-3 text-left', cta.currentTier === tier && 'bg-primary/5')}
              >
                <span className="block text-sm font-semibold text-foreground">
                  {tierLabel(tier, t)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {priceLabel(tier, t, formatMoney)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
              {t('billing.featureInvoices')}
            </th>
            {TIER_ORDER.map((tier) => (
              <FeatureCell key={tier}>{invoicesLabel(tier, t)}</FeatureCell>
            ))}
          </tr>
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
              {t('billing.featureTemplates')}
            </th>
            {TIER_ORDER.map((tier) => (
              <FeatureCell key={tier}>{templatesLabel(tier, t)}</FeatureCell>
            ))}
          </tr>
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
              {t('billing.featureAiDrafting')}
            </th>
            {TIER_ORDER.map((tier) => (
              <FeatureCell key={tier}>
                {PLAN_CATALOG[tier].ai ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="size-4 text-primary" aria-hidden />
                    {t('billing.aiPerMonth', { count: PREMIUM_AI_MONTHLY_LIMIT })}
                  </span>
                ) : (
                  <Minus
                    className="size-4 text-muted-foreground"
                    aria-label={t('billing.notIncluded')}
                  />
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
 * `GET /billing/entitlements` through `<QueryBoundary>`, and the always-rendered
 * tier comparison from the shared `PLAN_CATALOG` — so a failed entitlements read
 * still leaves a useful page (partial state).
 */
export function PricingPage() {
  const { t } = useTranslation();
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
      toast.success(t('billing.successBanner'));
      void qc.invalidateQueries({ queryKey: billingKeys.entitlements() });
    } else {
      toast.info(t('billing.cancelledBanner'));
    }
    setParams({}, { replace: true });
    const timer = setTimeout(
      () => void qc.invalidateQueries({ queryKey: billingKeys.entitlements() }),
      2500,
    );
    return () => clearTimeout(timer);
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
        onError: (err) => toast.error(toUserMessage(err) || t('billing.checkoutError')),
      }),
    onPortal: () =>
      portal.mutate(undefined, {
        onError: (err) => toast.error(toUserMessage(err) || t('billing.portalError')),
      }),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">{t('billing.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('billing.subtitle')}</p>
      </header>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle>{t('billing.yourPlan')}</CardTitle>
          {entitlementsQuery.data?.canManageBilling && (
            <Button size="sm" variant="outline" isLoading={portal.isPending} onClick={cta.onPortal}>
              {t('billing.manageBilling')}
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
          <CardTitle>{t('billing.comparePlans')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <PlanComparison cta={cta} />
          {!cta.stripeEnabled && (
            <p className="px-6 pt-4 text-xs text-muted-foreground">
              {t('billing.checkoutDisabled')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
