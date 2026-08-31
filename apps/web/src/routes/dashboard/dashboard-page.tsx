import {
  type ActivityListItem,
  type DocumentType,
  INVOICE_EVENT_TYPES,
  type InvoiceEventType,
} from '@invoice-saas/shared';
import type { TFunction } from 'i18next';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import {
  counterpartLabel,
  describeEvent,
  eventLabel,
  EVENT_FILTER_ALL,
  EVENT_ICON,
} from '../../components/history/history-event-meta';
import { EmptyState } from '../../components/state/empty-state';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonList } from '../../components/state/skeletons';
import { Button, Input, Select } from '../../components/ui';
import {
  getTransition,
  listContainerVariants,
  listItemTransition,
  listItemVariants,
} from '../../lib/motion-presets';
import { useClients } from '../../features/clients/use-clients';
import { type ActivityListParams } from '../../features/history/history-api';
import { useActivity } from '../../features/history/use-history';
import { useFormatters } from '../../i18n/format';

const CLIENT_FILTER_ALL = 'ALL';

function docTypeLabel(docType: DocumentType, t: TFunction): string {
  return t(`docTypes.${docType}`);
}

/**
 * The authenticated home screen — a global activity feed over the event log
 * (backlog 5.2.2), filterable by action type, client and issue-date range.
 * Standard five-states via `<QueryBoundary>`; the invoice library keeps its own
 * page at `/invoices`, which every row here links into.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const [eventType, setEventType] = useState<string>(EVENT_FILTER_ALL);
  const [clientId, setClientId] = useState<string>(CLIENT_FILTER_ALL);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const clientsQuery = useClients({ pageSize: 100, sort: 'name' });
  const clientOptions = [
    { value: CLIENT_FILTER_ALL, label: t('dashboard.allClients') },
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
        <h1 className="text-xl font-semibold text-foreground">{t('dashboard.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.description')}</p>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          aria-label={t('dashboard.filterAction')}
          options={[
            { value: EVENT_FILTER_ALL, label: t('dashboard.allActions') },
            ...INVOICE_EVENT_TYPES.map((evt) => ({ value: evt, label: eventLabel(evt, t) })),
          ]}
          value={eventType}
          onValueChange={(v) => {
            setEventType(v);
            resetToFirstPage();
          }}
        />
        <Select
          aria-label={t('dashboard.filterClient')}
          options={clientOptions}
          value={clientId}
          onValueChange={(v) => {
            setClientId(v);
            resetToFirstPage();
          }}
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="act-from">
            {t('dashboard.filterFrom')}
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
            {t('dashboard.filterTo')}
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
        name="dashboard"
        query={query}
        loading={<SkeletonList rows={10} />}
        isEmpty={(data) => data.total === 0}
        empty={
          filtersActive ? (
            <EmptyState
              variant="nothing-found"
              title={t('dashboard.nothingFoundTitle')}
              description={t('dashboard.nothingFoundBody')}
              onClearFilters={clearFilters}
            />
          ) : (
            <EmptyState
              variant="nothing-yet"
              title={t('dashboard.nothingYetTitle')}
              description={t('dashboard.nothingYetBody')}
              action={
                <Button asChild>
                  <Link to="/console/invoices">{t('dashboard.nothingYetCta')}</Link>
                </Button>
              }
            />
          )
        }
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <motion.ul
              className="divide-y divide-border rounded-lg border border-border"
              variants={listContainerVariants}
              initial="initial"
              animate="animate"
            >
              {data.items.map((item) => (
                <ActivityRow key={item.id} item={item} t={t} />
              ))}
            </motion.ul>

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
    </div>
  );
}

function ActivityRow({ item, t }: { item: ActivityListItem; t: TFunction }) {
  const { formatDateTime, formatRelativeTime } = useFormatters();
  const Icon = EVENT_ICON[item.eventType];
  const { label, detail, counterpart } = describeEvent(item.eventType, item.metadata, t);

  const docLabel = docTypeLabel(item.invoiceDocumentType, t);
  const invoiceName = item.invoiceNumber ?? t('dashboard.untitledInvoice');

  return (
    <motion.li
      className="flex gap-3 px-4 py-3"
      variants={listItemVariants}
      transition={getTransition(listItemTransition)}
    >
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
                to={`/console/invoices/${counterpart.id}`}
                className="rounded font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {counterpartLabel(counterpart, t)}
              </Link>
            </span>
          )}
          <span className="text-muted-foreground"> · </span>
          {item.invoiceDeleted ? (
            <span className="text-muted-foreground">
              {docLabel} {t('dashboard.deletedInvoice')}
            </span>
          ) : (
            <Link
              to={`/console/invoices/${item.invoiceId}`}
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
    </motion.li>
  );
}
