import { cn } from '../../lib/cn';
import { Skeleton } from '../ui/skeleton';

/**
 * Backlog 0.4b.2 — skeletons whose dimensions match the real content they stand in
 * for, so nothing on the page shifts when data arrives. Built on the `Skeleton`
 * primitive from 0.4.2 (which owns the pulse + reduced-motion behaviour).
 *
 * Rule: a skeleton mirrors *layout*, not detail. Same number of rows, same column
 * rhythm, same card height — not a faithful greyscale copy.
 */

/** Generic vertical stack of lines. The default fallback for `<QueryBoundary>` when
 * a surface hasn't supplied a shape-matched one yet. */
export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Matches list/detail pages backed by `Table` (client list, product list, invoice
 * library, admin tenant list — X.7.1). */
export function SkeletonTable({
  rows = 8,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('w-full overflow-hidden rounded-lg border border-border', className)}
      aria-hidden
    >
      <div className="flex gap-4 border-b border-border bg-muted/50 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className={cn('h-4 flex-1', c === 0 && 'max-w-[40%]')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches a `Card`-shaped summary tile. `count` for a grid of them (dashboard). */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex flex-col gap-4 rounded-lg border border-border bg-card p-6', className)}
      aria-hidden
    >
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

/** Matches a create/edit form: label + field pairs and a submit row. Used while an
 * edit screen loads its record (X.7.1, 4.4.1). */
export function SkeletonForm({ fields = 5, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-6', className)} aria-hidden>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <div className="flex gap-3">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  );
}

/**
 * Matches the template editor's own layout while an existing template loads
 * (X.7.2): a disabled-looking controls rail on the left and a page-shaped preview
 * block on the right, so the split doesn't collapse to a form skeleton then jump
 * to the two-pane editor. Falls back to a stacked shape below `lg`, mirroring the
 * editor's real breakpoint.
 */
export function SkeletonTemplateEditor({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-full min-h-[480px] flex-col overflow-hidden rounded-lg border border-border lg:grid lg:grid-cols-[minmax(320px,380px)_1fr]',
        className,
      )}
      aria-hidden
    >
      <div className="flex flex-col gap-5 border-b border-border p-4 lg:border-b-0 lg:border-r">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center bg-muted/30 p-6">
        <SkeletonInvoicePreview className="max-w-[520px]" />
      </div>
    </div>
  );
}

/**
 * Matches the invoice preview / template editor preview area: a page-shaped block
 * at true paper proportions so the preview pane never collapses then jumps (X.7.2).
 * `ratio` defaults to A4 portrait (1 / √2).
 */
export function SkeletonInvoicePreview({
  ratio = 0.7071,
  className,
}: {
  ratio?: number;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[640px]', className)} aria-hidden>
      <div
        className="flex w-full flex-col gap-6 rounded-md border border-border bg-card p-8 shadow-sm"
        style={{ aspectRatio: String(ratio) }}
      >
        <div className="flex items-start justify-between">
          <Skeleton className="h-14 w-32" />
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
        <div className="mt-auto flex flex-col items-end gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-48" />
        </div>
      </div>
    </div>
  );
}
