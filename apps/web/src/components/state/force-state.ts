import { HttpError } from '../../lib/http-error';
import type { QueryLike } from './query-boundary';

/**
 * Backlog X.7.27 — dev-only tooling to force any `<QueryBoundary>` into a given
 * state without throttling the network or breaking the API, so the five states
 * are actually testable rather than theoretical.
 *
 * Append `?force=<state>` to any URL in a dev build:
 *
 *   ?force=loading      every boundary on the page shows its loading slot
 *   ?force=error        every boundary shows its error slot (retry wired to refetch)
 *   ?force=empty        every boundary shows its empty slot
 *   ?force=refetching   data renders with the background-refresh bar on top
 *
 * Scope to one boundary by name: `?force=empty:invoices` only affects
 * `<QueryBoundary name="invoices">`. Reload after changing the param.
 *
 * The whole module is behind `import.meta.env.DEV` at the call site, so it and
 * `HttpError` tree-shake out of production bundles.
 */

export type ForcedState = 'loading' | 'error' | 'empty' | 'refetching';

const VALID = new Set<ForcedState>(['loading', 'error', 'empty', 'refetching']);

/** Parse `?force=` for this render. Returns null when absent/invalid or when the
 * `:name` scope doesn't match this boundary. */
export function readForcedState(name?: string): ForcedState | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('force');
  if (!raw) return null;
  const [state, scope] = raw.split(':') as [string, string | undefined];
  if (!VALID.has(state as ForcedState)) return null;
  if (scope && scope !== name) return null;
  return state as ForcedState;
}

/** Apply a forced state on top of a real query result. */
export function applyForcedState<T>(query: QueryLike<T>, forced: ForcedState): QueryLike<T> {
  switch (forced) {
    case 'loading':
      return { ...query, data: undefined, isPending: true, isError: false };
    case 'error':
      return {
        ...query,
        data: undefined,
        isPending: false,
        isError: true,
        error: query.error ?? new HttpError(500, 'Forced error (?force=error)'),
      };
    case 'empty':
      // A shape that satisfies the common `isEmpty` predicates — a bare array, a
      // `{ items }` / `{ data }` page, and the `data.total === 0` custom ones.
      return {
        ...query,
        isPending: false,
        isError: false,
        data: Object.assign([], { items: [], data: [], total: 0, page: 1, totalPages: 0 }) as T,
      };
    case 'refetching':
      return { ...query, isFetching: true };
  }
}
