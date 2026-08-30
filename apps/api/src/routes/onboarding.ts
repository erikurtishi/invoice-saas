import { Router } from 'express';

import { authenticate } from '../middleware/authenticate.js';
import { completeOnboarding } from '../services/profile-service.js';

/**
 * Onboarding-wizard endpoints (backlog 1.2.4). Mounted at `/onboarding`.
 *
 * `POST /onboarding/complete` → stamp `onboardingCompletedAt` and return the
 * refreshed public user. Idempotent, so the web app can call it on "finish" or on
 * "skip" without checking first.
 */
export const onboardingRouter: Router = Router();

onboardingRouter.use(authenticate);

onboardingRouter.post('/complete', async (req, res) => {
  res.json(await completeOnboarding(req.auth!.userId));
});
