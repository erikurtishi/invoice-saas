import {
  type ActivityListItem,
  type DocumentType,
  INVOICE_EVENT_TYPES,
  type InvoiceEventType,
} from '@invoice-saas/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  counterpartLabel,
  describeEvent,
  EVENT_FILTER_ALL,
  EVENT_ICON,
  EVENT_LABEL,
} from '../../components/history/history-event-meta';
import { EmptyState } from '../../components/state/empty-state';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonList } from '../../components/state/skeletons';
import { Button, Input, Select } from '../../components/ui';
import { useClients } from '../../features/clients/use-clients';
import { type ActivityListParams } from '../../features/history/history-api';
import { useActivity } from '../../features/history/use-history';
import { formatDateTime, formatRelativeTime } from '../../lib/format-time';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  title: 'Dashboard',
  description: 'Everything that has happened across your invoices.',
  filterAction: 'Action',
  filterClient: 'Client',
  filterFrom: 'From',
  filterTo: 'To',
  allActions: 'All activity',
  allClients: 'All clients',
  clearFilters: 'Clear filters',
  nothingYetTitle: 'No activity yet',
  nothingYetBody: 'Create and send your first invoice — its history shows up here.',
  nothingYetCta: 'Go to invoices',
  nothingFoundTitle: 'No activity matches those filters',
  nothingFoundBody: 'Try a wider date range or a different action.',
  deletedInvoice: 'a deleted invoice',
  untitledInvoice: 'a draft',
  pagePrev: 'Previous',
  pageNext: 'Next',
  pageStatus: (page: number, total: number) => `Page ${page} of ${total}`,
} as const;

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: 'Invoice',
  PROFORMA: 'Proforma',
  QUOTE: 'Quote',
  CREDIT_NOTE: 'Credit note',
  RECEIPT: 'Receipt',
};

const CLIENT_FILTER_ALL = 'ALL';

/**
 * The authenticated home screen — a global activity feed over the event log
 * (backlog 5.2.2), filterable by action type, client and issue-date range.
 * Standard five-states via `<QueryBoundary>`; the invoice library keeps its own
 * page at `/invoices`, which every row here links into.
 *
 * (The public marketing `/`, `/console/*` and `/admin/*` split is a separate,
 * later restructure — this stays mounted at `/` inside the app shell for now.)
 */
export function DashboardPage() {
  const [eventType, setEventType] = useState<string>(EVENT_FILTER_ALL);
  const [clientId, setClientId] = useState<string>(CLIENT_FILTER_ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const clientsQuery = useClients({ pageSize: 100, sort: 'name' });
  const clientOptions = [
    { value: CLIENT_FILTER_ALL, label: COPY.allClients },
    ...(clientsQuery.data?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const params: ActivityListParams = {
    eventType: eventType === EVENT_FILTER_ALL ? undefined : (eventType as InvoiceEventType),
    clientId: clientId === CLIENT_FILTER_ALL ? undefined : clientId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
  };
  const query = useActivity(params);

  const filtersActive =
    eventType !== EVENT_FILTER_ALL ||
    clientId !== CLIENT_FILTER_ALL ||
    dateFrom !== '' ||
    dateTo !== '';

  const resetToFirstPage = () => setPage(1);
  const clearFilters = () => {
    setEventType(EVENT_FILTER_ALL);
    setClientId(CLIENT_FILTER_ALL);
    setDateFrom('');
    setDateTo('');
    resetToFirstPage();
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{COPY.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{COPY.description}</p>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          aria-label={COPY.filterAction}
          options={[
            { value: EVENT_FILTER_ALL, label: COPY.allActions },
            ...INVOICE_EVENT_TYPES.map((t) => ({ value: t, label: EVENT_LABEL[t] })),
          ]}
          value={eventType}
          onValueChange={(v) => {
            setEventType(v);
            resetToFirstPage();
          }}
        />
        <Select
          aria-label={COPY.filterClient}
          options={clientOptions}
          value={clientId}
          onValueChange={(v) => {
            setClientId(v);
            resetToFirstPage();
          }}
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="act-from">
            {COPY.filterFrom}
          </label>
          <Input
            id="act-from"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              resetToFirstPage();
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="act-to">
            {COPY.filterTo}
          </label>
          <Input
            id="act-to"
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
        loading={<SkeletonList rows={10} />}
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
                  <Link to="/invoices">{COPY.nothingYetCta}</Link>
                </Button>
              }
            />
          )
        }
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <ul className="divide-y divide-border rounded-lg border border-border">
              {data.items.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </ul>

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
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityListItem }) {
  const Icon = EVENT_ICON[item.eventType];
  const { label, detail, counterpart } = describeEvent(item.eventType, item.metadata);

  const docLabel = DOC_TYPE_LABELS[item.invoiceDocumentType];
  const invoiceName = item.invoiceNumber ?? COPY.untitledInvoice;

  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">
          <span className="font-medium">{label}</span>
          {detail && <span className="text-muted-foreground"> {detail}</span>}
          {counterpart && (
            <span className="text-muted-foreground">
              {' '}
              <Link
                to={`/invoices/${counterpart.id}`}
                className="rounded font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {counterpartLabel(counterpart)}
              </Link>
            </span>
          )}
          <span className="text-muted-foreground"> · </span>
          {item.invoiceDeleted ? (
            <span className="text-muted-foreground">
              {docLabel} {COPY.deletedInvoice}
            </span>
          ) : (
            <Link
              to={`/invoices/${item.invoiceId}`}
              className="rounded font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {docLabel} {invoiceName}
            </Link>
          )}
          {item.invoiceClientName && (
            <span className="text-muted-foreground"> · {item.invoiceClientName}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground" title={formatDateTime(item.timestamp)}>
          {formatRelativeTime(item.timestamp)}
        </p>
      </div>
    </li>
  );
}
