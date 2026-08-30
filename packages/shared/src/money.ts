/**
 * Money and rate conversions between storage form (integers) and input form
 * (human decimal strings). Storage is always integer — minor units for money
 * (CLAUDE.md), basis points for rates — so all invoice arithmetic stays integer
 * end to end (see backlog 4.1.2). These helpers are the *only* place a decimal
 * string is parsed into, or formatted out of, those integers; the web form uses
 * them, and the Phase 3 renderer will too.
 *
 * Not locale-aware formatting — that is 4.2.7 (currency symbol / grouping per
 * locale). This is the plain `1234` ⇆ `"12.34"` conversion underneath it.
 */

/** Minor units in one major unit. All target currencies (EUR/USD/MKD/ALL/RSD/GBP/
 * CHF) are 2-decimal, so this is a constant, not a per-currency lookup. */
export const MINOR_UNITS_PER_MAJOR = 100;

const AMOUNT_INPUT_RE = /^-?\d+(\.\d{1,2})?$/;
const PERCENT_INPUT_RE = /^\d+(\.\d{1,2})?$/;

/** `1050` → `"10.50"`. Always two fractional digits. */
export function minorToAmountString(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const major = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  const cents = abs % MINOR_UNITS_PER_MAJOR;
  return `${negative ? '-' : ''}${major}.${String(cents).padStart(2, '0')}`;
}

/**
 * `"10.5"` → `1050`. Returns `null` for an empty string or anything that isn't a
 * plain decimal with at most two fractional digits — the caller decides whether
 * `null` means "clear the field" or "invalid".
 */
export function amountStringToMinor(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '' || !AMOUNT_INPUT_RE.test(trimmed)) return null;
  const negative = trimmed.startsWith('-');
  const [major, fraction = ''] = trimmed.replace('-', '').split('.');
  const cents = Number((fraction + '00').slice(0, 2));
  const value = Number(major) * MINOR_UNITS_PER_MAJOR + cents;
  return negative ? -value : value;
}

/** `1800` → `"18"`, `825` → `"8.25"`, `1850` → `"18.5"`. Trailing zeros trimmed. */
export function bpToPercentString(bp: number): string {
  const withDecimals = (bp / 100).toFixed(2);
  const trimmed = withDecimals.replace(/\.?0+$/, '');
  return trimmed === '' ? '0' : trimmed;
}

/** `"8.25"` → `825`, `"18"` → `1800`. `null` for empty / non-numeric / >2 decimals. */
export function percentStringToBp(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '' || !PERCENT_INPUT_RE.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}
