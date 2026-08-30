import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import { AppShell } from './components/layout/app-shell';
import { getTransition, pageTransition, pageVariants } from './lib/motion-presets';
import { PlaceholderPage } from './routes/placeholder-page';

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

function App() {
  const location = useLocation();

  return (
    <AppShell>
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
    </AppShell>
  );
}

export default App;
