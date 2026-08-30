import { RefreshCw, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

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

/**
 * TODO(X.1.1): route this copy through react-i18next once it is set up (D9).
 */
const COPY = {
  heading: 'Something went wrong',
  description:
    'The page could not be displayed. Your saved work has not been affected — try again, and if the problem continues, reload the page.',
  retry: 'Try again',
  reload: 'Reload page',
} as const;

interface Props {
  children: ReactNode;
  /** Clears cached query errors alongside the boundary's own state. */
  onReset?: () => void;
}

function FullPageFallback({ error, reset }: ErrorFallbackProps) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <TriangleAlert className="size-6 text-destructive" aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-semibold">{COPY.heading}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{COPY.description}</p>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-h-40 overflow-auto rounded bg-muted p-3 text-left text-xs text-muted-foreground">
            {error.name}: {error.message}
          </pre>
        )}
        <div className="mt-6 flex gap-3">
          <Button onClick={reset}>
            <RefreshCw className="size-4" aria-hidden />
            {COPY.retry}
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {COPY.reload}
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
      {...(onReset !== undefined ? { onReset } : {})}
    >
      {children}
    </ErrorBoundary>
  );
}
