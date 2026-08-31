import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import { useSyncAuthLanguage } from './i18n/use-locale';
import { RequireAuth } from './components/auth/require-auth';
import { CookieConsentBanner } from './components/consent/cookie-consent-banner';
import { AppShell } from './components/layout/app-shell';
import { ErrorBoundary } from './components/state/error-boundary';
import { ErrorState } from './components/state/error-state';
import { RouteStatusPage } from './components/state/route-status-page';
import { useConsent } from './features/consent/use-consent';
import { useSession } from './features/auth/use-auth';
import { initAnalytics } from './lib/analytics';
import { getTransition, pageTransition, pageVariants } from './lib/motion-presets';
import { AdminHomePage } from './routes/admin/admin-home-page';
import { LegalPage } from './routes/legal/legal-page';
import { ForgotPasswordPage } from './routes/auth/forgot-password';
import { LoginPage } from './routes/auth/login';
import { ResetPasswordPage } from './routes/auth/reset-password';
import { SignupPage } from './routes/auth/signup';
import { VerifyEmailPage } from './routes/auth/verify-email';
import { ClientsListPage } from './routes/clients/clients-list-page';
import { DashboardPage } from './routes/dashboard/dashboard-page';
import { InvoiceCreatePage } from './routes/invoices/invoice-create-page';
import { InvoiceDetailPage } from './routes/invoices/invoice-detail-page';
import { InvoiceEditPage } from './routes/invoices/invoice-edit-page';
import { InvoicesListPage } from './routes/invoices/invoices-list-page';
import { ProductsListPage } from './routes/products/products-list-page';
import { TemplateEditorPage } from './routes/templates/template-editor-page';
import { TemplatesListPage } from './routes/templates/templates-list-page';
import { OnboardingPage } from './routes/onboarding/onboarding-page';
import { PricingPage } from './routes/pricing/pricing-page';
import { BusinessProfilePage } from './routes/settings/business-profile-page';
import { StateGallery } from './routes/dev/state-gallery';
import { TemplateEditorDevPage } from './routes/dev/template-editor';

// The marketing landing pulls in GSAP for its scroll animations (X.6.2). Lazy so
// that weight never lands in the signed-in app bundle.
const LandingPage = lazy(() =>
  import('./routes/marketing/landing-page').then((m) => ({ default: m.LandingPage })),
);

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

/** The signed-in user app, mounted under `/console` (the marketing site owns `/`,
 * the admin center owns `/admin`). `RequireAuth` gates it; this supplies the
 * chrome (sidebar, mobile nav, banners). A user who hasn't finished onboarding
 * (1.2.4) is sent to the wizard before they can reach any console route. */
function ConsoleLayout() {
  const { data: user } = useSession();
  if (user && !user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/** The admin center, mounted under `/admin`. Same `RequireAuth` as the console,
 * plus an `ADMIN` role gate — a signed-in non-admin gets a 403, not a redirect,
 * so a mistyped `/admin` link reads clearly. The screens themselves are still
 * backend-only (Phase 8), so this currently renders a single status page and
 * carries its own minimal chrome rather than the console shell. */
function AdminLayout() {
  const { data: user } = useSession();
  if (user && user.role !== 'ADMIN') return <RouteStatusPage status={403} />;
  return <Outlet />;
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
          {/* Marketing landing (X.6) — public, owns the bare domain. Redirects a
              signed-in visitor on to their console / admin center. */}
          <Route
            path="/"
            element={
              <PageTransition>
                <Suspense fallback={<div className="min-h-svh bg-background" />}>
                  <LandingPage />
                </Suspense>
              </PageTransition>
            }
          />

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

          {/* Legal pages (X.4.1 / X.4.2) — public, no shell; linked from the footer
              everywhere so a visitor can read them before signing up. */}
          <Route
            path="/privacy"
            element={
              <PageTransition>
                <LegalPage doc="privacy" />
              </PageTransition>
            }
          />
          <Route
            path="/terms"
            element={
              <PageTransition>
                <LegalPage doc="terms" />
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

            {/* The signed-in user app — under /console, wrapped in the shell,
                gated on onboarding. */}
            <Route path="/console" element={<ConsoleLayout />}>
              <Route
                index
                element={
                  <PageTransition>
                    <DashboardPage />
                  </PageTransition>
                }
              />
              <Route
                path="invoices"
                element={
                  <PageTransition>
                    <InvoicesListPage />
                  </PageTransition>
                }
              />
              <Route
                path="invoices/new"
                element={
                  <PageTransition>
                    <InvoiceCreatePage />
                  </PageTransition>
                }
              />
              <Route
                path="invoices/:id"
                element={
                  <PageTransition>
                    <InvoiceDetailPage />
                  </PageTransition>
                }
              />
              <Route
                path="invoices/:id/edit"
                element={
                  <PageTransition>
                    <InvoiceEditPage />
                  </PageTransition>
                }
              />
              <Route
                path="clients"
                element={
                  <PageTransition>
                    <ClientsListPage />
                  </PageTransition>
                }
              />
              <Route
                path="products"
                element={
                  <PageTransition>
                    <ProductsListPage />
                  </PageTransition>
                }
              />
              <Route
                path="templates"
                element={
                  <PageTransition>
                    <TemplatesListPage />
                  </PageTransition>
                }
              />
              <Route
                path="templates/new"
                element={
                  <PageTransition>
                    <TemplateEditorPage />
                  </PageTransition>
                }
              />
              <Route
                path="templates/:id"
                element={
                  <PageTransition>
                    <TemplateEditorPage />
                  </PageTransition>
                }
              />
              <Route
                path="pricing"
                element={
                  <PageTransition>
                    <PricingPage />
                  </PageTransition>
                }
              />
              <Route
                path="settings"
                element={
                  <PageTransition>
                    <BusinessProfilePage />
                  </PageTransition>
                }
              />
              {/* Dev-only states gallery (0.4b.11) — tree-shaken out of production builds. */}
              {import.meta.env.DEV && (
                <Route
                  path="dev/states"
                  element={
                    <PageTransition>
                      <StateGallery />
                    </PageTransition>
                  }
                />
              )}
              {import.meta.env.DEV && (
                <Route
                  path="dev/template-editor"
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
                    <RouteStatusPage status={404} />
                  </PageTransition>
                }
              />
            </Route>

            {/* Admin center — under /admin, ADMIN role only. Backend-only for now
                (Phase 8), so this is a single status page. */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route
                index
                element={
                  <PageTransition>
                    <AdminHomePage />
                  </PageTransition>
                }
              />
              <Route
                path="*"
                element={
                  <PageTransition>
                    <RouteStatusPage status={404} />
                  </PageTransition>
                }
              />
            </Route>
          </Route>

          {/* Anything else — public, no shell. */}
          <Route
            path="*"
            element={
              <PageTransition>
                <RouteStatusPage status={404} />
              </PageTransition>
            }
          />
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

/** Keeps `<html lang>` and i18next in step with the signed-in user's saved
 * language (X.1.4 / X.1.6). Renders nothing. */
function LocaleEffects() {
  const { i18n } = useTranslation();
  useSyncAuthLanguage();
  const lang = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}

/** Cookie-consent side effects (X.4.3): (re)initialise analytics whenever the
 * visitor's consent choice changes — opting in through the banner then takes
 * effect without a reload. `initAnalytics()` is a no-op until consent is `all`. */
function AnalyticsEffects() {
  const { choice } = useConsent();
  useEffect(() => {
    initAnalytics();
  }, [choice]);
  return null;
}

function App() {
  return (
    <>
      <LocaleEffects />
      <AnalyticsEffects />
      <RoutedContent />
      <CookieConsentBanner />
    </>
  );
}

export default App;
