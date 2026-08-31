import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

/**
 * E2E happy paths + accessibility scan (backlog X.5.3 / X.5.6).
 *
 * `webServer` boots the real API (against the local Postgres in `apps/api/.env`,
 * decision D2) and the Vite dev server. The specs drive a real Chromium through
 * signup → profile → client → invoice → download → send, exactly as a user would.
 *
 *   npm run test:e2e -w @invoice-saas/web
 *
 * Set `PW_REUSE=1` to run against servers you already have up.
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const reuse = process.env.PW_REUSE === '1' || !process.env.CI;

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    // Scan the app's primary, contrast-tuned theme deterministically. A dark-mode
    // axe sweep is tracked separately (see docs/testing.md — X.5.6).
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light' },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      // Builds @invoice-saas/shared, then starts the API on :4000.
      command: 'npm run dev:api',
      cwd: repoRoot,
      url: 'http://localhost:4000/health',
      reuseExistingServer: reuse,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
  ],
});
