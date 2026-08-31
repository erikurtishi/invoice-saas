import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../lib/cn';
import { devDetail, toUserMessage } from '../../lib/error-message';
import { Button } from '../ui/button';

/**
 * Backlog 0.4b.4 — the one error-state component, in two variants:
 *
 * - `inline` — one widget or list failed inside an otherwise-fine page. Sits in
 *   place, carries its own retry, never takes over the screen. This is what
 *   `<QueryBoundary>` renders and what a partial/degraded surface uses per widget
 *   (five-states "Partial" rule, X.7.13 / X.7.20).
 * - `page`   — the whole surface failed to load. Centred, larger, still recoverable.
 *
 * Always plain language + a recovery action, never a raw code or stack trace. The
 * wording comes from `toUserMessage`, shared with the toast system so a failure
 * reads identically wherever it shows.
 */

export interface ErrorStateProps {
  variant?: 'inline' | 'page';
  /** Overrides the default heading. */
  title?: string;
  /** Overrides the derived plain-language message. */
  description?: string;
  /** The thrown value — used to derive the message and a dev-only detail line. */
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  variant = 'inline',
  title,
  description,
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  const { t } = useTranslation();
  const heading =
    title ?? (variant === 'page' ? t('states.pageErrorTitle') : t('states.inlineErrorTitle'));
  const message = description ?? toUserMessage(error);
  const detail = devDetail(error);

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 text-center',
        variant === 'page' ? 'px-6 py-16' : 'px-4 py-8',
        className,
      )}
    >
      <TriangleAlert
        className={cn('text-destructive', variant === 'page' ? 'size-8' : 'size-6')}
        aria-hidden
      />
      <h3
        className={cn('font-semibold text-foreground', variant === 'page' ? 'text-lg' : 'text-sm')}
      >
        {heading}
      </h3>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {detail !== '' && (
        <pre className="max-w-full overflow-x-auto rounded bg-muted px-2 py-1 text-left text-xs text-muted-foreground">
          {detail}
        </pre>
      )}
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-1 border-destructive/40 text-foreground hover:bg-destructive/10"
        >
          <RefreshCw className="size-4" aria-hidden />
          {t('states.retry')}
        </Button>
      )}
    </div>
  );
}
