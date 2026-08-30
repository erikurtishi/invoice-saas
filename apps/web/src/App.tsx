import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import { AppShell } from './components/layout/app-shell';
import { ErrorBoundary } from './components/state/error-boundary';
import { ErrorState } from './components/state/error-state';
import { getTransition, pageTransition, pageVariants } from './lib/motion-presets';
import { PlaceholderPage } from './routes/placeholder-page';
import { StateGallery } from './routes/dev/state-gallery';

function NotFoundPage() {
  return (
    // Minimal on purpose — the designed, i18n'd version with navigation back is
    // X.7.19. This just keeps an unmatched route from being a blank screen.
    <div className="py-12 text-center text-sm text-muted-foreground">Page not found.</div>
  );
}

function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={getTransition(pageTransition)}
    >
      {children}
    </motion.div>
  );
}

/**
 * Route-level error boundary (0.4b.5). A crash inside a route renders here — inside
 * the shell, so the sidebar/nav stay usable and the user can retry in place or
 * navigate away. `resetKey` on the location means simply navigating elsewhere
 * clears a stuck error without a manual retry.
 */
function RoutedContent() {
  const location = useLocation();
  const { reset } = useQueryErrorResetBoundary();

  return (
    <ErrorBoundary
      key={location.pathname}
      onReset={reset}
      fallbackRender={({ error, reset: retry }) => (
        <ErrorState variant="page" error={error} onRetry={retry} className="my-8" />
      )}
    >
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route
            path="/"
            element={
              <PageTransition>
                <PlaceholderPage title="Dashboard" phase="Phase 5" />
              </PageTransition>
            }
          />
          <Route
            path="/invoices"
            element={
              <PageTransition>
                <PlaceholderPage title="Invoices" phase="Phase 4" />
              </PageTransition>
            }
          />
          <Route
            path="/clients"
            element={
              <PageTransition>
                <PlaceholderPage title="Clients" phase="Phase 2" />
              </PageTransition>
            }
          />
          <Route
            path="/products"
            element={
              <PageTransition>
                <PlaceholderPage title="Products" phase="Phase 2" />
              </PageTransition>
            }
          />
          <Route
            path="/templates"
            element={
              <PageTransition>
                <PlaceholderPage title="Templates" phase="Phase 3" />
              </PageTransition>
            }
          />
          <Route
            path="/settings"
            element={
              <PageTransition>
                <PlaceholderPage title="Settings" phase="Phase 1" />
              </PageTransition>
            }
          />
          {/* Dev-only states gallery (0.4b.11) — tree-shaken out of production builds. */}
          {import.meta.env.DEV && (
            <Route
              path="/dev/states"
              element={
                <PageTransition>
                  <StateGallery />
                </PageTransition>
              }
            />
          )}
          <Route
            path="*"
            element={
              <PageTransition>
                <NotFoundPage />
              </PageTransition>
            }
          />
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <AppShell>
      <RoutedContent />
    </AppShell>
  );
}

export default App;
