import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * TODO(X.1.1): route this copy through react-i18next once it is set up.
 * Deliberately hardcoded English for now — see docs/decisions.md, D9. Keeping every
 * string in one object is what makes that a three-line change later.
 */
const COPY = {
  heading: 'Something went wrong',
  description:
    'The page could not be displayed. Your saved work has not been affected — try again, and if the problem continues, reload the page.',
  retry: 'Try again',
} as const;

interface Props {
  children: ReactNode;
  /** Clears cached query errors alongside the boundary's own state. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Global error boundary (task 0.1.5).
 *
 * A render error must never leave the user on a white screen, so this renders a
 * recoverable fallback instead. The polished version, with the app shell still around
 * it, is task 0.4b.5 — this is the baseline that guarantees the app is never blank.
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // TODO(X.5.5): forward to Sentry once error monitoring is wired up.
    console.error('Unhandled render error:', error, errorInfo.componentStack);
  }

  private readonly handleReset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900"
      >
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <TriangleAlert aria-hidden className="size-8 text-amber-500" />
          <h1 className="mt-4 text-xl font-semibold">{COPY.heading}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{COPY.description}</p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            <RefreshCw aria-hidden className="size-4" />
            {COPY.retry}
          </button>
        </div>
      </div>
    );
  }
}
