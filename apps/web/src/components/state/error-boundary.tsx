import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Backlog 0.4b.5 — the reusable error boundary. React only lets a class catch
 * render errors, so this is the one class component in the app; everything
 * app-specific (the designed fallback, query-cache reset) is passed in.
 *
 * Two mount points:
 *   - `<AppErrorBoundary>` at the root — the last resort, full-page fallback,
 *     guarantees the app is never a white screen.
 *   - a second instance inside `AppShell` around the router (see `App.tsx`), so a
 *     crash in one route keeps the nav/shell usable and offers an in-place retry.
 */

export interface ErrorFallbackProps {
  error: Error;
  /** Clears this boundary's error state (and any wired-in query-cache reset), so a
   * re-render can succeed. */
  reset: () => void;
}

interface Props {
  children: ReactNode;
  fallbackRender: (props: ErrorFallbackProps) => ReactNode;
  /** Runs alongside the internal state reset — e.g. TanStack Query's `reset`. */
  onReset?: () => void;
  /** Side-effect hook for logging/monitoring (X.5.5, Sentry later). */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.props.onError) {
      this.props.onError(error, info);
    } else {
      // TODO(X.5.5): forward to Sentry once error monitoring is wired up.
      console.error('Unhandled render error:', error, info.componentStack);
    }
  }

  private readonly reset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    return this.props.fallbackRender({ error: this.state.error, reset: this.reset });
  }
}
