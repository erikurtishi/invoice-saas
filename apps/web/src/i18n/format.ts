import { MINOR_UNITS_PER_MAJOR } from '@invoice-saas/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { UiLanguageCode } from './index';

/**
 * Locale-correct number / currency / date formatting for the **app chrome**
 * (Epic X.1.5). Bound to the active UI language, not the invoice language — the
 * printed invoice formats through `@invoice-saas/shared` `render/format.ts`, keyed
 * on the document's own language, and that stays untouched.
 *
 * `Intl` behaves identically here and in the renderer, so "12.345,67 €" in a
 * Macedonian UI matches what a Macedonian invoice would print.
 */

const SUPPORTED: Record<UiLanguageCode, true> = { en: true, sq: true, mk: true };

/** Normalises `"MK"`, `"mk-MK"`, `undefined` … to a supported `Intl` locale tag. */
function localeFor(code: string): UiLanguageCode {
  const short = code.slice(0, 2).toLowerCase() as UiLanguageCode;
  return short in SUPPORTED ? short : 'en';
}

export function formatMoney(minor: number, currency: string, uiLanguage: string): string {
  const amount = minor / MINOR_UNITS_PER_MAJOR;
  try {
    return new Intl.NumberFormat(localeFor(uiLanguage), {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatNumber(value: number, uiLanguage: string): string {
  return new Intl.NumberFormat(localeFor(uiLanguage), {
    maximumFractionDigits: 3,
  }).format(value);
}

/** ISO timestamp → medium date + short time, in the UI locale. Invalid → passthrough. */
export function formatDateTime(iso: string, uiLanguage: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(localeFor(uiLanguage), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/** ISO timestamp → medium date, in the UI locale. Invalid → passthrough. */
export function formatDate(iso: string, uiLanguage: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(localeFor(uiLanguage), { dateStyle: 'medium' }).format(d);
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
 * "just now", "5 minutes ago", "last month" … in the UI locale. Past-leaning: the
 * event log only holds timestamps at or before now, and small positive clock skew
 * still reads as "just now".
 */
export function formatRelativeTime(
  iso: string,
  uiLanguage: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;

  const rtf = new Intl.RelativeTimeFormat(localeFor(uiLanguage), { numeric: 'auto' });
  let duration = (then.getTime() - now.getTime()) / 1000;
  if (Math.abs(duration) < 45) {
    // `Intl.RelativeTimeFormat` has no "just now"; 0 seconds gives the locale's
    // "now" phrasing.
    return rtf.format(0, 'second');
  }
  for (const { amount, unit } of DIVISIONS) {
    if (Math.abs(duration) < amount) return rtf.format(Math.round(duration), unit);
    duration /= amount;
  }
  return rtf.format(Math.round(duration), 'year');
}

export interface Formatters {
  formatMoney: (minor: number, currency: string) => string;
  formatNumber: (value: number) => string;
  formatDate: (iso: string) => string;
  formatDateTime: (iso: string) => string;
  formatRelativeTime: (iso: string, now?: Date) => string;
}

/** The app-chrome formatters, pre-bound to the active UI language. */
export function useFormatters(): Formatters {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  return useMemo<Formatters>(
    () => ({
      formatMoney: (minor, currency) => formatMoney(minor, currency, lang),
      formatNumber: (value) => formatNumber(value, lang),
      formatDate: (iso) => formatDate(iso, lang),
      formatDateTime: (iso) => formatDateTime(iso, lang),
      formatRelativeTime: (iso, now) => formatRelativeTime(iso, lang, now),
    }),
    [lang],
  );
}
