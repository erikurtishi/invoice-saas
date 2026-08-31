import {
  businessProfileSchema,
  type BusinessProfileInput,
  deleteAccountSchema,
  type DeleteAccountInput,
} from '@invoice-saas/shared';
import { Router, type Request } from 'express';

import { clearRefreshCookie } from '../lib/auth-cookie.js';
import { ApiError } from '../lib/api-error.js';
import { authenticate } from '../middleware/authenticate.js';
import { logoUpload } from '../middleware/logo-upload.js';
import { expensiveLimiter } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import { assertReauth, deleteOwnAccount, exportOwnData } from '../services/account-service.js';
import { getProfile, removeLogo, setLogo, updateProfile } from '../services/profile-service.js';

/**
 * Business-profile endpoints (backlog Epic 1.2). Mounted at `/profile` in
 * `index.ts`. Every handler sits behind `authenticate` and acts on
 * `req.auth.userId` directly — the profile is the `users` row (decision D3), so
 * there is no `requireTenant` / `req.db` here (that scopes child models, of which
 * this has none).
 *
 * `GET /profile`          → the current business profile
 * `PATCH /profile`        → replace all editable profile fields (1.2.2 / 1.2.5)
 * `POST /profile/logo`    → upload / replace the logo (1.2.3), multipart `logo`
 * `DELETE /profile/logo`  → remove the logo
 * `GET /profile/export`   → full JSON copy of everything this account stores (X.4.5)
 * `DELETE /profile`       → close the account: re-auth, then irreversible purge (X.4.4)
 */
export const profileRouter: Router = Router();

profileRouter.use(authenticate);

profileRouter.get('/', async (req, res) => {
  res.json(await getProfile(req.auth!.userId));
});

profileRouter.patch(
  '/',
  validate({ body: businessProfileSchema }),
  async (req: Request<never, unknown, BusinessProfileInput>, res) => {
    res.json(await updateProfile(req.auth!.userId, req.body));
  },
);

profileRouter.post('/logo', logoUpload, async (req, res) => {
  if (!req.file) {
    throw ApiError.validation('Choose an image to upload.', {
      logo: ['Choose an image to upload.'],
    });
  }
  res.json(
    await setLogo(req.auth!.userId, {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      size: req.file.size,
    }),
  );
});

profileRouter.delete('/logo', async (req, res) => {
  res.json(await removeLogo(req.auth!.userId));
});

profileRouter.get('/export', expensiveLimiter, async (req, res) => {
  const data = await exportOwnData(req.auth!.userId);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-saas-export-${stamp}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

profileRouter.delete(
  '/',
  expensiveLimiter,
  validate({ body: deleteAccountSchema }),
  async (req: Request<never, unknown, DeleteAccountInput>, res) => {
    await assertReauth(req.auth!.userId, req.body);
    await deleteOwnAccount(req.auth!.userId);
    clearRefreshCookie(res);
    res.status(204).end();
  },
);
