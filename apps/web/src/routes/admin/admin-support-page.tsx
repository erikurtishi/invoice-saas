import type { SupportTicketSummary } from '@invoice-saas/shared';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { AdminBadge, AdminPageHeader, AdminPagination } from '../../components/admin/admin-ui';
import { PRIORITY_LABEL_KEYS, STATUS_LABEL_KEYS } from '../../components/admin/support-labels';
import { SupportTicketCreateDialog } from '../../components/admin/support-ticket-create-dialog';
import { EmptyState } from '../../components/state/empty-state';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonTable } from '../../components/state/skeletons';
import {
  Button,
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
import { type AdminSupportListParams } from '../../features/admin/admin-api';
import { useSupportTickets } from '../../features/admin/use-admin';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useFormatters } from '../../i18n/format';

/**
 * Support inbox list (backlog `L2.7.1`). Filterable by status + free-text
 * subject search, sortable, paginated; the header line surfaces the live
 * open/pending counts the list endpoint already computes.
 */

type StatusFilter = 'all' | 'OPEN' | 'PENDING' | 'CLOSED';
type SortValue = 'updated' | 'newest' | 'oldest';

function statusTone(status: SupportTicketSummary['status']): 'info' | 'warning' | 'neutral' {
  switch (status) {
    case 'OPEN':
      return 'info';
    case 'PENDING':
      return 'warning';
    default:
      return 'neutral';
  }
}

function priorityTone(
  priority: SupportTicketSummary['priority'],
): 'neutral' | 'warning' | 'danger' {
  switch (priority) {
    case 'HIGH':
      return 'danger';
    case 'NORMAL':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function AdminSupportPage() {
  const { t } = useTranslation();
  const { formatRelativeTime } = useFormatters();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState('');
  const q = useDebouncedValue(searchInput.trim(), 300);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortValue>('updated');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const resetPage = () => setPage(1);

  const params: AdminSupportListParams = {
    ...(q ? { q } : {}),
    ...(status !== 'all' ? { status } : {}),
    sort,
    page,
  };
  const query = useSupportTickets(params);
  const filtersActive = q.length > 0 || status !== 'all';

  const tenantCell = (ticket: SupportTicketSummary) => {
    if (ticket.tenantId) {
      return (
        <Link
          to={`/admin/tenants/${ticket.tenantId}`}
          className="text-foreground hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {ticket.tenantEmail ?? t('common.none')}
        </Link>
      );
    }
    if (ticket.tenantEmail) {
      return (
        <span className="text-muted-foreground" title={t('admin.support.noMatchingAccount')}>
          {ticket.tenantEmail}
        </span>
      );
    }
    return <span className="text-muted-foreground">{t('common.none')}</span>;
  };

  return (
    <div>
      <AdminPageHeader
        title={t('admin.support.title')}
        description={t('admin.support.description')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            {t('admin.support.newTicket')}
          </Button>
        }
      />

      {query.data && (
        <p className="mb-4 text-sm text-muted-foreground">
          {t('admin.support.countsLine', {
            open: query.data.openCount,
            pending: query.data.pendingCount,
          })}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            type="search"
            aria-label={t('admin.support.searchLabel')}
            placeholder={t('admin.support.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              resetPage();
            }}
          />
        </div>
        <Select
          aria-label={t('admin.support.filterStatus')}
          className="w-36"
          value={status}
          onValueChange={(v) => {
            setStatus(v as StatusFilter);
            resetPage();
          }}
          options={[
            { value: 'all', label: t('admin.support.statusAll') },
            { value: 'OPEN', label: t(STATUS_LABEL_KEYS.OPEN) },
            { value: 'PENDING', label: t(STATUS_LABEL_KEYS.PENDING) },
            { value: 'CLOSED', label: t(STATUS_LABEL_KEYS.CLOSED) },
          ]}
        />
        <Select
          aria-label={t('admin.support.sortLabel')}
          className="w-44"
          value={sort}
          onValueChange={(v) => {
            setSort(v as SortValue);
            resetPage();
          }}
          options={[
            { value: 'updated', label: t('admin.support.sortUpdated') },
            { value: 'newest', label: t('admin.support.sortNewest') },
            { value: 'oldest', label: t('admin.support.sortOldest') },
          ]}
        />
      </div>

      <QueryBoundary
        name="admin-support"
        query={query}
        loading={<SkeletonTable rows={8} columns={5} />}
        isEmpty={(d) => d.total === 0}
        empty={
          filtersActive ? (
            <EmptyState
              variant="nothing-found"
              title={t('admin.support.nothingFoundTitle')}
              description={t('admin.support.nothingFoundBody')}
              onClearFilters={() => {
                setSearchInput('');
                setStatus('all');
                resetPage();
              }}
            />
          ) : (
            <EmptyState
              variant="nothing-yet"
              title={t('admin.support.nothingYetTitle')}
              description={t('admin.support.nothingYetBody')}
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  {t('admin.support.newTicket')}
                </Button>
              }
            />
          )
        }
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <RecordCardList className="flex flex-col gap-3 md:hidden">
              {data.items.map((ticket) => (
                <RecordCard
                  key={ticket.id}
                  title={
                    <Link to={`/admin/support/${ticket.id}`} className="hover:underline">
                      {ticket.subject}
                    </Link>
                  }
                  fields={[
                    { label: t('admin.support.colTenant'), value: tenantCell(ticket) },
                    {
                      label: t('admin.support.colStatus'),
                      value: (
                        <AdminBadge tone={statusTone(ticket.status)}>
                          {t(STATUS_LABEL_KEYS[ticket.status])}
                        </AdminBadge>
                      ),
                    },
                    {
                      label: t('admin.support.colPriority'),
                      value: (
                        <AdminBadge tone={priorityTone(ticket.priority)}>
                          {t(PRIORITY_LABEL_KEYS[ticket.priority])}
                        </AdminBadge>
                      ),
                    },
                    {
                      label: t('admin.support.colLastMessage'),
                      value: ticket.lastMessageAt
                        ? formatRelativeTime(ticket.lastMessageAt)
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
                    <TableHead>{t('admin.support.colSubject')}</TableHead>
                    <TableHead>{t('admin.support.colTenant')}</TableHead>
                    <TableHead>{t('admin.support.colStatus')}</TableHead>
                    <TableHead>{t('admin.support.colPriority')}</TableHead>
                    <TableHead>{t('admin.support.colMessages')}</TableHead>
                    <TableHead>{t('admin.support.colLastMessage')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((ticket) => (
                    <TableRow
                      key={ticket.id}
                      className="cursor-pointer"
                      onClick={() => void navigate(`/admin/support/${ticket.id}`)}
                    >
                      <TableCell>
                        <Link
                          to={`/admin/support/${ticket.id}`}
                          className="font-medium text-foreground hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ticket.subject}
                        </Link>
                      </TableCell>
                      <TableCell>{tenantCell(ticket)}</TableCell>
                      <TableCell>
                        <AdminBadge tone={statusTone(ticket.status)}>
                          {t(STATUS_LABEL_KEYS[ticket.status])}
                        </AdminBadge>
                      </TableCell>
                      <TableCell>
                        <AdminBadge tone={priorityTone(ticket.priority)}>
                          {t(PRIORITY_LABEL_KEYS[ticket.priority])}
                        </AdminBadge>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {ticket.messageCount}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {ticket.lastMessageAt
                          ? formatRelativeTime(ticket.lastMessageAt)
                          : t('common.none')}
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

      <SupportTicketCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false);
          void navigate(`/admin/support/${id}`);
        }}
      />
    </div>
  );
}
