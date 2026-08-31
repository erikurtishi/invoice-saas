import { type AdminUsageQuery, adminUsageQuerySchema } from '@invoice-saas/shared';
import { Router } from 'express';

import {
  getAiUsage,
  getEmailUsage,
  getStorageUsage,
  getUsageAnomalies,
} from '../../services/admin-usage-service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';

/**
 * Admin cost & usage monitoring (backlog Epic 8.4, spec §12). Mounted at
 * `/admin/usage` in `index.ts`, behind `authenticate` + `requireAdmin`.
 *
 * `GET /admin/usage/ai?days=&limit=`       → AI generations vs limits + cost (8.4.1).
 * `GET /admin/usage/email?days=&limit=`    → email send volume (8.4.2).
 * `GET /admin/usage/storage?limit=`        → stored-asset footprint (8.4.3).
 * `GET /admin/usage/anomalies`             → spike signal for AI cost / sends (8.4.4).
 *
 * Separate endpoints so one slow scan can't blank the rest of the panel (X.7.20).
 */
export const adminUsageRouter: Router = Router();

adminUsageRouter.use(authenticate, requireAdmin);

adminUsageRouter.get('/ai', validate({ query: adminUsageQuerySchema }), async (req, res) => {
  res.json(await getAiUsage(req.query as unknown as AdminUsageQuery));
});

adminUsageRouter.get('/email', validate({ query: adminUsageQuerySchema }), async (req, res) => {
  res.json(await getEmailUsage(req.query as unknown as AdminUsageQuery));
});

adminUsageRouter.get('/storage', validate({ query: adminUsageQuerySchema }), async (req, res) => {
  res.json(await getStorageUsage(req.query as unknown as AdminUsageQuery));
});

adminUsageRouter.get('/anomalies', async (_req, res) => {
  res.json(await getUsageAnomalies());
});
