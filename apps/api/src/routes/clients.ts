import {
  type ClientInput,
  clientInputSchema,
  type ClientListQuery,
  clientListQuerySchema,
} from '@invoice-saas/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  createClient,
  deleteClient,
  getClient,
  listClients,
  updateClient,
} from '../services/client-service.js';

/**
 * Client endpoints (backlog Epic 2.1). Mounted at `/clients` in `index.ts`.
 *
 * Every handler sits behind `authenticate` + `requireTenant` and reaches the
 * database only through `req.db` — the tenant-scoped client. The scope is a
 * property of that client (see `db/tenant-scope.ts`), never a `where` clause
 * written here.
 *
 * `GET    /clients`      → one page of the tenant's clients (search / sort / paginate)
 * `POST   /clients`      → create a client (2.1.3)
 * `GET    /clients/:id`  → one client
 * `PATCH  /clients/:id`  → replace all editable fields (2.1.3)
 * `DELETE /clients/:id`  → soft delete (2.1.4, decision D4)
 */
export const clientsRouter: Router = Router();

clientsRouter.use(authenticate, requireTenant);

const idParamSchema = z.object({ id: z.string().min(1) });

clientsRouter.get('/', validate({ query: clientListQuerySchema }), async (req, res) => {
  // `validate` has already parsed `req.query` in place against the schema above.
  const query = req.query as unknown as ClientListQuery;
  res.json(await listClients(req.db!, query));
});

clientsRouter.post(
  '/',
  validate({ body: clientInputSchema }),
  async (req: Request<never, unknown, ClientInput>, res) => {
    res.status(201).json(await createClient(req.db!, req.body));
  },
);

clientsRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    res.json(await getClient(req.db!, req.params.id));
  },
);

clientsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: clientInputSchema }),
  async (req: Request<{ id: string }, unknown, ClientInput>, res) => {
    res.json(await updateClient(req.db!, req.params.id, req.body));
  },
);

clientsRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    await deleteClient(req.db!, req.params.id);
    res.status(204).end();
  },
);
