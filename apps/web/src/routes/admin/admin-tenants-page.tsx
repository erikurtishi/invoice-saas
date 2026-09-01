import type { AdminTenantListItem, TenantAccessSource } from '@invoice-saas/shared';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

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
import { type AdminTenantListParams } from '../../features/admin/admin-api';
import { useAdminTenants } from '../../features/admin/use-admin';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useFormatters } from '../../i18n/format';

/**
 * Admin tenant list (backlog `L2.3.1`). "Tenant" is the account — in this
 * architecture one `User` row with `role='OWNER'` (decision D3: no separate
 * `Tenant` table; every model's owner FK is `tenantId → users.id`). Backed by the
 * already-complete `GET /admin/tenants`, which resolves `effectiveTier` /
 * `accessSource` from live `Subscription` rows, not the `users.tier` cache.
 */

type TierFilter = 'all' | 'FREE' | 'BASIC' | 'PREMIUM';
type SourceFilter = 'all' | TenantAccessSource;
type StatusFilter = 'all' | 'active' | 'disabled';
type SortValue = 'newest' | 'oldest' | 'email';

function tierTone(tier: string): 'neutral' | 'info' | 'success' {
  return tier === 'PREMIUM' ? 'success' : tier === 'BASIC' ? 'info' : 'neutral';
}

export function AdminTenantsPage() {
  const { t } = useTranslation();
  const { formatRelativeTime, formatNumber } = useFormatters();

  const [searchInput, setSearchInput] = useState('');
  const q = useDebouncedValue(searchInput.trim(), 300);
  const [tier, setTier] = useState<TierFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortValue>('newest');
  const [page, setPage] = useState(1);

  const resetPage = () => setPage(1);

  const params: AdminTenantListParams = {
    ...(q ? { q } : {}),
    ...(tier !== 'all' ? { tier } : {}),
    ...(source !== 'all' ? { source } : {}),
    ...(status !== 'all' ? { status } : {}),
    sort,
    page,
  };
  const query = useAdminTenants(params);

  const filtersActive = q.length > 0 || tier !== 'all' || source !== 'all' || status !== 'all';

  const clearFilters = () => {
    setSearchInput('');
    setTier('all');
    setSource('all');
    setStatus('all');
    resetPage();
  };

  const nameCell = (item: AdminTenantListItem) => (
    <Link
      to={`/admin/tenants/${item.id}`}
      className="rounded font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {item.businessName || item.email}
    </Link>
  );

  const statusBadge = (item: AdminTenantListItem) =>
    item.disabledAt ? (
      <AdminBadge tone="danger">{t('admin.tenants.statusDisabled')}</AdminBadge>
    ) : (
      <AdminBadge tone="success">{t('admin.tenants.statusActive')}</AdminBadge>
    );

  const lastActive = (item: AdminTenantListItem) =>
    item.lastActiveAt ? formatRelativeTime(item.lastActiveAt) : t('common.none');

  const sel = <T extends string>(
    value: T,
    onChange: (v: T) => void,
    label: string,
    options: { value: T; label: string }[],
    className: string,
  ) => (
    <Select
      aria-label={label}
      className={className}
      value={value}
      onValueChange={(v) => {
        onChange(v as T);
        resetPage();
      }}
      options={options}
    />
  );

  return (
    <div>
      <AdminPageHeader
        title={t('admin.tenants.title')}
        description={t('admin.tenants.description')}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            type="search"
            aria-label={t('admin.tenants.searchLabel')}
            placeholder={t('admin.tenants.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              resetPage();
            }}
          />
        </div>
        {sel<TierFilter>(
          tier,
          setTier,
          t('admin.tenants.filterTier'),
          [
            { value: 'all', label: t('admin.tenants.tierAll') },
            { value: 'FREE', label: 'Free' },
            { value: 'BASIC', label: 'Basic' },
            { value: 'PREMIUM', label: 'Premium' },
          ],
          'w-32',
        )}
        {sel<SourceFilter>(
          source,
          setSource,
          t('admin.tenants.filterSource'),
          [
            { value: 'all', label: t('admin.tenants.sourceAll') },
            { value: 'none', label: t('admin.tenants.sourceNone') },
            { value: 'stripe', label: 'Stripe' },
            { value: 'manual', label: t('admin.tenants.sourceManual') },
          ],
          'w-36',
        )}
        {sel<StatusFilter>(
          status,
          setStatus,
          t('admin.tenants.filterStatus'),
          [
            { value: 'all', label: t('admin.tenants.statusAll') },
            { value: 'active', label: t('admin.tenants.statusActive') },
            { value: 'disabled', label: t('admin.tenants.statusDisabled') },
          ],
          'w-36',
        )}
        {sel<SortValue>(
          sort,
          setSort,
          t('admin.tenants.sortLabel'),
          [
            { value: 'newest', label: t('admin.tenants.sortNewest') },
            { value: 'oldest', label: t('admin.tenants.sortOldest') },
            { value: 'email', label: t('admin.tenants.sortEmail') },
          ],
          'w-40',
        )}
      </div>

      <QueryBoundary
        name="admin-tenants"
        query={query}
        loading={<SkeletonTable rows={8} columns={6} />}
        isEmpty={(d) => d.total === 0}
        empty={
          filtersActive ? (
            <EmptyState
              variant="nothing-found"
              title={t('admin.tenants.nothingFoundTitle')}
              description={t('admin.tenants.nothingFoundBody')}
              onClearFilters={clearFilters}
            />
          ) : (
            <EmptyState
              variant="nothing-yet"
              title={t('admin.tenants.nothingYetTitle')}
              description={t('admin.tenants.nothingYetBody')}
            />
          )
        }
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <RecordCardList className="flex flex-col gap-3 md:hidden">
              {data.items.map((item) => (
                <RecordCard
                  key={item.id}
                  title={nameCell(item)}
                  fields={[
                    { label: t('admin.tenants.colEmail'), value: item.email },
                    {
                      label: t('admin.tenants.colTier'),
                      value: (
                        <AdminBadge tone={tierTone(item.effectiveTier)}>
                          {item.effectiveTier}
                        </AdminBadge>
                      ),
                    },
                    { label: t('admin.tenants.colSource'), value: item.accessSource },
                    {
                      label: t('admin.tenants.colInvoices'),
                      value: formatNumber(item.invoicesCreated),
                    },
                    { label: t('admin.tenants.colLastActive'), value: lastActive(item) },
                    { label: t('admin.tenants.colStatus'), value: statusBadge(item) },
                  ]}
                />
              ))}
            </RecordCardList>

            <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.tenants.colTenant')}</TableHead>
                    <TableHead>{t('admin.tenants.colTier')}</TableHead>
                    <TableHead>{t('admin.tenants.colSource')}</TableHead>
                    <TableHead>{t('admin.tenants.colInvoices')}</TableHead>
                    <TableHead>{t('admin.tenants.colLastActive')}</TableHead>
                    <TableHead>{t('admin.tenants.colStatus')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          {nameCell(item)}
                          <span className="text-xs text-muted-foreground">{item.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <AdminBadge tone={tierTone(item.effectiveTier)}>
                          {item.effectiveTier}
                        </AdminBadge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.accessSource}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatNumber(item.invoicesCreated)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{lastActive(item)}</TableCell>
                      <TableCell>{statusBadge(item)}</TableCell>
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
