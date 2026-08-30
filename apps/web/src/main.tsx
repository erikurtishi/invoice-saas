import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
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
            <BrowserRouter>
              <TooltipProvider>
                <App />
              </TooltipProvider>
            </BrowserRouter>
          </AppErrorBoundary>
        )}
      </QueryErrorResetBoundary>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
);
