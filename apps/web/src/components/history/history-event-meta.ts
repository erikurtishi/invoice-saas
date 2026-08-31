import type { InvoiceEventType, InvoiceHistoryMetadata } from '@invoice-saas/shared';
import type { TFunction } from 'i18next';
import { Copy, Download, FilePlus2, Pencil, Send, type LucideIcon } from 'lucide-react';

/**
 * Presentation lookup for `InvoiceEventType` — shared by the per-invoice timeline
 * (5.2.1) and the dashboard activity feed (5.2.2) so the icon and wording for
 * "Sent" are identical in both places.
 *
 * Kept as a plain `.ts` data/helper module (no components). The wording is
 * resolved through the caller's `t` (Epic X.1.2); the `.tsx` screens build the
 * actual nodes (icons, counterpart `<Link>`s) from what `describeEvent` returns.
 */

export const EVENT_ICON: Record<InvoiceEventType, LucideIcon> = {
  CREATED: FilePlus2,
  EDITED: Pencil,
  DOWNLOADED: Download,
  SENT: Send,
  DUPLICATED_FROM: Copy,
  DUPLICATED_INTO: Copy,
};

/** Translation key (under `history`) for each event's short label. */
export const EVENT_LABEL_KEY = {
  CREATED: 'history.eventCreated',
  EDITED: 'history.eventEdited',
  DOWNLOADED: 'history.eventDownloaded',
  SENT: 'history.eventSent',
  DUPLICATED_FROM: 'history.eventDuplicatedFrom',
  DUPLICATED_INTO: 'history.eventDuplicatedInto',
} as const satisfies Record<InvoiceEventType, string>;

/** Localised short label for an event type. */
export function eventLabel(eventType: InvoiceEventType, t: TFunction): string {
  return t(EVENT_LABEL_KEY[eventType]);
}

/** For a filter `<Select>` — "All activity" plus one option per type. */
export const EVENT_FILTER_ALL = 'ALL';

export interface EventDescription {
  label: string;
  /** A short trailing phrase for the timeline row, e.g. "to ap@acme.com". */
  detail: string | null;
  /**
   * The other invoice in a duplicate link (5.1.2 `counterpart*`), so the screen
   * can render a `<Link>` to it. `number` is null when that side is still a draft.
   */
  counterpart: { id: string; number: string | null } | null;
}

export function describeEvent(
  eventType: InvoiceEventType,
  metadata: InvoiceHistoryMetadata,
  t: TFunction,
): EventDescription {
  const label = eventLabel(eventType, t);

  switch (eventType) {
    case 'SENT':
      return {
        label,
        detail: t('history.sentTo', {
          recipient: metadata.recipient ?? t('history.recipientFallback'),
        }),
        counterpart: null,
      };
    case 'DOWNLOADED':
      return {
        label,
        detail: metadata.withUnsavedEdits ? t('history.downloadedWithUnsavedEdits') : null,
        counterpart: null,
      };
    case 'DUPLICATED_FROM':
    case 'DUPLICATED_INTO':
      return {
        label,
        detail: null,
        counterpart: metadata.counterpartId
          ? { id: metadata.counterpartId, number: metadata.counterpartNumber ?? null }
          : null,
      };
    default:
      return { label, detail: null, counterpart: null };
  }
}

/** Label for the counterpart link — its number, or a "new draft" stand-in. */
export function counterpartLabel(counterpart: { number: string | null }, t: TFunction): string {
  return counterpart.number ?? t('history.counterpartNewDraft');
}
