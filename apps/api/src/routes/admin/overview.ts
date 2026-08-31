import {
  type AdminRevenueSeriesQuery,
  type AdminSignupsSeriesQuery,
  adminRevenueSeriesQuerySchema,
  adminSignupsSeriesQuerySchema,
} from '@invoice-saas/shared';
import { Router } from 'express';

import {
  getAdminOverview,
  getRevenueSeries,
  getSignupsSeries,
} from '../../services/admin-overview-service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';

/**
 * Admin overview metrics (backlog Epic 8.2, spec §12). Mounted at
 * `/admin/overview` in `index.ts`, behind `authenticate` + `requireAdmin` — the
 * same double-check every `/admin/*` route carries (8.1.1). All read-only.
 *
 * Three endpoints rather than one so a slow or failing series can't blank the
 * headline numbers (backlog X.7.20 — widgets load and fail independently):
 *
 * `GET /admin/overview`               → the headline card figures (8.2.1).
 * `GET /admin/overview/signups?days=` → daily signup buckets, zero-filled (8.2.2).
 * `GET /admin/overview/revenue?months=` → month-end MRR, reconstructed (8.2.2).
 */
export const adminOverviewRouter: Router = Router();

adminOverviewRouter.use(authenticate, requireAdmin);

adminOverviewRouter.get('/', async (_req, res) => {
  res.json(await getAdminOverview());
});

adminOverviewRouter.get(
  '/signups',
  validate({ query: adminSignupsSeriesQuerySchema }),
  async (req, res) => {
    const { days } = req.query as unknown as AdminSignupsSeriesQuery;
    res.json(await getSignupsSeries(days));
  },
);

adminOverviewRouter.get(
  '/revenue',
  validate({ query: adminRevenueSeriesQuerySchema }),
  async (req, res) => {
    const { months } = req.query as unknown as AdminRevenueSeriesQuery;
    res.json(await getRevenueSeries(months));
  },
);
