import { type ActivityListQuery, activityListQuerySchema } from '@invoice-saas/shared';
import { Router } from 'express';

import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { listActivity } from '../services/invoice-history-service.js';

/**
 * Dashboard activity feed (backlog 5.2.2). Mounted at `/activity` in `index.ts`,
 * behind `authenticate` + `requireTenant`; the event log is reached only through
 * the tenant-scoped `req.db`.
 *
 * `GET /activity` → the history trail across every invoice, newest first,
 *   filterable by `eventType` / `clientId` / `dateFrom` / `dateTo`, paginated.
 *
 * It is its own router rather than a route on `/invoices` because the feed spans
 * all invoices — there is no `:id` in scope.
 */
export const activityRouter: Router = Router();

activityRouter.use(authenticate, requireTenant);

activityRouter.get('/', validate({ query: activityListQuerySchema }), async (req, res) => {
  res.json(await listActivity(req.db!, req.query as unknown as ActivityListQuery));
});
