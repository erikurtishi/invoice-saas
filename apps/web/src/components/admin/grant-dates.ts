/**
 * Calendar-day helpers for the manual-grant forms (backlog `L2.4.1`). The grant
 * endpoints take a `YYYY-MM-DD` day and the server anchors it to 00:00Z /
 * 23:59:59.999Z itself, so these format in **local** time — the admin picks a day
 * on a calendar, not an instant.
 */

export function todayISODate(): string {
  return toISODate(new Date());
}

export function addMonthsISODate(baseISO: string, months: number): string {
  const [y, m, day] = baseISO.split('-').map(Number);
  return toISODate(new Date(y ?? 1970, (m ?? 1) - 1 + months, day ?? 1));
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
