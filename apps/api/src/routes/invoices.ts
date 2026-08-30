import {
  type InvoiceCalculateInput,
  invoiceCalculateSchema,
  type InvoiceInput,
  invoiceInputSchema,
  type InvoiceListQuery,
  invoiceListQuerySchema,
  type InvoiceRenderRequest,
  invoiceRenderRequestSchema,
} from '@invoice-saas/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';

import { requireCanCreateInvoice } from '../lib/entitlements.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { listInvoiceHistory } from '../services/invoice-history-service.js';
import {
  calculateTotals,
  createDraft,
  deleteInvoice,
  duplicateInvoice,
  exportInvoicesCsv,
  finalizeInvoice,
  getInvoice,
  listInvoices,
  saveInvoice,
} from '../services/invoice-service.js';
import { renderInvoicePdf, sendInvoice } from '../services/pdf-service.js';

/**
 * Invoice endpoints (backlog Epic 4.2 / 4.3 / 4.4 / 4.5). Mounted at `/invoices`
 * in `index.ts`, behind `authenticate` + `requireTenant`; the database is reached
 * only through the tenant-scoped `req.db`.
 *
 * `GET    /invoices`               → filtered / sorted / paginated library (4.5.1)
 * `GET    /invoices/export.csv`    → CSV of the filtered set (4.5.4)
 * `POST   /invoices`               → create a DRAFT (autosave, 4.2.6)
 * `PATCH  /invoices/:id`           → save current fields — DRAFT or ISSUED (4.4.2)
 * `POST   /invoices/:id/finalize`  → first explicit Save: number + ISSUED (4.1.3)
 * `POST   /invoices/:id/duplicate` → new DRAFT copy, no number (4.4.4)
 * `DELETE /invoices/:id`           → soft delete (4.4.5, decision D4)
 * `POST   /invoices/calculate`     → stateless totals, server source of truth (4.2.3)
 * `GET    /invoices/:id`           → one invoice with its line items
 * `GET    /invoices/:id/history`   → the invoice's event-log timeline (5.2.1)
 * `POST   /invoices/:id/pdf`       → fresh PDF; `{ draft }` renders unsaved edits (4.4.2)
 * `POST   /invoices/:id/send`      → email the PDF; `{ draft }` sends unsaved edits (4.4.2)
 */
export const invoicesRouter: Router = Router();

invoicesRouter.use(authenticate, requireTenant);

const idParamSchema = z.object({ id: z.string().min(1) });

// Static paths before `/:id` so `export.csv` isn't captured as an id.
invoicesRouter.get('/', validate({ query: invoiceListQuerySchema }), async (req, res) => {
  res.json(await listInvoices(req.db!, req.query as unknown as InvoiceListQuery));
});

invoicesRouter.get('/export.csv', validate({ query: invoiceListQuerySchema }), async (req, res) => {
  const csv = await exportInvoicesCsv(req.db!, req.query as unknown as InvoiceListQuery);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
});

invoicesRouter.post(
  '/calculate',
  validate({ body: invoiceCalculateSchema }),
  (req: Request<never, unknown, InvoiceCalculateInput>, res) => {
    res.json(calculateTotals(req.body));
  },
);

invoicesRouter.post(
  '/',
  validate({ body: invoiceInputSchema }),
  async (req: Request<never, unknown, InvoiceInput>, res) => {
    await requireCanCreateInvoice(req.auth!.userId);
    res.status(201).json(await createDraft(req.db!, req.auth!.userId, req.body));
  },
);

invoicesRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    res.json(await getInvoice(req.db!, req.params.id));
  },
);

// Per-invoice history timeline (backlog 5.2.1). No `:id` collision — the segment
// after it is literal.
invoicesRouter.get(
  '/:id/history',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    res.json(await listInvoiceHistory(req.db!, req.params.id));
  },
);

invoicesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: invoiceInputSchema }),
  async (req: Request<{ id: string }, unknown, InvoiceInput>, res) => {
    res.json(await saveInvoice(req.db!, req.auth!.userId, req.params.id, req.body));
  },
);

invoicesRouter.post(
  '/:id/finalize',
  validate({ params: idParamSchema, body: invoiceInputSchema }),
  async (req: Request<{ id: string }, unknown, InvoiceInput>, res) => {
    await requireCanCreateInvoice(req.auth!.userId);
    res.json(
      await finalizeInvoice(req.db!, req.auth!.userId, req.auth!.userId, req.params.id, req.body),
    );
  },
);

invoicesRouter.post(
  '/:id/duplicate',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    await requireCanCreateInvoice(req.auth!.userId);
    res.status(201).json(await duplicateInvoice(req.db!, req.auth!.userId, req.params.id));
  },
);

invoicesRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  async (req: Request<{ id: string }>, res) => {
    await deleteInvoice(req.db!, req.params.id);
    res.status(204).end();
  },
);

invoicesRouter.post(
  '/:id/pdf',
  validate({ params: idParamSchema, body: invoiceRenderRequestSchema }),
  async (req: Request<{ id: string }, unknown, InvoiceRenderRequest>, res) => {
    const { filename, pdf } = await renderInvoicePdf(
      req.db!,
      req.auth!.userId,
      req.params.id,
      req.body.draft,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"; ` +
        `filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  },
);

invoicesRouter.post(
  '/:id/send',
  validate({ params: idParamSchema, body: invoiceRenderRequestSchema }),
  async (req: Request<{ id: string }, unknown, InvoiceRenderRequest>, res) => {
    res.json(await sendInvoice(req.db!, req.auth!.userId, req.params.id, req.body.draft));
  },
);
