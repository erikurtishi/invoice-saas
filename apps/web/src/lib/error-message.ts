import i18n from '../i18n';
import { HttpError, isClientError } from './http-error';

/**
 * Turns any thrown value into a plain-language sentence safe to show a user —
 * never a status code, never a stack trace (backlog five-states "Error" rule).
 * `<ErrorState>` and the toast system both render through this so the wording of
 * a failure is identical wherever it surfaces.
 *
 * Not a component, so it reads the global i18next instance directly — resources
 * are bundled and `changeLanguage` mutates that instance, so `t()` here always
 * returns the active UI language.
 */
export function toUserMessage(error: unknown): string {
  const t = i18n.t.bind(i18n);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return t('errors.offline');
  }
  if (error instanceof HttpError) {
    if (error.status === 404) return t('errors.notFound');
    if (error.status === 403) return t('errors.forbidden');
    if (error.status === 401) return t('errors.forbidden');
    if (isClientError(error)) return t('errors.badRequest');
    return t('errors.server');
  }
  if (error instanceof Error && error.message.trim() !== '') {
    // A network-layer failure (fetch throws a TypeError) has no useful message for
    // a user; anything else we let through only in dev via `devDetail`.
    return error.name === 'TypeError' ? t('errors.offline') : t('errors.generic');
  }
  return t('errors.generic');
}

/** The raw message, for a dev-only detail line. Empty string in production. */
export function devDetail(error: unknown): string {
  if (!import.meta.env.DEV) return '';
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === 'string' ? error : '';
}
