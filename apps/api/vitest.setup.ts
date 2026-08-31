import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

/**
 * Vitest runs from the repo root, so `apps/api/.env` is not on `process.cwd()`
 * the way it is for the `npm run … -w @invoice-saas/api` check scripts. Load it
 * explicitly before any test file imports `src/config/env.ts` (which validates
 * `process.env` at module load and throws if `DATABASE_URL` / `JWT_ACCESS_SECRET`
 * are missing).
 */
config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });
