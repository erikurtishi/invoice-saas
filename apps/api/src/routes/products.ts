import {
  type ProductInput,
  productInputSchema,
  type ProductListQuery,
  productListQuerySchema,
} from '@invoice-saas/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';

import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from '../services/product-service.js';

/**
 * Product endpoints (backlog Epic 2.2). Mounted at `/products` in `index.ts`.
 * Same structure as `routes/clients.ts` — behind `authenticate` + `requireTenant`,
 * database reached only through the tenant-scoped `req.db`.
 *
 * `GET    /products`      → one page of the tenant's products (search / paginate)
 * `POST   /products`      → create (2.2.3)
 * `GET    /products/:id`  → one product
 * `PATCH  /products/:id`  → replace all editable fields (2.2.3)
 * `DELETE /products/:id`  → soft delete (2.2.4, decision D4)
 */
export const productsRouter: Router = Router();

productsRouter.use(authenticate, requireTenant);

const idParamSchema = z.object({ id: z.string().min(1) });

productsRouter.get('/', validate({ query: productListQuerySchema }), async (req, res) => {
  const query = req.query as unknown as ProductListQuery;
  res.json(await listProducts(req.db!, query));
});

productsRouter.post(
  '/',
  validate({ body: productInputSchema }),
  async (req: Request<never, unknown, ProductInput>, res) => {
    res.status(201).json(await createProduct(req.db!, req.body));
  },
);

productsRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    res.json(await getProduct(req.db!, req.params.id));
  },
);

productsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: productInputSchema }),
  async (req: Request<{ id: string }, unknown, ProductInput>, res) => {
    res.json(await updateProduct(req.db!, req.params.id, req.body));
  },
);

productsRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    await deleteProduct(req.db!, req.params.id);
    res.status(204).end();
  },
);
