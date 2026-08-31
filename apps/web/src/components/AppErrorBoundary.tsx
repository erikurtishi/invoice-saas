import { RefreshCw, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { captureError } from '../lib/observability';
import { Button } from './ui/button';
import { ErrorBoundary, type ErrorFallbackProps } from './state/error-boundary';

/**
 * Global error boundary (tasks 0.1.5 + 0.4b.5).
 *
 * The root, last-resort boundary: a render error anywhere it isn't caught closer to
 * the source lands here instead of on a white screen. The fallback is on the 0.4
 * design tokens (0.4b.5) — but deliberately standalone (no `AppShell`), because the
 * shell itself could be what failed. Route-level crashes are caught by a second
 * `ErrorBoundary` inside the shell (see `App.tsx`), which keeps the nav usable.
 */

interface Props {
  children: ReactNode;
  /** Clears cached query errors alongside the boundary's own state. */
  onReset?: () => void;
}

function FullPageFallback({ error, reset }: ErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <TriangleAlert className="size-6 text-destructive" aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-semibold">{t('appError.heading')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t('appError.description')}
        </p>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-h-40 overflow-auto rounded bg-muted p-3 text-left text-xs text-muted-foreground">
            {error.name}: {error.message}
          </pre>
        )}
        <div className="mt-6 flex gap-3">
          <Button onClick={reset}>
            <RefreshCw className="size-4" aria-hidden />
            {t('appError.retry')}
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t('appError.reload')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppErrorBoundary({ children, onReset }: Props) {
  return (
    <ErrorBoundary
      fallbackRender={FullPageFallback}
      onError={(error) => captureError(error, { boundary: 'root' })}
      {...(onReset !== undefined ? { onReset } : {})}
    >
      {children}
    </ErrorBoundary>
  );
}
