/**
 * Timestamp formatting for the history / activity screens (backlog Epic 5.2).
 *
 * The invoice *documents* format dates through the shared renderer
 * (`@invoice-saas/shared` `formatDate`, per the invoice's own language). These
 * helpers are for app chrome instead — event timestamps in the UI language —
 * so they lean on the browser's default locale and `Intl`. When X.1.5 lands its
 * locale-aware formatting, this is the one place to thread a locale through.
 */

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const DATE_ONLY = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** Full, unambiguous timestamp — use for `title=` on a relative label. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE_TIME.format(d);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE_ONLY.format(d);
}

const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

/**
 * "just now", "5 minutes ago", "3 days ago", "last month" … Past-leaning: the
 * event log only ever holds timestamps at or before now, and a tiny positive
 * clock skew still reads as "just now".
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;

  let duration = (then.getTime() - now.getTime()) / 1000;
  if (Math.abs(duration) < 45) return 'just now';

  for (const { amount, unit } of DIVISIONS) {
    if (Math.abs(duration) < amount) {
      return RELATIVE.format(Math.round(duration), unit);
    }
    duration /= amount;
  }
  return RELATIVE.format(Math.round(duration), 'year');
}
