import {
  type AdminBillingAttentionQuery,
  type AdminBillingListQuery,
  adminBillingAttentionQuerySchema,
  adminBillingListQuerySchema,
} from '@invoice-saas/shared';
import { Router } from 'express';

import {
  getBillingAttention,
  listBillingSubscriptions,
} from '../../services/admin-billing-service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';

/**
 * Admin billing view (backlog Epic 8.5, spec §12). Mounted at `/admin/billing`,
 * behind `authenticate` + `requireAdmin`.
 *
 * `GET /admin/billing/subscriptions?source=&status=&sort=&page=&pageSize=`
 *   → every subscription, Stripe and manual, each `source`-labelled; `sort=expiry`
 *     orders by `endDate ?? currentPeriodEnd` (8.5.1 list + 8.5.2 grants).
 * `GET /admin/billing/attention?renewalWindowDays=`
 *   → the two Stripe slices needing attention: `failedPayments` (PAST_DUE) and
 *     `upcomingRenewals` (active, not cancelling, renewing within the window) (8.5.1).
 */
export const adminBillingRouter: Router = Router();

adminBillingRouter.use(authenticate, requireAdmin);

adminBillingRouter.get(
  '/subscriptions',
  validate({ query: adminBillingListQuerySchema }),
  async (req, res) => {
    res.json(await listBillingSubscriptions(req.query as unknown as AdminBillingListQuery));
  },
);

adminBillingRouter.get(
  '/attention',
  validate({ query: adminBillingAttentionQuerySchema }),
  async (req, res) => {
    res.json(await getBillingAttention(req.query as unknown as AdminBillingAttentionQuery));
  },
);
