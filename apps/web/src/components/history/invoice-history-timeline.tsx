import type { InvoiceHistoryEventResponse } from '@invoice-saas/shared';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

import { useInvoiceHistory } from '../../features/history/use-history';
import { formatDateTime, formatRelativeTime } from '../../lib/format-time';
import {
  getTransition,
  listContainerVariants,
  listItemTransition,
  listItemVariants,
} from '../../lib/motion-presets';
import { EmptyState } from '../state/empty-state';
import { QueryBoundary } from '../state/query-boundary';
import { SkeletonList } from '../state/skeletons';
import { counterpartLabel, describeEvent, EVENT_ICON } from './history-event-meta';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  heading: 'History',
  emptyTitle: 'No activity yet',
  emptyBody: 'Downloads, sends and edits will show up here.',
  errorRetry: 'Try again',
} as const;

/**
 * The per-invoice history timeline (backlog 5.2.1), embedded in the invoice
 * detail view. Newest event first; entries stagger in on load (5.2.4) via the
 * shared list-stagger presets, which already collapse under
 * `prefers-reduced-motion` (0.4.5). All five UI states come from
 * `<QueryBoundary>`: skeleton on first load, inline error + retry, a
 * "nothing yet" empty state (a fresh draft has no events), the refreshing bar on
 * a background refetch, and the list itself.
 */
export function InvoiceHistoryTimeline({ invoiceId }: { invoiceId: string }) {
  const query = useInvoiceHistory(invoiceId);

  return (
    <section aria-label={COPY.heading} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">{COPY.heading}</h2>

      <QueryBoundary
        query={query}
        loading={<SkeletonList rows={4} />}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            variant="nothing-yet"
            title={COPY.emptyTitle}
            description={COPY.emptyBody}
            className="py-8"
          />
        }
      >
        {(data) => (
          <motion.ul
            className="flex flex-col"
            variants={listContainerVariants}
            initial="initial"
            animate="animate"
          >
            {data.items.map((event, index) => (
              <TimelineRow key={event.id} event={event} isLast={index === data.items.length - 1} />
            ))}
          </motion.ul>
        )}
      </QueryBoundary>
    </section>
  );
}

function TimelineRow({ event, isLast }: { event: InvoiceHistoryEventResponse; isLast: boolean }) {
  const Icon = EVENT_ICON[event.eventType];
  const { label, detail, counterpart } = describeEvent(event.eventType, event.metadata);

  return (
    <motion.li
      variants={listItemVariants}
      transition={getTransition(listItemTransition)}
      className="flex gap-3"
    >
      <div className="flex flex-col items-center">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
        </span>
        {!isLast && <span className="w-px flex-1 bg-border" aria-hidden />}
      </div>

      <div className="min-w-0 pb-5">
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
        </p>
        <p className="text-xs text-muted-foreground" title={formatDateTime(event.timestamp)}>
          {formatRelativeTime(event.timestamp)}
        </p>
      </div>
    </motion.li>
  );
}
