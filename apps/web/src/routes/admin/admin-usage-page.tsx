import { AI_GENERATION_STATUSES } from '@invoice-saas/shared';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AdminBadge,
  AdminNoData,
  AdminPageHeader,
  AdminSection,
  StatTile,
} from '../../components/admin/admin-ui';
import { AdminBarChart, type ChartPoint } from '../../components/admin/admin-chart';
import { QueryBoundary } from '../../components/state/query-boundary';
import {
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui';
import {
  useAiUsage,
  useEmailUsage,
  useStorageUsage,
  useUsageAnomalies,
} from '../../features/admin/use-admin';
import { useFormatters } from '../../i18n/format';

/**
 * Admin cost & usage monitoring (backlog Epic L2.5). Four independent widgets —
 * anomalies, AI usage, email volume, storage — each its own `<QueryBoundary>`
 * (`X.7.20`) reading one `/admin/usage/*` endpoint. `days` is shared by the AI +
 * email windows; the per-tenant breakdowns are ranked top-10, not paginated.
 */

const USD = (micros: number, fmt: (minor: number, currency: string) => string) =>
  fmt(Math.round(micros / 10_000), 'USD');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const WINDOWS = [7, 30, 90, 180] as const;
const TOP_LIMIT = 10;

export function AdminUsagePage() {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(30);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={t('admin.usage.title')}
        description={t('admin.usage.description')}
        actions={
          <Select
            aria-label={t('admin.usage.windowLabel')}
            className="w-36"
            value={String(days)}
            onValueChange={(v) => setDays(Number(v))}
            options={WINDOWS.map((d) => ({
              value: String(d),
              label: t('admin.usage.lastNDays', { count: d }),
            }))}
          />
        }
      />

      <AnomaliesPanel />
      <AiUsagePanel days={days} />
      <EmailUsagePanel days={days} />
      <StoragePanel />
    </div>
  );
}

function AnomaliesPanel() {
  const { t } = useTranslation();
  const { formatMoney, formatNumber, formatDateTime } = useFormatters();
  const query = useUsageAnomalies();

  return (
    <AdminSection
      title={t('admin.usage.anomaliesTitle')}
      description={t('admin.usage.anomaliesHint')}
    >
      <QueryBoundary
        name="admin-anomalies"
        query={query}
        loading={<div className="h-24 animate-pulse rounded-md bg-muted" />}
      >
        {(data) => {
          const signals = [
            {
              key: 'ai',
              label: t('admin.usage.anomalyAiCost'),
              signal: data.aiCostMicros,
              format: (n: number) => USD(n, formatMoney),
            },
            {
              key: 'email',
              label: t('admin.usage.anomalyEmail'),
              signal: data.emailSends,
              format: (n: number) => formatNumber(n),
            },
          ];
          return (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {signals.map(({ key, label, signal, format }) => (
                  <div
                    key={key}
                    className={
                      signal.flagged
                        ? 'rounded-lg border border-warning/60 bg-warning/40 p-4'
                        : 'rounded-lg border border-border bg-background p-4'
                    }
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {label}
                      </p>
                      {signal.flagged && (
                        <AdminBadge tone="warning">
                          <TriangleAlert className="mr-1 size-3" aria-hidden />
                          {t('admin.usage.flagged')}
                        </AdminBadge>
                      )}
                    </div>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                      {signal.ratioBps === null
                        ? t('admin.usage.noBaseline')
                        : `${(signal.ratioBps / 10_000).toFixed(1)}×`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('admin.usage.anomalyDetail', {
                        last: format(signal.last24h),
                        avg: format(signal.baselineDailyAvg),
                      })}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t('admin.usage.asOf', { time: formatDateTime(data.generatedAt) })} ·{' '}
                {t('admin.usage.thresholdNote', {
                  x: (data.thresholdBps / 10_000).toFixed(0),
                })}
              </p>
            </>
          );
        }}
      </QueryBoundary>
    </AdminSection>
  );
}

function AiUsagePanel({ days }: { days: number }) {
  const { t } = useTranslation();
  const { formatMoney, formatNumber } = useFormatters();
  const query = useAiUsage({ days, limit: TOP_LIMIT });

  return (
    <AdminSection title={t('admin.usage.aiTitle')} description={t('admin.usage.aiHint', { days })}>
      <QueryBoundary
        name="admin-ai-usage"
        query={query}
        loading={<div className="h-40 animate-pulse rounded-md bg-muted" />}
      >
        {(d) => (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label={t('admin.usage.aiGenerations')}
                value={formatNumber(d.totals.generations)}
                caption={t('admin.usage.aiSuccessCaption', {
                  count: formatNumber(d.totals.successGenerations),
                })}
              />
              <StatTile
                label={t('admin.usage.aiCost')}
                value={USD(d.totals.costMicros, formatMoney)}
              />
              <StatTile
                label={t('admin.usage.aiTokens')}
                value={formatNumber(d.totals.inputTokens + d.totals.outputTokens)}
                caption={t('admin.usage.aiTokensCaption', {
                  input: formatNumber(d.totals.inputTokens),
                  output: formatNumber(d.totals.outputTokens),
                })}
              />
              <StatTile
                label={t('admin.usage.aiThisMonth')}
                value={formatNumber(d.currentPeriod.generationsUsed)}
                caption={t('admin.usage.aiCapCaption', {
                  cap: d.currentPeriod.perTenantLimit,
                  period: d.currentPeriod.periodKey,
                })}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {AI_GENERATION_STATUSES.map(
                (s) => `${s} ${formatNumber(d.totals.byStatus[s] ?? 0)}`,
              ).join(' · ')}
            </p>

            {d.perTenant.length === 0 ? (
              <AdminNoData message={t('admin.usage.noAiData')} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('admin.usage.colTenant')}</TableHead>
                      <TableHead>{t('admin.usage.colGenerations')}</TableHead>
                      <TableHead>{t('admin.usage.colSuccess')}</TableHead>
                      <TableHead>{t('admin.usage.colCost')}</TableHead>
                      <TableHead>{t('admin.usage.colThisMonth')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.perTenant.map((row) => (
                      <TableRow key={row.tenantId}>
                        <TableCell className="text-foreground">{row.email}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatNumber(row.generations)}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatNumber(row.successGenerations)}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {USD(row.costMicros, formatMoney)}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatNumber(row.currentPeriodUsed)} / {row.periodLimit}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </QueryBoundary>
    </AdminSection>
  );
}

function EmailUsagePanel({ days }: { days: number }) {
  const { t } = useTranslation();
  const { formatNumber, formatDate } = useFormatters();
  const query = useEmailUsage({ days, limit: TOP_LIMIT });

  return (
    <AdminSection
      title={t('admin.usage.emailTitle')}
      description={t('admin.usage.emailHint', { days })}
    >
      <QueryBoundary
        name="admin-email-usage"
        query={query}
        loading={<div className="h-40 animate-pulse rounded-md bg-muted" />}
      >
        {(d) => (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile label={t('admin.usage.emailTotal')} value={formatNumber(d.totalSends)} />
            </div>

            {d.totalSends === 0 ? (
              <AdminNoData message={t('admin.usage.noEmailData')} />
            ) : (
              <>
                <AdminBarChart
                  data={d.daily.map<ChartPoint>((p) => ({
                    label: formatDate(p.date),
                    value: p.sends,
                  }))}
                  height={200}
                  ariaLabel={t('admin.usage.emailTitle')}
                  valueFormatter={(v) => formatNumber(v)}
                />

                {d.perTenant.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('admin.usage.colTenant')}</TableHead>
                          <TableHead>{t('admin.usage.colSends')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {d.perTenant.map((row) => (
                          <TableRow key={row.tenantId}>
                            <TableCell className="text-foreground">{row.email}</TableCell>
                            <TableCell className="tabular-nums text-muted-foreground">
                              {formatNumber(row.sends)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </QueryBoundary>
    </AdminSection>
  );
}

function StoragePanel() {
  const { t } = useTranslation();
  const { formatNumber } = useFormatters();
  const query = useStorageUsage({ limit: TOP_LIMIT });

  return (
    <AdminSection title={t('admin.usage.storageTitle')} description={t('admin.usage.storageHint')}>
      <QueryBoundary
        name="admin-storage-usage"
        query={query}
        loading={<div className="h-40 animate-pulse rounded-md bg-muted" />}
      >
        {(d) => (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile label={t('admin.usage.storageLogos')} value={formatNumber(d.logoCount)} />
              <StatTile
                label={t('admin.usage.storageLogoBytes')}
                value={formatBytes(d.logoBytes)}
              />
              <StatTile
                label={t('admin.usage.storagePdfBytes')}
                value={formatBytes(d.pdfBytes)}
                caption={t('admin.usage.storagePdfCaption')}
              />
            </div>

            {d.perTenant.length === 0 ? (
              <AdminNoData message={t('admin.usage.noStorageData')} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('admin.usage.colTenant')}</TableHead>
                      <TableHead>{t('admin.usage.colLogoSize')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.perTenant.map((row) => (
                      <TableRow key={row.tenantId}>
                        <TableCell className="text-foreground">{row.email}</TableCell>
                        <TableCell>
                          {row.bytes === null ? (
                            <AdminBadge tone="warning">{t('admin.usage.fileMissing')}</AdminBadge>
                          ) : (
                            <span className="tabular-nums text-muted-foreground">
                              {formatBytes(row.bytes)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </QueryBoundary>
    </AdminSection>
  );
}
