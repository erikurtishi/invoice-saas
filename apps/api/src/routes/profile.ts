import { businessProfileSchema, type BusinessProfileInput } from '@invoice-saas/shared';
import { Router, type Request } from 'express';

import { ApiError } from '../lib/api-error.js';
import { authenticate } from '../middleware/authenticate.js';
import { logoUpload } from '../middleware/logo-upload.js';
import { validate } from '../middleware/validate.js';
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
