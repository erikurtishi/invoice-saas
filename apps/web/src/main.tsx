import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import { TooltipProvider } from './components/ui/tooltip.tsx';
import './index.css';
import { queryClient } from './lib/query-client.ts';

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
                  <App />
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
