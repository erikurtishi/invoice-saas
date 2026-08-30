import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import { RequireAuth } from './components/auth/require-auth';
import { AppShell } from './components/layout/app-shell';
import { ErrorBoundary } from './components/state/error-boundary';
import { ErrorState } from './components/state/error-state';
import { useSession } from './features/auth/use-auth';
import { getTransition, pageTransition, pageVariants } from './lib/motion-presets';
import { PlaceholderPage } from './routes/placeholder-page';
import { ForgotPasswordPage } from './routes/auth/forgot-password';
import { LoginPage } from './routes/auth/login';
import { ResetPasswordPage } from './routes/auth/reset-password';
import { SignupPage } from './routes/auth/signup';
import { VerifyEmailPage } from './routes/auth/verify-email';
import { ClientsListPage } from './routes/clients/clients-list-page';
import { ProductsListPage } from './routes/products/products-list-page';
import { TemplateEditorPage } from './routes/templates/template-editor-page';
import { TemplatesListPage } from './routes/templates/templates-list-page';
import { OnboardingPage } from './routes/onboarding/onboarding-page';
import { BusinessProfilePage } from './routes/settings/business-profile-page';
import { StateGallery } from './routes/dev/state-gallery';
import { TemplateEditorDevPage } from './routes/dev/template-editor';

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

/** Everything behind a login renders inside the shell. `RequireAuth` gates it;
 * this supplies the chrome (sidebar, mobile nav, banners). A user who hasn't
 * finished onboarding (1.2.4) is sent to the wizard before they can reach any
 * shell route. */
function AuthedLayout() {
  const { data: user } = useSession();
  if (user && !user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
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
          {/* Public — no shell, no session required. */}
          <Route
            path="/login"
            element={
              <PageTransition>
                <LoginPage />
              </PageTransition>
            }
          />
          <Route
            path="/signup"
            element={
              <PageTransition>
                <SignupPage />
              </PageTransition>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PageTransition>
                <ForgotPasswordPage />
              </PageTransition>
            }
          />
          <Route
            path="/reset-password"
            element={
              <PageTransition>
                <ResetPasswordPage />
              </PageTransition>
            }
          />
          <Route
            path="/verify-email"
            element={
              <PageTransition>
                <VerifyEmailPage />
              </PageTransition>
            }
          />

          {/* Authenticated — gated by RequireAuth. */}
          <Route element={<RequireAuth />}>
            {/* Onboarding wizard (1.2.4): authed, but its own focused layout — no
                app shell, and no onboarding-complete gate (this is that gate's
                destination). */}
            <Route
              path="/onboarding"
              element={
                <PageTransition>
                  <OnboardingPage />
                </PageTransition>
              }
            />

            {/* The rest of the app — wrapped in the shell, gated on onboarding. */}
            <Route element={<AuthedLayout />}>
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
                    <ClientsListPage />
                  </PageTransition>
                }
              />
              <Route
                path="/products"
                element={
                  <PageTransition>
                    <ProductsListPage />
                  </PageTransition>
                }
              />
              <Route
                path="/templates"
                element={
                  <PageTransition>
                    <TemplatesListPage />
                  </PageTransition>
                }
              />
              <Route
                path="/templates/new"
                element={
                  <PageTransition>
                    <TemplateEditorPage />
                  </PageTransition>
                }
              />
              <Route
                path="/templates/:id"
                element={
                  <PageTransition>
                    <TemplateEditorPage />
                  </PageTransition>
                }
              />
              <Route
                path="/settings"
                element={
                  <PageTransition>
                    <BusinessProfilePage />
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
              {import.meta.env.DEV && (
                <Route
                  path="/dev/template-editor"
                  element={
                    <PageTransition>
                      <TemplateEditorDevPage />
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
            </Route>
          </Route>
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

function App() {
  return <RoutedContent />;
}

export default App;
