import type { AdminTenantDetail } from '@invoice-saas/shared';
import { ArrowLeft, Ban, RotateCcw, Ticket, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AdminBadge, AdminSection } from '../../components/admin/admin-ui';
import {
  TenantDeleteDialog,
  TenantDisableDialog,
} from '../../components/admin/tenant-admin-dialogs';
import { QueryBoundary } from '../../components/state/query-boundary';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui';
import { useAdminTenant } from '../../features/admin/use-admin';
import { useToast } from '../../hooks/use-toast';
import { useFormatters } from '../../i18n/format';

/**
 * Admin tenant detail (backlog `L2.3.2`–`L2.3.4`) — the support view of one
 * account: profile, live entitlements, usage summary, full subscription history
 * and the last few invoice-history events, all read-only, plus disable/enable and
 * hard-delete. One `GET /admin/tenants/:id` query behind a `<QueryBoundary>`.
 *
 * "Tenant" is the account — one `User` row (decision D3: no separate `Tenant`
 * table). The destructive actions are hidden for an `ADMIN` target; the server
 * enforces the same guard regardless.
 */

const HISTORY_LABEL_KEYS = {
  CREATED: 'history.eventCreated',
  EDITED: 'history.eventEdited',
  DOWNLOADED: 'history.eventDownloaded',
  SENT: 'history.eventSent',
  DUPLICATED_FROM: 'history.eventDuplicatedFrom',
  DUPLICATED_INTO: 'history.eventDuplicatedInto',
} as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function AdminTenantDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const query = useAdminTenant(id);

  return (
    <div>
      <Link
        to="/admin/tenants"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('admin.tenants.backToList')}
      </Link>

      <QueryBoundary
        name="admin-tenant-detail"
        query={query}
        loading={<div className="h-64 animate-pulse rounded-lg bg-muted" />}
      >
        {(tenant) => <TenantDetail tenant={tenant} />}
      </QueryBoundary>
    </div>
  );
}

function TenantDetail({ tenant }: { tenant: AdminTenantDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { formatDate, formatDateTime, formatRelativeTime, formatMoney, formatNumber } =
    useFormatters();

  const [disableOpen, setDisableOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isAdminTarget = tenant.role === 'ADMIN';
  const { usage, entitlements: ent } = tenant;
  const yesNo = (v: boolean) => (v ? t('common.yes') : t('common.no'));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{tenant.businessName}</h1>
            {tenant.disabledAt ? (
              <AdminBadge tone="danger">{t('admin.tenants.statusDisabled')}</AdminBadge>
            ) : (
              <AdminBadge tone="success">{t('admin.tenants.statusActive')}</AdminBadge>
            )}
            {isAdminTarget && <AdminBadge tone="info">{t('admin.tenants.roleAdmin')}</AdminBadge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{tenant.email}</p>
        </div>

        {!isAdminTarget && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin/grants?email=${encodeURIComponent(tenant.email)}`}>
                <Ticket className="size-4" aria-hidden />
                {t('admin.tenants.manageGrants')}
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDisableOpen(true)}>
              {tenant.disabledAt ? (
                <>
                  <RotateCcw className="size-4" aria-hidden />
                  {t('admin.tenants.enableConfirm')}
                </>
              ) : (
                <>
                  <Ban className="size-4" aria-hidden />
                  {t('admin.tenants.disableConfirm')}
                </>
              )}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" aria-hidden />
              {t('common.delete')}
            </Button>
          </div>
        )}
      </header>

      {tenant.disabledAt && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">
            {t('admin.tenants.disabledOn', { date: formatDateTime(tenant.disabledAt) })}
          </p>
          {tenant.disabledReason && (
            <p className="mt-0.5 text-muted-foreground">
              {t('admin.tenants.reasonLabel')}: {tenant.disabledReason}
            </p>
          )}
        </div>
      )}

      <AdminSection title={t('admin.tenants.sectionProfile')}>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label={t('admin.tenants.fieldCreated')}>{formatDate(tenant.createdAt)}</Field>
          <Field label={t('admin.tenants.fieldCountry')}>
            {tenant.country ?? t('common.none')}
          </Field>
          <Field label={t('admin.tenants.fieldCurrency')}>{tenant.defaultCurrency}</Field>
          <Field label={t('admin.tenants.fieldUiLanguage')}>{tenant.uiLanguage}</Field>
          <Field label={t('admin.tenants.fieldInvoiceLanguage')}>{tenant.invoiceLanguage}</Field>
          <Field label={t('admin.tenants.fieldEmailVerified')}>{yesNo(tenant.emailVerified)}</Field>
          <Field label={t('admin.tenants.fieldOnboarding')}>
            {yesNo(tenant.onboardingCompleted)}
          </Field>
          <Field label={t('admin.tenants.fieldRole')}>{tenant.role}</Field>
        </dl>
      </AdminSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSection
          title={t('admin.tenants.sectionEntitlements')}
          description={t('admin.tenants.entitlementsHint')}
        >
          <dl className="grid grid-cols-2 gap-4">
            <Field label={t('admin.tenants.entTier')}>
              <AdminBadge
                tone={
                  ent.tier === 'PREMIUM' ? 'success' : ent.tier === 'BASIC' ? 'info' : 'neutral'
                }
              >
                {ent.tier}
              </AdminBadge>
            </Field>
            <Field label={t('admin.tenants.entSource')}>{ent.source}</Field>
            <Field label={t('admin.tenants.entAccessEnds')}>
              {ent.accessEndsAt ? formatDate(ent.accessEndsAt) : t('common.none')}
            </Field>
            <Field label={t('admin.tenants.entRenews')}>
              {ent.renewsAt ? formatDate(ent.renewsAt) : t('common.none')}
            </Field>
            <Field label={t('admin.tenants.entInvoices')}>
              {ent.invoices.unlimited
                ? t('admin.tenants.unlimited')
                : `${formatNumber(ent.invoices.used)} / ${formatNumber(ent.invoices.limit ?? 0)}`}
            </Field>
            <Field label={t('admin.tenants.entAi')}>
              {ent.canUseAi
                ? ent.ai.unlimited
                  ? t('admin.tenants.unlimited')
                  : `${formatNumber(ent.ai.used)} / ${formatNumber(ent.ai.limit ?? 0)}`
                : t('admin.tenants.aiOff')}
            </Field>
          </dl>
        </AdminSection>

        <AdminSection title={t('admin.tenants.sectionUsage')}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label={t('admin.tenants.usageClients')}>{formatNumber(usage.clients)}</Field>
            <Field label={t('admin.tenants.usageProducts')}>{formatNumber(usage.products)}</Field>
            <Field label={t('admin.tenants.usageTemplates')}>{formatNumber(usage.templates)}</Field>
            <Field label={t('admin.tenants.usageDraft')}>{formatNumber(usage.invoicesDraft)}</Field>
            <Field label={t('admin.tenants.usageIssued')}>
              {formatNumber(usage.invoicesIssued)}
            </Field>
            <Field label={t('admin.tenants.usageLifetime')}>
              {formatNumber(usage.lifetimeInvoicesGenerated)}
            </Field>
            <Field label={t('admin.tenants.usageAiPeriod')}>
              {formatNumber(usage.aiGenerationsInPeriod)} ({usage.aiPeriodKey})
            </Field>
            <Field label={t('admin.tenants.usageAiLifetime')}>
              {formatNumber(usage.aiGenerations)}
            </Field>
            <Field label={t('admin.tenants.usageAiCost')}>
              {formatMoney(Math.round(usage.aiCostMicros / 10_000), 'USD')}
            </Field>
          </dl>
        </AdminSection>
      </div>

      <AdminSection title={t('admin.tenants.sectionSubs')}>
        {tenant.subscriptionHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.tenants.noSubs')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.tenants.subTier')}</TableHead>
                  <TableHead>{t('admin.tenants.subStatus')}</TableHead>
                  <TableHead>{t('admin.tenants.subSource')}</TableHead>
                  <TableHead>{t('admin.tenants.subStart')}</TableHead>
                  <TableHead>{t('admin.tenants.subEnd')}</TableHead>
                  <TableHead>{t('admin.tenants.subNote')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenant.subscriptionHistory.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.tier}</TableCell>
                    <TableCell className="text-muted-foreground">{s.status}</TableCell>
                    <TableCell className="text-muted-foreground">{s.source}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(s.startDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.endDate ? formatDate(s.endDate) : t('common.none')}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.note ?? t('common.none')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AdminSection>

      <AdminSection title={t('admin.tenants.sectionActivity')}>
        {tenant.recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.tenants.noActivity')}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {tenant.recentActivity.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3">
                <span className="text-foreground">
                  {t(HISTORY_LABEL_KEYS[e.eventType])}
                  <span className="ml-1 text-xs text-muted-foreground">
                    #{e.invoiceId.slice(-6)}
                  </span>
                </span>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={e.timestamp}>
                  {formatRelativeTime(e.timestamp)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <TenantDisableDialog
        tenant={tenant}
        open={disableOpen}
        onOpenChange={setDisableOpen}
        onDone={(m) => toast.success(m)}
      />
      <TenantDeleteDialog
        tenant={tenant}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={(m) => {
          setDeleteOpen(false);
          toast.success(m);
          void navigate('/admin/tenants', { replace: true });
        }}
      />
    </div>
  );
}
