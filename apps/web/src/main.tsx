import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import { ToastProvider } from './components/state/toast-viewport.tsx';
import { TooltipProvider } from './components/ui/tooltip.tsx';
// Initialises i18next before the first render (Epic X.1.1). Side-effect import.
import './i18n';
import './index.css';
import { captureError, initObservability } from './lib/observability.ts';
import { queryClient } from './lib/query-client.ts';

// Error monitoring (X.5.5) — no-op unless VITE_SENTRY_DSN is set.
initObservability();

// Dev-only deliberate-error trigger for the L3.3.1 verification: set
// VITE_SENTRY_DSN (+ optionally VITE_SENTRY_RELEASE), run `npm run dev:web`, then
// call `__sentryTestError()` from the browser console and confirm the event
// lands in Sentry tagged with the environment + release. Tree-shaken from prod.
if (import.meta.env.DEV) {
  (window as unknown as { __sentryTestError?: () => void }).__sentryTestError = () => {
    captureError(new Error('L3.3.1 web test error'), { trigger: 'manual' });
    console.info('[sentry-check] captureError fired — check the Sentry issue stream');
  };
}

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <AppErrorBoundary onReset={reset}>
            {/* Backlog 0.4.5: the app-wide backstop for every `motion.*` element.
                `reducedMotion="user"` makes Motion honor the OS setting for any
                animation in the tree automatically — including ones a future screen
                adds without routing through lib/motion-presets.ts. Our presets'
                own `getTransition()` stays too, as belt-and-suspenders for the
                components we control directly. */}
            <MotionConfig reducedMotion="user">
              <BrowserRouter>
                <TooltipProvider>
                  <ToastProvider>
                    <App />
                  </ToastProvider>
                </TooltipProvider>
              </BrowserRouter>
            </MotionConfig>
          </AppErrorBoundary>
        )}
      </QueryErrorResetBoundary>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
);
