import { type AiDraftRequest, aiDraftRequestSchema } from '@invoice-saas/shared';
import { type Request, Router } from 'express';

import { aiDrafter } from '../lib/ai/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireTenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { generateInvoiceDraft } from '../services/ai-draft-service.js';

/**
 * AI invoice drafting (backlog Epic 7.1, spec §8). Mounted at `/ai` in
 * `index.ts`, behind `authenticate` + `requireTenant`.
 *
 * `GET  /ai/status`        → `{ enabled }` — whether a provider is wired. Lets the
 *   web hide the AI panel instead of surfacing a 503 on submit (mirrors
 *   `GET /billing/config`). Not Premium-gated: `GET /billing/entitlements`
 *   already tells the web whether this tenant *may* use AI.
 * `POST /ai/draft-invoice` `{ prompt }` → `AiDraftResponse`: an editable draft
 *   for the invoice form plus the client match, the fields to verify and the
 *   remaining-generations meter. 403 for non-Premium or a spent monthly cap;
 *   502/503 on a provider or output failure, with no usage charged (7.1.8).
 *   Nothing is saved or sent.
 */
export const aiRouter: Router = Router();

aiRouter.use(authenticate, requireTenant);

aiRouter.get('/status', (_req, res) => {
  res.json({ enabled: aiDrafter.available });
});

aiRouter.post(
  '/draft-invoice',
  validate({ body: aiDraftRequestSchema }),
  async (req: Request<never, unknown, AiDraftRequest>, res) => {
    res.json(await generateInvoiceDraft(req.db!, req.auth!.userId, req.body));
  },
);
