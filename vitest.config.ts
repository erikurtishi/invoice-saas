import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const sharedSrc = fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url));

/**
 * Vitest is the runner for pure-logic unit tests and fast DB-backed integration
 * tests (backlog X.5.1 / X.5.2 / X.5.4). It runs alongside — not instead of — the
 * `apps/api/scripts/*-check.ts` smoke scripts, which stay as broader end-to-end
 * checks against a live database; `npm run check:db` runs those.
 *
 *   npm test              — everything below, once
 *   npm run test:watch    — watch mode
 *   npm run test -- shared — just the shared project
 *
 * `*.integration.test.ts` files talk to the local Postgres in `apps/api/.env`
 * (decision D2); the plain `*.test.ts` files are pure and need nothing.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          // Always test against shared's TypeScript source, not its built dist —
          // no rebuild step between editing a schema and running the tests.
          alias: { '@invoice-saas/shared': sharedSrc },
        },
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: {
          alias: { '@invoice-saas/shared': sharedSrc },
        },
        test: {
          name: 'api',
          root: './apps/api',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          // Loads apps/api/.env before src/config/env.ts is evaluated.
          setupFiles: ['./vitest.setup.ts'],
          // Integration tests share one Postgres; run their files serially so two
          // suites don't race on the same throwaway rows.
          fileParallelism: false,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
