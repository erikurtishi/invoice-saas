import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../lib/cn';
import { Button } from '../ui';

/**
 * Small shared building blocks for the `/admin/*` screens (backlog Phase L2).
 * Kept together because none is big enough for its own file and every admin
 * screen composes two or three of them.
 */

/** Page title + optional description + optional right-aligned actions. */
export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

/** A titled panel — one per widget-group (`X.7.20`: each holds its own boundary). */
export function AdminSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-lg border border-border bg-card p-4 sm:p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * One headline number. `caption` is the place for the "documented approximation"
 * caveats the overview needs (`L2.2.1`).
 */
export function StatTile({
  label,
  value,
  caption,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  tone?: 'default' | 'warning';
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'warning' ? 'text-warning-foreground' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

/** Standard prev/next pager for the admin list screens. Renders nothing when
 *  there is only one page. */
export function AdminPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground" role="status">
        {t('common.pageStatus', { page, total: totalPages })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          {t('common.previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}

/** Small status/label pill. Colour is chosen by the caller via `tone`. */
export function AdminBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  const toneClass = {
    neutral: 'bg-muted text-muted-foreground',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning text-warning-foreground',
    danger: 'bg-destructive/10 text-destructive',
    info: 'bg-primary/10 text-primary',
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

/** Calm "not enough data yet" placeholder for a chart or metric on a fresh DB
 *  (`L2.2.3` / `X.7.8`). */
export function AdminNoData({ message }: { message?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[8rem] items-center justify-center rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {message ?? t('admin.common.noData')}
    </div>
  );
}
