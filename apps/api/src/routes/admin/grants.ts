import {
  type ManualGrantCreate,
  type ManualGrantUpdate,
  manualGrantCreateSchema,
  manualGrantUpdateSchema,
} from '@invoice-saas/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';

import {
  createManualGrant,
  listTenantGrants,
  revokeManualGrant,
  updateManualGrant,
} from '../../services/manual-grant-service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';

/**
 * Manual (cash) subscription grants — admin only (backlog Epic 6.3). Mounted at
 * `/admin/grants` in `index.ts`, behind `authenticate` + `requireAdmin`. Not
 * tenant-scoped: admin actions are cross-tenant, and the service resolves the
 * tenant from the email in the payload.
 *
 * `GET    /admin/grants?email=` → the tenant + every manual grant they hold, with
 *   status / expiry / days-remaining (6.3.6).
 * `POST   /admin/grants`        → issue a grant `{ email, tier, startDate, endDate, note? }` (6.3.1).
 * `PATCH  /admin/grants/:id`    → extend / shorten / re-note (6.3.4).
 * `DELETE /admin/grants/:id`    → revoke now; the row is kept, marked CANCELED (6.3.4).
 *
 * The admin *form* (6.3.2) is deferred to the Epic 8 admin center; `npm run grant
 * -w @invoice-saas/api` is the interim way to issue one.
 */
export const adminGrantsRouter: Router = Router();

adminGrantsRouter.use(authenticate, requireAdmin);

const emailQuerySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1)
    .email()
    .transform((v) => v.toLowerCase()),
});
const idParamSchema = z.object({ id: z.string().min(1) });

adminGrantsRouter.get(
  '/',
  validate({ query: emailQuerySchema }),
  async (req: Request<never, unknown, never, { email: string }>, res) => {
    res.json(await listTenantGrants(req.query.email));
  },
);

adminGrantsRouter.post(
  '/',
  validate({ body: manualGrantCreateSchema }),
  async (req: Request<never, unknown, ManualGrantCreate>, res) => {
    res.status(201).json(await createManualGrant(req.auth!.userId, req.body));
  },
);

adminGrantsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: manualGrantUpdateSchema }),
  async (req: Request<{ id: string }, unknown, ManualGrantUpdate>, res) => {
    res.json(await updateManualGrant(req.params.id, req.body));
  },
);

adminGrantsRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    res.json(await revokeManualGrant(req.params.id));
  },
);
