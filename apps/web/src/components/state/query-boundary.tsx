import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { applyForcedState, readForcedState } from './force-state';
import { SkeletonList } from './skeletons';

/**
 * Backlog 0.4b.1 — the wrapper every list and detail page renders its query
 * through. It maps a TanStack Query result straight onto the five UI states so no
 * feature screen re-implements them (and no feature invents a parallel loading
 * boolean — the states come off `isPending` / `isError` / `data` / `isFetching`).
 *
 * Precedence, top to bottom:
 *   1. error with no data to fall back on  → `error` slot (default `<ErrorState>` + retry)
 *   2. first load, no data yet             → `loading` slot (default `<SkeletonList>`)
 *   3. data present but "empty"            → `empty` slot (caller supplies copy)
 *   4. otherwise                           → `children(data)`, with a subtle
 *      refreshing bar while a background refetch of already-shown data runs (X.7.25)
 *
 * Every slot is overridable so a surface can pass its shape-matched skeleton
 * (`<SkeletonTable>`) or its own "nothing yet" `<EmptyState>`.
 */

/** The slice of `UseQueryResult` this needs — keeps the prop type honest without
 * pulling the full generic surface of TanStack Query into call sites. */
export interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  isPlaceholderData: boolean;
  refetch: () => unknown;
}

export interface QueryBoundaryProps<T> {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  /** Dev-only handle for `?force=<state>:<name>` (X.7.27). No runtime effect in
   * production builds. */
  name?: string;
  /** Defaults to: nullish, or an empty array/`{ items: [] }`/`{ data: [] }`. */
  isEmpty?: (data: T) => boolean;
  loading?: ReactNode;
  empty?: ReactNode;
  /** Custom error UI; receives the retry handler already bound to `refetch`. */
  error?: (props: { error: unknown; retry: () => void }) => ReactNode;
  className?: string;
}

function defaultIsEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') {
    const maybeList =
      (data as { items?: unknown; data?: unknown }).items ?? (data as { data?: unknown }).data;
    if (Array.isArray(maybeList)) return maybeList.length === 0;
  }
  return false;
}

export function QueryBoundary<T>({
  query: rawQuery,
  children,
  isEmpty = defaultIsEmpty,
  loading,
  empty,
  error,
  className,
  name,
}: QueryBoundaryProps<T>) {
  // X.7.27 — `?force=<state>` overrides the real result in dev builds only.
  const forced = import.meta.env.DEV ? readForcedState(name) : null;
  const query = forced ? applyForcedState(rawQuery, forced) : rawQuery;

  const retry = () => void query.refetch();

  if (query.isError && query.data === undefined) {
    return (
      <div className={className}>
        {error?.({ error: query.error, retry }) ?? (
          <ErrorState variant="inline" error={query.error} onRetry={retry} />
        )}
      </div>
    );
  }

  if (query.isPending || query.data === undefined) {
    return <div className={className}>{loading ?? <SkeletonList />}</div>;
  }

  if (isEmpty(query.data)) {
    return (
      <div className={className}>
        {empty ?? <EmptyState variant="nothing-yet" title="Nothing here yet" />}
      </div>
    );
  }

  // Data is on screen. A background refetch (or a placeholder-data swap to the next
  // page) shows as a thin bar rather than yanking content back to a skeleton.
  const refreshing = query.isFetching;

  return (
    <div className={cn('relative', className)}>
      {refreshing && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-full bg-primary/20"
          role="status"
          aria-label="Refreshing"
        >
          <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] bg-primary" />
        </div>
      )}
      <div className={cn(query.isPlaceholderData && 'opacity-60 transition-opacity')}>
        {children(query.data)}
      </div>
    </div>
  );
}
