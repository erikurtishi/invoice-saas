import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AdminNoData,
  AdminPageHeader,
  AdminSection,
  StatTile,
} from '../../components/admin/admin-ui';
import { AdminBarChart, AdminLineChart, type ChartPoint } from '../../components/admin/admin-chart';
import { QueryBoundary } from '../../components/state/query-boundary';
import { Select } from '../../components/ui';
import {
  useAdminOverview,
  useAdminRevenueSeries,
  useAdminSignupsSeries,
} from '../../features/admin/use-admin';
import { useFormatters } from '../../i18n/format';

/**
 * Admin overview dashboard (backlog Epic L2.2). Three independent queries —
 * headline figures, signups/day, month-end MRR — each behind its own
 * `<QueryBoundary>` so a slow or failing series never blanks the numbers
 * (`X.7.20` / `L2.8.3`). Churn and conversion are labelled as documented
 * approximations (`L2.2.1`); the revenue series is labelled a reconstructed
 * estimate (`L2.2.2`).
 */

function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

const SIGNUP_WINDOWS = [30, 90, 180, 365] as const;
const REVENUE_WINDOWS = [6, 12, 24, 36] as const;

export function AdminOverviewPage() {
  const { t } = useTranslation();
  const { formatMoney, formatNumber, formatDateTime, formatDate } = useFormatters();

  const [signupDays, setSignupDays] = useState<number>(90);
  const [revenueMonths, setRevenueMonths] = useState<number>(12);

  const overview = useAdminOverview();
  const signups = useAdminSignupsSeries(signupDays);
  const revenue = useAdminRevenueSeries(revenueMonths);

  return (
    <div className="flex flex-col gap-6">
      <QueryBoundary
        name="admin-overview"
        query={overview}
        loading={<div className="h-40 animate-pulse rounded-lg bg-muted" />}
      >
        {(data) => (
          <>
            <AdminPageHeader
              title={t('admin.overview.title')}
              description={t('admin.overview.asOf', {
                time: formatDateTime(data.generatedAt),
              })}
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatTile
                label={t('admin.overview.mrr')}
                value={formatMoney(data.mrr.totalMinor, data.mrr.currency)}
                caption={t('admin.overview.mrrBreakdown', {
                  basic: formatMoney(data.mrr.byTier.BASIC, data.mrr.currency),
                  premium: formatMoney(data.mrr.byTier.PREMIUM, data.mrr.currency),
                })}
              />
              <StatTile
                label={t('admin.overview.mrrAtRisk')}
                tone={data.mrr.atRiskMinor > 0 ? 'warning' : 'default'}
                value={formatMoney(data.mrr.atRiskMinor, data.mrr.currency)}
                caption={t('admin.overview.mrrAtRiskHint')}
              />
              <StatTile
                label={t('admin.overview.activeSubs')}
                value={formatNumber(data.activeSubscriptions.total)}
                caption={t('admin.overview.activeSubsBreakdown', {
                  basic: data.activeSubscriptions.byTier.BASIC,
                  premium: data.activeSubscriptions.byTier.PREMIUM,
                  stripe: data.activeSubscriptions.bySource.stripe,
                  manual: data.activeSubscriptions.bySource.manual,
                })}
              />
              <StatTile
                label={t('admin.overview.signups')}
                value={formatNumber(data.signups.total)}
                caption={t('admin.overview.signupsBreakdown', {
                  today: data.signups.today,
                  week: data.signups.last7Days,
                  month: data.signups.last30Days,
                })}
              />
              <StatTile
                label={t('admin.overview.churn')}
                value={bpsToPercent(data.churn.rateBps)}
                caption={t('admin.overview.churnHint', { count: data.churn.thisMonth })}
              />
              <StatTile
                label={t('admin.overview.conversion')}
                value={bpsToPercent(data.conversion.rateBps)}
                caption={t('admin.overview.conversionHint', {
                  paid: data.conversion.paidTenants,
                  total: data.conversion.totalTenants,
                })}
              />
            </div>
          </>
        )}
      </QueryBoundary>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSection
          title={t('admin.overview.signupsChartTitle')}
          description={t('admin.overview.signupsChartHint')}
          actions={
            <Select
              aria-label={t('admin.overview.windowLabel')}
              className="w-32"
              value={String(signupDays)}
              onValueChange={(v) => setSignupDays(Number(v))}
              options={SIGNUP_WINDOWS.map((d) => ({
                value: String(d),
                label: t('admin.overview.lastNDays', { count: d }),
              }))}
            />
          }
        >
          <QueryBoundary
            name="admin-signups"
            query={signups}
            loading={<div className="h-60 animate-pulse rounded-md bg-muted" />}
            isEmpty={(d) => d.points.every((p) => p.count === 0)}
            empty={<AdminNoData message={t('admin.overview.noSignupData')} />}
          >
            {(d) => {
              const points: ChartPoint[] = d.points.map((p) => ({
                label: formatDate(p.date),
                value: p.count,
              }));
              return (
                <AdminBarChart
                  data={points}
                  height={240}
                  ariaLabel={t('admin.overview.signupsChartTitle')}
                  valueFormatter={(v) => formatNumber(v)}
                />
              );
            }}
          </QueryBoundary>
        </AdminSection>

        <AdminSection
          title={t('admin.overview.revenueChartTitle')}
          description={t('admin.overview.revenueChartHint')}
          actions={
            <Select
              aria-label={t('admin.overview.windowLabel')}
              className="w-36"
              value={String(revenueMonths)}
              onValueChange={(v) => setRevenueMonths(Number(v))}
              options={REVENUE_WINDOWS.map((m) => ({
                value: String(m),
                label: t('admin.overview.lastNMonths', { count: m }),
              }))}
            />
          }
        >
          <QueryBoundary
            name="admin-revenue"
            query={revenue}
            loading={<div className="h-60 animate-pulse rounded-md bg-muted" />}
            isEmpty={(d) => d.points.every((p) => p.mrrMinor === 0)}
            empty={<AdminNoData message={t('admin.overview.noRevenueData')} />}
          >
            {(d) => {
              const points: ChartPoint[] = d.points.map((p) => ({
                label: p.month,
                value: p.mrrMinor / 100,
              }));
              return (
                <AdminLineChart
                  data={points}
                  height={240}
                  ariaLabel={t('admin.overview.revenueChartTitle')}
                  valueFormatter={(v) => formatMoney(Math.round(v * 100), d.currency)}
                />
              );
            }}
          </QueryBoundary>
        </AdminSection>
      </div>
    </div>
  );
}
