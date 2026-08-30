import type { InvoiceEventType, InvoiceHistoryMetadata } from '@invoice-saas/shared';
import { Copy, Download, FilePlus2, Pencil, Send, type LucideIcon } from 'lucide-react';

/**
 * Presentation lookup for `InvoiceEventType` — shared by the per-invoice timeline
 * (5.2.1) and the dashboard activity feed (5.2.2) so the icon and wording for
 * "Sent" are identical in both places.
 *
 * Kept as a plain `.ts` data/helper module (no components) — the `.tsx` screens
 * build the actual nodes (icons, counterpart `<Link>`s) from what `describeEvent`
 * returns.
 *
 * TODO(X.1.1): the strings here are placeholder English, see decision D9.
 */

export const EVENT_ICON: Record<InvoiceEventType, LucideIcon> = {
  CREATED: FilePlus2,
  EDITED: Pencil,
  DOWNLOADED: Download,
  SENT: Send,
  DUPLICATED_FROM: Copy,
  DUPLICATED_INTO: Copy,
};

export const EVENT_LABEL: Record<InvoiceEventType, string> = {
  CREATED: 'Created',
  EDITED: 'Edited',
  DOWNLOADED: 'Downloaded',
  SENT: 'Sent',
  DUPLICATED_FROM: 'Duplicated from',
  DUPLICATED_INTO: 'Duplicated into',
};

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

const RECIPIENT_FALLBACK = 'the client';

export function describeEvent(
  eventType: InvoiceEventType,
  metadata: InvoiceHistoryMetadata,
): EventDescription {
  const label = EVENT_LABEL[eventType];

  switch (eventType) {
    case 'SENT':
      return { label, detail: `to ${metadata.recipient ?? RECIPIENT_FALLBACK}`, counterpart: null };
    case 'DOWNLOADED':
      return {
        label,
        detail: metadata.withUnsavedEdits ? 'with unsaved edits' : null,
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
export function counterpartLabel(counterpart: { number: string | null }): string {
  return counterpart.number ?? 'a new draft';
}
