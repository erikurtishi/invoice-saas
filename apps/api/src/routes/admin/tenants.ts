import {
  type AdminDisableTenant,
  type AdminTenantListQuery,
  adminDisableTenantSchema,
  adminTenantListQuerySchema,
} from '@invoice-saas/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';

import {
  deleteTenant,
  disableTenant,
  enableTenant,
  getTenantDetail,
  listTenants,
} from '../../services/admin-tenant-service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';

/**
 * Admin tenant management (backlog Epic 8.3, spec §12). Mounted at
 * `/admin/tenants` in `index.ts`, behind `authenticate` + `requireAdmin`.
 *
 * `GET    /admin/tenants`              → searchable, paginated list (8.3.1).
 * `GET    /admin/tenants/:id`          → support detail view (8.3.2).
 * `POST   /admin/tenants/:id/disable`  → disable an account (8.3.4), body `{ reason? }`.
 * `POST   /admin/tenants/:id/enable`   → re-enable it (8.3.4).
 * `DELETE /admin/tenants/:id`          → hard-delete the tenant and all its data (8.3.5).
 *
 * Manual subscription grant/extend/revoke (8.3.3) is the separate
 * `/admin/grants` router (Epic 6.3); a tenant's grants also show in the detail
 * view's `subscriptionHistory`.
 */
export const adminTenantsRouter: Router = Router();

adminTenantsRouter.use(authenticate, requireAdmin);

const idParamSchema = z.object({ id: z.string().min(1) });

adminTenantsRouter.get('/', validate({ query: adminTenantListQuerySchema }), async (req, res) => {
  res.json(await listTenants(req.query as unknown as AdminTenantListQuery));
});

adminTenantsRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    res.json(await getTenantDetail(req.params.id));
  },
);

adminTenantsRouter.post(
  '/:id/disable',
  validate({ params: idParamSchema, body: adminDisableTenantSchema }),
  async (req: Request<{ id: string }, unknown, AdminDisableTenant>, res) => {
    res.json(await disableTenant(req.params.id, req.auth!.userId, req.body.reason));
  },
);

adminTenantsRouter.post(
  '/:id/enable',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    res.json(await enableTenant(req.params.id, req.auth!.userId));
  },
);

adminTenantsRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    res.json(await deleteTenant(req.params.id, req.auth!.userId));
  },
);
