import { type AdminAuditLogQuery, adminAuditLogQuerySchema } from '@invoice-saas/shared';
import { Router } from 'express';

import { listAdminAuditLog } from '../../services/admin-audit-service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';

/**
 * The admin audit trail (backlog 8.1.2). Mounted at `/admin/audit-log` in
 * `index.ts`, behind `authenticate` + `requireAdmin` — the same double-check
 * every `/admin/*` route carries (8.1.1). Read-only: the log is append-only and
 * written only by `services/admin-audit-service.ts` as a side effect of the
 * actions it records.
 *
 * `GET /admin/audit-log?actorUserId=&targetTenantId=&action=&dateFrom=&dateTo=&page=&pageSize=`
 *   → newest-first, paginated. All filters optional; a bare request is the first
 *     page across every admin action.
 */
export const adminAuditLogRouter: Router = Router();

adminAuditLogRouter.use(authenticate, requireAdmin);

adminAuditLogRouter.get('/', validate({ query: adminAuditLogQuerySchema }), async (req, res) => {
  res.json(await listAdminAuditLog(req.query as unknown as AdminAuditLogQuery));
});
