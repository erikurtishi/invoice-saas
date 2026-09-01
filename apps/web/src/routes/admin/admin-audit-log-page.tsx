import {
  ADMIN_AUDIT_ACTIONS,
  type AdminAuditLogEntry,
  adminAuditActionLabel,
} from '@invoice-saas/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminBadge, AdminPageHeader, AdminPagination } from '../../components/admin/admin-ui';
import { EmptyState } from '../../components/state/empty-state';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonTable } from '../../components/state/skeletons';
import {
  Input,
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
import { type AdminAuditLogParams } from '../../features/admin/admin-api';
import { useAdminAuditLog } from '../../features/admin/use-admin';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useFormatters } from '../../i18n/format';

/**
 * Admin audit-log viewer (backlog `L2.3.5`). Reads the append-only cross-tenant
 * trail at `GET /admin/audit-log`, newest first, filterable by action slug, date
 * range and (by id) actor / affected tenant. Email snapshots on each row stay
 * readable after the tenant is deleted.
 */

const ACTION_OPTIONS = [
  { value: 'all', slug: null },
  ...Object.keys(ADMIN_AUDIT_ACTIONS).map((slug) => ({ value: slug, slug })),
];

function actionTone(action: string): 'neutral' | 'danger' | 'warning' | 'info' {
  if (action === 'tenant.delete' || action === 'account.disable') return 'danger';
  if (action.startsWith('grant.')) return 'info';
  if (action.startsWith('support.')) return 'warning';
  return 'neutral';
}

export function AdminAuditLogPage() {
  const { t } = useTranslation();
  const { formatDateTime } = useFormatters();

  const [action, setAction] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tenantIdInput, setTenantIdInput] = useState('');
  const targetTenantId = useDebouncedValue(tenantIdInput.trim(), 300);
  const [page, setPage] = useState(1);

  const resetPage = () => setPage(1);

  const params: AdminAuditLogParams = {
    ...(action !== 'all' ? { action } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(targetTenantId ? { targetTenantId } : {}),
    page,
  };
  const query = useAdminAuditLog(params);

  const filtersActive =
    action !== 'all' || dateFrom !== '' || dateTo !== '' || targetTenantId !== '';

  const clearFilters = () => {
    setAction('all');
    setDateFrom('');
    setDateTo('');
    setTenantIdInput('');
    resetPage();
  };

  const actorCell = (e: AdminAuditLogEntry) => e.actorEmail ?? t('admin.auditLog.systemActor');
  const targetCell = (e: AdminAuditLogEntry) => e.targetTenantEmail ?? t('common.none');

  return (
    <div>
      <AdminPageHeader
        title={t('admin.auditLog.title')}
        description={t('admin.auditLog.description')}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t('admin.auditLog.filterAction')}
          </label>
          <Select
            aria-label={t('admin.auditLog.filterAction')}
            className="w-56"
            value={action}
            onValueChange={(v) => {
              setAction(v);
              resetPage();
            }}
            options={ACTION_OPTIONS.map((o) => ({
              value: o.value,
              label: o.slug ? adminAuditActionLabel(o.slug) : t('admin.auditLog.actionAll'),
            }))}
          />
        </div>
        <div>
          <label htmlFor="audit-from" className="mb-1 block text-xs text-muted-foreground">
            {t('admin.auditLog.filterFrom')}
          </label>
          <Input
            id="audit-from"
            type="date"
            className="w-40"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              resetPage();
            }}
          />
        </div>
        <div>
          <label htmlFor="audit-to" className="mb-1 block text-xs text-muted-foreground">
            {t('admin.auditLog.filterTo')}
          </label>
          <Input
            id="audit-to"
            type="date"
            className="w-40"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              resetPage();
            }}
          />
        </div>
        <div>
          <label htmlFor="audit-tenant" className="mb-1 block text-xs text-muted-foreground">
            {t('admin.auditLog.filterTenantId')}
          </label>
          <Input
            id="audit-tenant"
            className="w-56"
            placeholder={t('admin.auditLog.tenantIdPlaceholder')}
            value={tenantIdInput}
            onChange={(e) => {
              setTenantIdInput(e.target.value);
              resetPage();
            }}
          />
        </div>
      </div>

      <QueryBoundary
        name="admin-audit-log"
        query={query}
        loading={<SkeletonTable rows={10} columns={4} />}
        isEmpty={(d) => d.total === 0}
        empty={
          filtersActive ? (
            <EmptyState
              variant="nothing-found"
              title={t('admin.auditLog.nothingFoundTitle')}
              description={t('admin.auditLog.nothingFoundBody')}
              onClearFilters={clearFilters}
            />
          ) : (
            <EmptyState
              variant="nothing-yet"
              title={t('admin.auditLog.nothingYetTitle')}
              description={t('admin.auditLog.nothingYetBody')}
            />
          )
        }
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <RecordCardList className="flex flex-col gap-3 md:hidden">
              {data.items.map((e) => (
                <RecordCard
                  key={e.id}
                  title={
                    <AdminBadge tone={actionTone(e.action)}>
                      {adminAuditActionLabel(e.action)}
                    </AdminBadge>
                  }
                  fields={[
                    { label: t('admin.auditLog.colWhen'), value: formatDateTime(e.createdAt) },
                    { label: t('admin.auditLog.colActor'), value: actorCell(e) },
                    { label: t('admin.auditLog.colTarget'), value: targetCell(e) },
                    { label: t('admin.auditLog.colSummary'), value: e.summary },
                  ]}
                />
              ))}
            </RecordCardList>

            <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.auditLog.colWhen')}</TableHead>
                    <TableHead>{t('admin.auditLog.colAction')}</TableHead>
                    <TableHead>{t('admin.auditLog.colActor')}</TableHead>
                    <TableHead>{t('admin.auditLog.colTarget')}</TableHead>
                    <TableHead>{t('admin.auditLog.colSummary')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(e.createdAt)}
                      </TableCell>
                      <TableCell>
                        <AdminBadge tone={actionTone(e.action)}>
                          {adminAuditActionLabel(e.action)}
                        </AdminBadge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{actorCell(e)}</TableCell>
                      <TableCell className="text-muted-foreground">{targetCell(e)}</TableCell>
                      <TableCell className="text-foreground">{e.summary}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <AdminPagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
