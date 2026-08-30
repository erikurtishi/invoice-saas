import type { ProfileLanguage } from '../profile.js';
import { MINOR_UNITS_PER_MAJOR } from '../money.js';

/**
 * Display formatting for the renderer (backlog 3.1.2; locale polish is 4.2.7).
 * Uses `Intl`, which behaves identically in Node and the browser, so the preview
 * and the PDF format numbers and dates the same way. Nothing here rounds money —
 * the integer minor-unit amounts arrive already computed (decision D17).
 */

const INTL_LOCALE: Record<ProfileLanguage, string> = {
  EN: 'en',
  SQ: 'sq',
  MK: 'mk',
};

/** `1234567` minor units → `"12.345,67 €"` (locale-dependent grouping/symbol). */
export function formatMoney(minor: number, currency: string, language: ProfileLanguage): string {
  const amount = minor / MINOR_UNITS_PER_MAJOR;
  try {
    return new Intl.NumberFormat(INTL_LOCALE[language], {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown ISO code → fall back to a plain number plus the raw code.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** `1000` milli-units → `"1"`, `2500` → `"2.5"` (trailing zeros trimmed, locale grouping). */
export function formatQuantity(quantityMilli: number, language: ProfileLanguage): string {
  const value = quantityMilli / 1000;
  return new Intl.NumberFormat(INTL_LOCALE[language], {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

/** `1800` bp → `"18%"`, `825` → `"8.25%"`. */
export function formatPercent(bp: number, language: ProfileLanguage): string {
  return new Intl.NumberFormat(INTL_LOCALE[language], {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(bp / 10000);
}

/** ISO `YYYY-MM-DD` → medium localised date. Invalid input is passed through. */
export function formatDate(iso: string, language: ProfileLanguage): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(INTL_LOCALE[language], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
