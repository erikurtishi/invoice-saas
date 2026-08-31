import {
  DOCUMENT_TYPES,
  type DocumentType,
  INVOICE_SORT_VALUES,
  type InvoiceListItem,
  type InvoiceSort,
  type InvoiceStatusFilter,
  minorToAmountString,
} from '@invoice-saas/shared';
import type { TFunction } from 'i18next';
import { Download, FileDown, Mail, MoreHorizontal, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { EmptyState } from '../../components/state/empty-state';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonTable } from '../../components/state/skeletons';
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import {
  useDeleteInvoice,
  useDownloadInvoicePdf,
  useDuplicateInvoice,
  useExportInvoicesCsv,
  useInvoices,
} from '../../features/invoices/use-invoices';
import { useFormatters } from '../../i18n/format';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useToast } from '../../hooks/use-toast';
import { toUserMessage } from '../../lib/error-message';

const STATUS_LABEL_KEY = {
  issued: 'invoices.statusIssued',
  draft: 'invoices.statusDrafts',
  all: 'invoices.statusAll',
} as const satisfies Record<InvoiceStatusFilter, string>;

const SORT_LABEL_KEY = {
  newest: 'invoices.sortNewest',
  oldest: 'invoices.sortOldest',
  client: 'invoices.sortClientAsc',
  '-client': 'invoices.sortClientDesc',
  total: 'invoices.sortTotalAsc',
  '-total': 'invoices.sortTotalDesc',
} as const satisfies Record<InvoiceSort, string>;

const ALL_TYPES = 'ALL';

function money(item: InvoiceListItem): string {
  return `${minorToAmountString(item.grandTotalMinor)} ${item.currency}`;
}

/**
 * The event-log roll-up for a row (backlog 5.2.3): download count and who it was
 * last sent to, compact. `—` when neither has happened (every DRAFT, and issued
 * invoices not yet touched).
 */
function ActivityCell({ item }: { item: InvoiceListItem }) {
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  if (item.downloadCount === 0 && !item.lastSentTo && !item.lastSentAt) {
    return <span className="text-muted-foreground">{t('common.none')}</span>;
  }
  return (
    <span className="flex items-center gap-3 text-xs text-muted-foreground">
      {item.downloadCount > 0 && (
        <span
          className="inline-flex items-center gap-1 tabular-nums"
          title={t('invoices.downloadsTitle', { count: item.downloadCount })}
        >
          <Download className="size-3.5" aria-hidden />
          {item.downloadCount}
        </span>
      )}
      {item.lastSentAt && (
        <span
          className="inline-flex min-w-0 items-center gap-1"
          title={
            item.lastSentTo
              ? t('invoices.lastSentTitle', {
                  recipient: item.lastSentTo,
                  when: formatDate(item.lastSentAt),
                })
              : formatDate(item.lastSentAt)
          }
        >
          <Mail className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{item.lastSentTo ?? formatDate(item.lastSentAt)}</span>
        </span>
      )}
    </span>
  );
}

/**
 * The invoice library (backlog Epic 4.5). Search by number / client, filter by
 * status / type / issue-date range, sort, paginate; row actions open, duplicate,
 * download or delete; the filtered set exports to CSV (4.5.4). Same
 * `<QueryBoundary>` + five-states shape as the client / product lists.
 */
export function InvoicesListPage() {
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const navigate = useNavigate();
  const toast = useToast();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 300);
  const [status, setStatus] = useState<InvoiceStatusFilter>('issued');
  const [type, setType] = useState<string>(ALL_TYPES);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<InvoiceSort>('newest');
  const [page, setPage] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState<InvoiceListItem | null>(null);

  const deleteMutation = useDeleteInvoice();
  const duplicateMutation = useDuplicateInvoice();
  const downloadMutation = useDownloadInvoicePdf();
  const exportMutation = useExportInvoicesCsv();

  const statusOptions: { value: InvoiceStatusFilter; label: string }[] = (
    ['issued', 'draft', 'all'] as const
  ).map((v) => ({ value: v, label: t(STATUS_LABEL_KEY[v]) }));

  const typeLabel = (dt: DocumentType, tt: TFunction) => tt(`docTypes.${dt}`);

  const params = {
    search: search || undefined,
    status,
    documentType: type === ALL_TYPES ? undefined : (type as DocumentType),
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sort,
    page,
  };
  const query = useInvoices(params);

  const filtersActive =
    search.length > 0 ||
    status !== 'issued' ||
    type !== ALL_TYPES ||
    dateFrom !== '' ||
    dateTo !== '';

  const resetToFirstPage = () => setPage(1);
  const clearFilters = () => {
    setSearchInput('');
    setStatus('issued');
    setType(ALL_TYPES);
    setDateFrom('');
    setDateTo('');
    resetToFirstPage();
  };

  const runDuplicate = async (id: string) => {
    try {
      const copy = await duplicateMutation.mutateAsync(id);
      toast.success(t('invoices.duplicatedToast'));
      void navigate(`/console/invoices/${copy.id}/edit`);
    } catch (err) {
      toast.error(toUserMessage(err) || t('invoices.duplicateFailed'));
    }
  };

  const runDownload = async (id: string) => {
    try {
      await downloadMutation.mutateAsync({ id });
    } catch (err) {
      toast.error(toUserMessage(err) || t('invoices.downloadFailed'));
    }
  };

  const runExport = async () => {
    try {
      await exportMutation.mutateAsync(params);
    } catch (err) {
      toast.error(toUserMessage(err) || t('invoices.exportFailed'));
    }
  };

  const numberLink = (invoice: InvoiceListItem) => (
    <Link
      to={`/console/invoices/${invoice.id}`}
      className="rounded font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {invoice.number ?? t('invoices.draftBadge')}
    </Link>
  );

  const rowMenu = (invoice: InvoiceListItem) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('invoices.rowActions')}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void navigate(`/console/invoices/${invoice.id}`)}>
          {t('invoices.open')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void runDuplicate(invoice.id)}>
          {t('invoices.duplicate')}
        </DropdownMenuItem>
        {invoice.status === 'ISSUED' && (
          <DropdownMenuItem onSelect={() => void runDownload(invoice.id)}>
            <Download className="size-4" aria-hidden />
            {t('invoices.downloadPdf')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem destructive onSelect={() => setDeleteTarget(invoice)}>
          {t('common.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(t('invoices.deletedToast'));
      if (page > 1 && query.data?.items.length === 1) setPage((p) => Math.max(1, p - 1));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(toUserMessage(err) || t('invoices.deleteFailed'));
      throw err;
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('invoices.listTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('invoices.listDescription')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void runExport()}
            isLoading={exportMutation.isPending}
            disabled={query.data?.total === 0}
          >
            <FileDown className="size-4" aria-hidden />
            {t('invoices.exportCsv')}
          </Button>
          <Button asChild>
            <Link to="/console/invoices/new">
              <Plus className="size-4" aria-hidden />
              {t('invoices.newInvoice')}
            </Link>
          </Button>
        </div>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            type="search"
            aria-label={t('invoices.searchLabel')}
            placeholder={t('invoices.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              resetToFirstPage();
            }}
          />
        </div>

        <Select
          aria-label={t('invoices.statusLabel')}
          options={statusOptions}
          value={status}
          onValueChange={(v) => {
            setStatus(v as InvoiceStatusFilter);
            resetToFirstPage();
          }}
        />

        <Select
          aria-label={t('invoices.typeLabel')}
          options={[
            { value: ALL_TYPES, label: t('invoices.allTypes') },
            ...DOCUMENT_TYPES.map((dt) => ({ value: dt, label: typeLabel(dt, t) })),
          ]}
          value={type}
          onValueChange={(v) => {
            setType(v);
            resetToFirstPage();
          }}
        />

        <Select
          aria-label={t('invoices.sortLabel')}
          options={INVOICE_SORT_VALUES.map((s) => ({ value: s, label: t(SORT_LABEL_KEY[s]) }))}
          value={sort}
          onValueChange={(v) => setSort(v as InvoiceSort)}
        />

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="inv-from">
            {t('invoices.fromLabel')}
          </label>
          <Input
            id="inv-from"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              resetToFirstPage();
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="inv-to">
            {t('invoices.toLabel')}
          </label>
          <Input
            id="inv-to"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              resetToFirstPage();
            }}
          />
        </div>
      </div>

      <QueryBoundary
        name="invoices"
        query={query}
        loading={<SkeletonTable rows={8} columns={6} />}
        isEmpty={(data) => data.total === 0}
        empty={
          filtersActive ? (
            <EmptyState
              variant="nothing-found"
              title={t('invoices.nothingFoundTitle')}
              description={t('invoices.nothingFoundBody')}
              onClearFilters={clearFilters}
            />
          ) : (
            <EmptyState
              variant="nothing-yet"
              title={t('invoices.nothingYetTitle')}
              description={t('invoices.nothingYetBody')}
              action={
                <Button asChild>
                  <Link to="/console/invoices/new">
                    <Plus className="size-4" aria-hidden />
                    {t('invoices.nothingYetCta')}
                  </Link>
                </Button>
              }
            />
          )
        }
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <RecordCardList className="flex flex-col gap-3 md:hidden">
              {data.items.map((invoice) => (
                <RecordCard
                  key={invoice.id}
                  title={numberLink(invoice)}
                  actions={rowMenu(invoice)}
                  fields={[
                    { label: t('invoices.colType'), value: typeLabel(invoice.documentType, t) },
                    {
                      label: t('invoices.colClient'),
                      value: invoice.clientName ?? t('common.none'),
                    },
                    { label: t('invoices.colDate'), value: formatDate(invoice.issueDate) },
                    { label: t('invoices.colTotal'), value: money(invoice) },
                    { label: t('invoices.colActivity'), value: <ActivityCell item={invoice} /> },
                  ]}
                />
              ))}
            </RecordCardList>

            <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('invoices.colNumber')}</TableHead>
                    <TableHead>{t('invoices.colType')}</TableHead>
                    <TableHead>{t('invoices.colClient')}</TableHead>
                    <TableHead>{t('invoices.colDate')}</TableHead>
                    <TableHead>{t('invoices.colActivity')}</TableHead>
                    <TableHead className="text-right">{t('invoices.colTotal')}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>{numberLink(invoice)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {typeLabel(invoice.documentType, t)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {invoice.clientName ?? t('common.none')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(invoice.issueDate)}
                      </TableCell>
                      <TableCell className="max-w-[12rem]">
                        <ActivityCell item={invoice} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {money(invoice)}
                      </TableCell>
                      <TableCell>{rowMenu(invoice)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground" role="status">
                  {t('common.pageStatus', { page: data.page, total: data.totalPages })}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={data.page <= 1}
                  >
                    {t('common.previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={data.page >= data.totalPages}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </QueryBoundary>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t('invoices.deleteTitle')}
        description={
          deleteTarget
            ? t('invoices.deleteBody', { name: deleteTarget.number ?? deleteTarget.documentType })
            : undefined
        }
        confirmLabel={t('invoices.deleteConfirm')}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
