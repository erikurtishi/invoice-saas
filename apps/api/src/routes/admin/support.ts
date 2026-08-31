import {
  type AdminSupportListQuery,
  type SupportMessageCreate,
  type SupportTicketCreate,
  type SupportTicketUpdate,
  adminSupportListQuerySchema,
  supportMessageCreateSchema,
  supportTicketCreateSchema,
  supportTicketUpdateSchema,
} from '@invoice-saas/shared';
import { type Request, Router } from 'express';
import { z } from 'zod';

import {
  addSupportMessage,
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  updateSupportTicket,
} from '../../services/admin-support-service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/require-admin.js';
import { validate } from '../../middleware/validate.js';

/**
 * Admin support inbox (backlog 8.6.1, spec §12). Mounted at `/admin/support`,
 * behind `authenticate` + `requireAdmin`. Admin-only case tracker — there is no
 * tenant-facing support endpoint.
 *
 * `GET   /admin/support/tickets`               → inbox list (filter + paginate).
 * `POST  /admin/support/tickets`               → open a case `{ tenantEmail, subject, priority?, body }`.
 * `GET   /admin/support/tickets/:id`           → the ticket + full thread.
 * `PATCH /admin/support/tickets/:id`           → status / priority / assignee / subject.
 * `POST  /admin/support/tickets/:id/messages`  → append `{ author, body }`.
 */
export const adminSupportRouter: Router = Router();

adminSupportRouter.use(authenticate, requireAdmin);

const idParamSchema = z.object({ id: z.string().min(1) });

adminSupportRouter.get(
  '/tickets',
  validate({ query: adminSupportListQuerySchema }),
  async (req, res) => {
    res.json(await listSupportTickets(req.query as unknown as AdminSupportListQuery));
  },
);

adminSupportRouter.post(
  '/tickets',
  validate({ body: supportTicketCreateSchema }),
  async (req: Request<never, unknown, SupportTicketCreate>, res) => {
    res.status(201).json(await createSupportTicket(req.auth!.userId, req.body));
  },
);

adminSupportRouter.get(
  '/tickets/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    res.json(await getSupportTicket(req.params.id));
  },
);

adminSupportRouter.patch(
  '/tickets/:id',
  validate({ params: idParamSchema, body: supportTicketUpdateSchema }),
  async (req: Request<{ id: string }, unknown, SupportTicketUpdate>, res) => {
    res.json(await updateSupportTicket(req.params.id, req.auth!.userId, req.body));
  },
);

adminSupportRouter.post(
  '/tickets/:id/messages',
  validate({ params: idParamSchema, body: supportMessageCreateSchema }),
  async (req: Request<{ id: string }, unknown, SupportMessageCreate>, res) => {
    res.status(201).json(await addSupportMessage(req.params.id, req.auth!.userId, req.body));
  },
);
