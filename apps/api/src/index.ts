import { mkdirSync } from 'node:fs';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';

import { env, UPLOAD_URL_PATH, uploadDir } from './config/env.js';
import { FONTS_DIR, FONTS_URL_PATH } from './lib/render-assets.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { activityRouter } from './routes/activity.js';
import { adminAuditLogRouter } from './routes/admin/audit-log.js';
import { adminBillingRouter } from './routes/admin/billing.js';
import { adminGrantsRouter } from './routes/admin/grants.js';
import { adminOverviewRouter } from './routes/admin/overview.js';
import { adminSupportRouter } from './routes/admin/support.js';
import { adminTenantsRouter } from './routes/admin/tenants.js';
import { adminUsageRouter } from './routes/admin/usage.js';
import { aiRouter } from './routes/ai.js';
import { authRouter } from './routes/auth.js';
import { billingRouter } from './routes/billing.js';
import { clientsRouter } from './routes/clients.js';
import { invoicesRouter } from './routes/invoices.js';
import { onboardingRouter } from './routes/onboarding.js';
import { productsRouter } from './routes/products.js';
import { profileRouter } from './routes/profile.js';
import { stripeWebhookHandler } from './routes/stripe-webhook.js';
import { templatesRouter } from './routes/templates.js';

const app = express();

// `credentials: true` — the refresh-token cookie is only sent/accepted on
// credentialed requests, and the web app fetches with `credentials: 'include'`.
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(requestLogger);

// Stripe webhook (backlog 6.2.3) — MUST be before `express.json()`: signature
// verification needs the raw request bytes. No auth (the signature is the auth).
app.post('/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Uploaded assets (backlog 1.2.3 — business logos). Served read-only; filenames
// carry a random token so a replaced file gets a new URL, which makes the response
// safely cacheable for a long time. `mkdirSync` so a fresh checkout has the dir.
mkdirSync(uploadDir, { recursive: true });
app.use(
  UPLOAD_URL_PATH,
  express.static(uploadDir, {
    index: false,
    dotfiles: 'ignore',
    immutable: true,
    maxAge: '7d',
  }),
);

// Self-hosted invoice fonts (backlog 3.1.6). The renderer's `@font-face` rules
// point here. Fonts are always fetched in CORS mode, and the live preview loads
// them from a sandboxed iframe whose requests carry `Origin: null` — so these
// public files get a wildcard `Access-Control-Allow-Origin` rather than the
// app-specific one the global `cors()` sets. The PDF pipeline (4.3.1) loads them
// same-origin. Filenames are version-stable, so a long immutable cache is safe.
app.use(
  FONTS_URL_PATH,
  express.static(FONTS_DIR, {
    index: false,
    dotfiles: 'ignore',
    immutable: true,
    maxAge: '30d',
    setHeaders: (res) => {
      res.type('font/woff2');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }),
);

app.use('/auth', authRouter);
app.use('/profile', profileRouter);
app.use('/onboarding', onboardingRouter);
app.use('/clients', clientsRouter);
app.use('/products', productsRouter);
app.use('/templates', templatesRouter);
app.use('/invoices', invoicesRouter);
app.use('/activity', activityRouter);
app.use('/ai', aiRouter);
app.use('/billing', billingRouter);
app.use('/admin/grants', adminGrantsRouter);
app.use('/admin/audit-log', adminAuditLogRouter);
app.use('/admin/overview', adminOverviewRouter);
app.use('/admin/tenants', adminTenantsRouter);
app.use('/admin/usage', adminUsageRouter);
app.use('/admin/billing', adminBillingRouter);
app.use('/admin/support', adminSupportRouter);

// Route modules are mounted above this line. Anything unmatched falls through to
// these two — order matters, both must stay last (backlog 0.2.3, 0.2.5).
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`API running on http://localhost:${env.PORT}`);
});
