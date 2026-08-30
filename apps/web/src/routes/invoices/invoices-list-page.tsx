import {
  DOCUMENT_TYPES,
  type DocumentType,
  INVOICE_SORT_VALUES,
  type InvoiceListItem,
  type InvoiceSort,
  type InvoiceStatusFilter,
  minorToAmountString,
} from '@invoice-saas/shared';
import { Download, FileDown, MoreHorizontal, Plus, Search } from 'lucide-react';
import { useState } from 'react';
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
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useToast } from '../../hooks/use-toast';
import { toUserMessage } from '../../lib/error-message';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  title: 'Invoices',
  description: 'Every document you’ve issued — search, filter and export.',
  newInvoice: 'New invoice',
  exportCsv: 'Export CSV',
  searchPlaceholder: 'Search by number or client',
  searchLabel: 'Search invoices',
  statusLabel: 'Status',
  typeLabel: 'Document type',
  sortLabel: 'Sort',
  fromLabel: 'From',
  toLabel: 'To',
  allTypes: 'All types',
  colNumber: 'Number',
  colType: 'Type',
  colClient: 'Client',
  colDate: 'Issue date',
  colTotal: 'Total',
  rowActions: 'Invoice actions',
  open: 'Open',
  duplicate: 'Duplicate',
  download: 'Download PDF',
  delete: 'Delete',
  draftBadge: 'Draft',
  none: '—',
  nothingYetTitle: 'No invoices yet',
  nothingYetBody: 'Create your first invoice, proforma, quote, credit note or receipt.',
  nothingYetCta: 'Create your first invoice',
  nothingFoundTitle: 'No invoices match those filters',
  nothingFoundBody: 'Try a wider date range or a different search.',
  deletedToast: 'Invoice deleted.',
  deleteFailed: "Couldn't delete this invoice.",
  duplicatedToast: 'Duplicated — opened as a new draft.',
  duplicateFailed: "Couldn't duplicate this invoice.",
  downloadFailed: "Couldn't generate the PDF.",
  exportFailed: "Couldn't export the CSV.",
  deleteTitle: 'Delete this invoice?',
  deleteBody: (n: string) =>
    `${n} will be removed from your library. Its number stays used — invoice numbers are never reused.`,
  deleteConfirm: 'Delete invoice',
  pagePrev: 'Previous',
  pageNext: 'Next',
  pageStatus: (page: number, total: number) => `Page ${page} of ${total}`,
} as const;

const STATUS_OPTIONS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: 'issued', label: 'Issued' },
  { value: 'draft', label: 'Drafts' },
  { value: 'all', label: 'All' },
];

const SORT_LABELS: Record<InvoiceSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  client: 'Client A–Z',
  '-client': 'Client Z–A',
  total: 'Total low–high',
  '-total': 'Total high–low',
};

const TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: 'Invoice',
  PROFORMA: 'Proforma',
  QUOTE: 'Quote',
  CREDIT_NOTE: 'Credit note',
  RECEIPT: 'Receipt',
};

const ALL_TYPES = 'ALL';

function money(item: InvoiceListItem): string {
  return `${minorToAmountString(item.grandTotalMinor)} ${item.currency}`;
}

/**
 * The invoice library (backlog Epic 4.5). Search by number / client, filter by
 * status / type / issue-date range, sort, paginate; row actions open, duplicate,
 * download or delete; the filtered set exports to CSV (4.5.4). Same
 * `<QueryBoundary>` + five-states shape as the client / product lists.
 */
export function InvoicesListPage() {
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
      toast.success(COPY.duplicatedToast);
      void navigate(`/invoices/${copy.id}/edit`);
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.duplicateFailed);
    }
  };

  const runDownload = async (id: string) => {
    try {
      await downloadMutation.mutateAsync({ id });
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.downloadFailed);
    }
  };

  const runExport = async () => {
    try {
      await exportMutation.mutateAsync(params);
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.exportFailed);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(COPY.deletedToast);
      if (page > 1 && query.data?.items.length === 1) setPage((p) => Math.max(1, p - 1));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.deleteFailed);
      throw err;
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{COPY.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{COPY.description}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void runExport()}
            isLoading={exportMutation.isPending}
            disabled={query.data?.total === 0}
          >
            <FileDown className="size-4" aria-hidden />
            {COPY.exportCsv}
          </Button>
          <Button asChild>
            <Link to="/invoices/new">
              <Plus className="size-4" aria-hidden />
              {COPY.newInvoice}
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
            aria-label={COPY.searchLabel}
            placeholder={COPY.searchPlaceholder}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              resetToFirstPage();
            }}
          />
        </div>

        <Select
          aria-label={COPY.statusLabel}
          options={STATUS_OPTIONS}
          value={status}
          onValueChange={(v) => {
            setStatus(v as InvoiceStatusFilter);
            resetToFirstPage();
          }}
        />

        <Select
          aria-label={COPY.typeLabel}
          options={[
            { value: ALL_TYPES, label: COPY.allTypes },
            ...DOCUMENT_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] })),
          ]}
          value={type}
          onValueChange={(v) => {
            setType(v);
            resetToFirstPage();
          }}
        />

        <Select
          aria-label={COPY.sortLabel}
          options={INVOICE_SORT_VALUES.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
          value={sort}
          onValueChange={(v) => setSort(v as InvoiceSort)}
        />

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="inv-from">
            {COPY.fromLabel}
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
            {COPY.toLabel}
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
        query={query}
        loading={<SkeletonTable rows={8} columns={5} />}
        isEmpty={(data) => data.total === 0}
        empty={
          filtersActive ? (
            <EmptyState
              variant="nothing-found"
              title={COPY.nothingFoundTitle}
              description={COPY.nothingFoundBody}
              onClearFilters={clearFilters}
            />
          ) : (
            <EmptyState
              variant="nothing-yet"
              title={COPY.nothingYetTitle}
              description={COPY.nothingYetBody}
              action={
                <Button asChild>
                  <Link to="/invoices/new">
                    <Plus className="size-4" aria-hidden />
                    {COPY.nothingYetCta}
                  </Link>
                </Button>
              }
            />
          )
        }
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{COPY.colNumber}</TableHead>
                    <TableHead>{COPY.colType}</TableHead>
                    <TableHead>{COPY.colClient}</TableHead>
                    <TableHead>{COPY.colDate}</TableHead>
                    <TableHead className="text-right">{COPY.colTotal}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Link
                          to={`/invoices/${invoice.id}`}
                          className="rounded font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {invoice.number ?? COPY.draftBadge}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {TYPE_LABELS[invoice.documentType]}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {invoice.clientName ?? COPY.none}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{invoice.issueDate}</TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {money(invoice)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={COPY.rowActions}>
                              <MoreHorizontal className="size-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => void navigate(`/invoices/${invoice.id}`)}
                            >
                              {COPY.open}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void runDuplicate(invoice.id)}>
                              {COPY.duplicate}
                            </DropdownMenuItem>
                            {invoice.status === 'ISSUED' && (
                              <DropdownMenuItem onSelect={() => void runDownload(invoice.id)}>
                                <Download className="size-4" aria-hidden />
                                {COPY.download}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem destructive onSelect={() => setDeleteTarget(invoice)}>
                              {COPY.delete}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground" role="status">
                  {COPY.pageStatus(data.page, data.totalPages)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={data.page <= 1}
                  >
                    {COPY.pagePrev}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={data.page >= data.totalPages}
                  >
                    {COPY.pageNext}
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
        title={COPY.deleteTitle}
        description={
          deleteTarget
            ? COPY.deleteBody(deleteTarget.number ?? deleteTarget.documentType)
            : undefined
        }
        confirmLabel={COPY.deleteConfirm}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
