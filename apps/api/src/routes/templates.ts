import {
  type TemplateDuplicateInput,
  templateDuplicateSchema,
  type TemplateInput,
  templateInputSchema,
} from '@invoice-saas/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';

import { requireCanManageTemplates } from '../lib/entitlements.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  setDefaultTemplate,
  updateTemplate,
} from '../services/template-service.js';

/**
 * Template endpoints (backlog Epic 3.3). Mounted at `/templates`, behind
 * `authenticate` + `requireTenant`. Reads are open to any authenticated tenant;
 * every write goes through `requireCanManageTemplates` first (3.3.6 — the free
 * tier gets the default template only, enforced server-side per spec §9).
 *
 * `GET    /templates`                 → all live templates, default first (3.3.2)
 * `GET    /templates/:id`             → one template
 * `POST   /templates`                 → create (3.3.1)
 * `PATCH  /templates/:id`             → update name + config
 * `POST   /templates/:id/duplicate`   → copy (3.3.3)
 * `POST   /templates/:id/default`     → make this the tenant default (3.3.4)
 * `DELETE /templates/:id`             → soft delete, auto-promote a new default (3.3.5)
 */
export const templatesRouter: Router = Router();

templatesRouter.use(authenticate, requireTenant);

const idParamSchema = z.object({ id: z.string().min(1) });

templatesRouter.get('/', async (req, res) => {
  res.json(await listTemplates(req.db!));
});

templatesRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    res.json(await getTemplate(req.db!, req.params.id));
  },
);

templatesRouter.post(
  '/',
  validate({ body: templateInputSchema }),
  async (req: Request<never, unknown, TemplateInput>, res) => {
    await requireCanManageTemplates(req.auth!.userId);
    res.status(201).json(await createTemplate(req.db!, req.body));
  },
);

templatesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: templateInputSchema }),
  async (req: Request<{ id: string }, unknown, TemplateInput>, res) => {
    await requireCanManageTemplates(req.auth!.userId);
    res.json(await updateTemplate(req.db!, req.params.id, req.body));
  },
);

templatesRouter.post(
  '/:id/duplicate',
  validate({ params: idParamSchema, body: templateDuplicateSchema }),
  async (req: Request<{ id: string }, unknown, TemplateDuplicateInput>, res) => {
    await requireCanManageTemplates(req.auth!.userId);
    res.status(201).json(await duplicateTemplate(req.db!, req.params.id, req.body.name));
  },
);

templatesRouter.post(
  '/:id/default',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    await requireCanManageTemplates(req.auth!.userId);
    res.json(await setDefaultTemplate(req.db!, req.params.id));
  },
);

templatesRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    await requireCanManageTemplates(req.auth!.userId);
    res.json(await deleteTemplate(req.db!, req.params.id));
  },
);
