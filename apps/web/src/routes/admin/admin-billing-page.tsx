import type { AdminBillingSubscription } from '@invoice-saas/shared';
import { ExternalLink } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AdminBadge,
  AdminPageHeader,
  AdminPagination,
  AdminSection,
} from '../../components/admin/admin-ui';
import { EmptyState } from '../../components/state/empty-state';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonTable } from '../../components/state/skeletons';
import {
  RecordCard,
  RecordCardList,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui';
import { type AdminBillingListParams } from '../../features/admin/admin-api';
import { useBillingAttention, useBillingSubscriptions } from '../../features/admin/use-admin';
import { useFormatters } from '../../i18n/format';

/**
 * Admin billing view (backlog Epic L2.6). Two widgets, each its own
 * `<QueryBoundary>`: the "needs attention" panel (Stripe dunning + soon-to-renew)
 * and the unified subscriptions list (Stripe + manual, `source`-labelled). All
 * numbers come straight from `/admin/billing/*` — this screen never talks to
 * Stripe, it links out.
 */

const STRIPE_SUB_URL = 'https://dashboard.stripe.com/subscriptions/';

type SourceFilter = 'all' | 'stripe' | 'manual';
type StatusFilter = 'all' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELED';
type SortValue = 'newest' | 'expiry';

function statusTone(
  status: AdminBillingSubscription['status'],
): 'success' | 'warning' | 'neutral' | 'danger' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'PAST_DUE':
      return 'warning';
    case 'CANCELED':
      return 'danger';
    default:
      return 'neutral';
  }
}

function StripeLink({ sub, label }: { sub: AdminBillingSubscription; label: string }) {
  if (!sub.stripeSubscriptionId) return null;
  return (
    <a
      href={`${STRIPE_SUB_URL}${sub.stripeSubscriptionId}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
    >
      {label}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

export function AdminBillingPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={t('admin.billing.title')}
        description={t('admin.billing.description')}
      />
      <AttentionPanel />
      <SubscriptionsPanel />
    </div>
  );
}

const WINDOWS = [7, 14, 30, 60, 90] as const;

function AttentionPanel() {
  const { t } = useTranslation();
  const { formatDate, formatDateTime } = useFormatters();
  const [windowDays, setWindowDays] = useState<number>(30);
  const query = useBillingAttention(windowDays);

  const daysLeftLabel = (sub: AdminBillingSubscription) =>
    sub.daysUntilEnd === null
      ? t('common.none')
      : sub.daysUntilEnd >= 0
        ? t('admin.billing.inDays', { count: sub.daysUntilEnd })
        : t('admin.billing.daysAgo', { count: -sub.daysUntilEnd });

  const row = (sub: AdminBillingSubscription) => (
    <li
      key={sub.id}
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{sub.tenantBusinessName}</p>
        <p className="truncate text-xs text-muted-foreground">{sub.tenantEmail}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {sub.effectiveEnd ? formatDate(sub.effectiveEnd) : t('common.none')} ·{' '}
          {daysLeftLabel(sub)}
        </span>
        <AdminBadge tone="info">{sub.tier}</AdminBadge>
        <StripeLink sub={sub} label={t('admin.billing.openInStripe')} />
      </div>
    </li>
  );

  return (
    <AdminSection
      title={t('admin.billing.attentionTitle')}
      description={t('admin.billing.attentionHint')}
      actions={
        <Select
          aria-label={t('admin.billing.renewalWindow')}
          className="w-40"
          value={String(windowDays)}
          onValueChange={(v) => setWindowDays(Number(v))}
          options={WINDOWS.map((d) => ({
            value: String(d),
            label: t('admin.billing.withinDays', { count: d }),
          }))}
        />
      }
    >
      <QueryBoundary
        name="admin-billing-attention"
        query={query}
        loading={<div className="h-32 animate-pulse rounded-md bg-muted" />}
      >
        {(data) => {
          const healthy = data.failedPayments.length === 0 && data.upcomingRenewals.length === 0;
          if (healthy) {
            return (
              <p className="rounded-md border border-success/30 bg-success/5 p-4 text-sm text-foreground">
                {t('admin.billing.allHealthy')}
              </p>
            );
          }
          return (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('admin.billing.failedPayments')} ({data.failedPayments.length})
                </h3>
                {data.failedPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('admin.billing.noFailedPayments')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">{data.failedPayments.map(row)}</ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('admin.billing.upcomingRenewals')} ({data.upcomingRenewals.length})
                </h3>
                {data.upcomingRenewals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('admin.billing.noUpcomingRenewals')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">{data.upcomingRenewals.map(row)}</ul>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('admin.billing.asOf', { time: formatDateTime(data.generatedAt) })}
              </p>
            </div>
          );
        }}
      </QueryBoundary>
    </AdminSection>
  );
}

function SummaryStrip({
  summary,
}: {
  summary: {
    total: number;
    byStatus: Record<'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELED', number>;
    bySource: { stripe: number; manual: number };
    cancelingAtPeriodEnd: number;
  };
}) {
  const { t } = useTranslation();
  const chip = (label: string, value: ReactNode) => (
    <span className="whitespace-nowrap text-sm text-muted-foreground">
      {label} <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-background px-3 py-2">
      {chip(t('admin.billing.summaryTotal'), summary.total)}
      {chip(t('admin.billing.statusActive'), summary.byStatus.ACTIVE)}
      {chip(t('admin.billing.statusPastDue'), summary.byStatus.PAST_DUE)}
      {chip(t('admin.billing.statusExpired'), summary.byStatus.EXPIRED)}
      {chip(t('admin.billing.statusCanceled'), summary.byStatus.CANCELED)}
      {chip('Stripe', summary.bySource.stripe)}
      {chip(t('admin.billing.sourceManual'), summary.bySource.manual)}
      {chip(t('admin.billing.canceling'), summary.cancelingAtPeriodEnd)}
    </div>
  );
}

function SubscriptionsPanel() {
  const { t } = useTranslation();
  const { formatDate } = useFormatters();

  const [source, setSource] = useState<SourceFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortValue>('newest');
  const [page, setPage] = useState(1);
  const resetPage = () => setPage(1);

  const params: AdminBillingListParams = {
    source,
    ...(status !== 'all' ? { status } : {}),
    sort,
    page,
  };
  const query = useBillingSubscriptions(params);

  const daysCol = (sub: AdminBillingSubscription) =>
    sub.daysUntilEnd === null
      ? t('common.none')
      : sub.daysUntilEnd >= 0
        ? t('admin.billing.inDays', { count: sub.daysUntilEnd })
        : t('admin.billing.daysAgo', { count: -sub.daysUntilEnd });

  return (
    <AdminSection title={t('admin.billing.subsTitle')}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          aria-label={t('admin.billing.filterSource')}
          className="w-36"
          value={source}
          onValueChange={(v) => {
            setSource(v as SourceFilter);
            resetPage();
          }}
          options={[
            { value: 'all', label: t('admin.billing.sourceAll') },
            { value: 'stripe', label: 'Stripe' },
            { value: 'manual', label: t('admin.billing.sourceManual') },
          ]}
        />
        <Select
          aria-label={t('admin.billing.filterStatus')}
          className="w-40"
          value={status}
          onValueChange={(v) => {
            setStatus(v as StatusFilter);
            resetPage();
          }}
          options={[
            { value: 'all', label: t('admin.billing.statusAll') },
            { value: 'ACTIVE', label: t('admin.billing.statusActive') },
            { value: 'PAST_DUE', label: t('admin.billing.statusPastDue') },
            { value: 'EXPIRED', label: t('admin.billing.statusExpired') },
            { value: 'CANCELED', label: t('admin.billing.statusCanceled') },
          ]}
        />
        <Select
          aria-label={t('admin.billing.sortLabel')}
          className="w-44"
          value={sort}
          onValueChange={(v) => {
            setSort(v as SortValue);
            resetPage();
          }}
          options={[
            { value: 'newest', label: t('admin.billing.sortNewest') },
            { value: 'expiry', label: t('admin.billing.sortExpiry') },
          ]}
        />
      </div>

      <QueryBoundary
        name="admin-billing-subs"
        query={query}
        loading={<SkeletonTable rows={8} columns={5} />}
        isEmpty={(d) => d.total === 0}
        empty={
          status !== 'all' || source !== 'all' ? (
            <EmptyState
              variant="nothing-found"
              title={t('admin.billing.nothingFoundTitle')}
              description={t('admin.billing.nothingFoundBody')}
              onClearFilters={() => {
                setSource('all');
                setStatus('all');
                resetPage();
              }}
            />
          ) : (
            <EmptyState
              variant="nothing-yet"
              title={t('admin.billing.nothingYetTitle')}
              description={t('admin.billing.nothingYetBody')}
            />
          )
        }
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <SummaryStrip summary={data.summary} />

            <RecordCardList className="flex flex-col gap-3 md:hidden">
              {data.items.map((sub) => (
                <RecordCard
                  key={sub.id}
                  title={sub.tenantBusinessName || sub.tenantEmail}
                  fields={[
                    { label: t('admin.billing.colEmail'), value: sub.tenantEmail },
                    {
                      label: t('admin.billing.colSource'),
                      value: (
                        <AdminBadge tone={sub.source === 'STRIPE' ? 'info' : 'neutral'}>
                          {sub.source}
                        </AdminBadge>
                      ),
                    },
                    { label: t('admin.billing.colTier'), value: sub.tier },
                    {
                      label: t('admin.billing.colStatus'),
                      value: <AdminBadge tone={statusTone(sub.status)}>{sub.status}</AdminBadge>,
                    },
                    {
                      label: t('admin.billing.colEnd'),
                      value: sub.effectiveEnd
                        ? `${formatDate(sub.effectiveEnd)} · ${daysCol(sub)}`
                        : t('common.none'),
                    },
                  ]}
                />
              ))}
            </RecordCardList>

            <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.billing.colTenant')}</TableHead>
                    <TableHead>{t('admin.billing.colSource')}</TableHead>
                    <TableHead>{t('admin.billing.colTier')}</TableHead>
                    <TableHead>{t('admin.billing.colStatus')}</TableHead>
                    <TableHead>{t('admin.billing.colEnd')}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {sub.tenantBusinessName || sub.tenantEmail}
                          </span>
                          <span className="text-xs text-muted-foreground">{sub.tenantEmail}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <AdminBadge tone={sub.source === 'STRIPE' ? 'info' : 'neutral'}>
                          {sub.source}
                        </AdminBadge>
                        {sub.cancelAtPeriodEnd && (
                          <span className="ml-1 text-xs text-warning-foreground">
                            {t('admin.billing.cancelingShort')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{sub.tier}</TableCell>
                      <TableCell>
                        <AdminBadge tone={statusTone(sub.status)}>{sub.status}</AdminBadge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {sub.effectiveEnd ? (
                          <>
                            {formatDate(sub.effectiveEnd)}
                            <span className="ml-1 text-xs">· {daysCol(sub)}</span>
                          </>
                        ) : (
                          t('common.none')
                        )}
                      </TableCell>
                      <TableCell>
                        <StripeLink sub={sub} label={t('admin.billing.stripe')} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
          </div>
        )}
      </QueryBoundary>
    </AdminSection>
  );
}
