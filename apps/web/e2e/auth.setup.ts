import { test as setup } from '@playwright/test';

import { AUTH_STATE } from './auth-state';

/**
 * Playwright "setup project" (X.5.3 / X.5.6): signs up a throwaway tenant, walks
 * it through onboarding, and saves the session so the a11y specs can scan the
 * authenticated screens without each repeating the flow. The `chromium` project
 * depends on this one. The `e2e-*@example.test` tenant is removed by
 * `global-teardown.ts`.
 */

setup('authenticate', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cookie-consent', 'essential');
    } catch {
      /* ignore */
    }
  });

  const email = `e2e-a11y-${Date.now()}@example.test`;
  await page.goto('/signup');
  await page.getByLabel('Business name').fill('A11y Co');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('e2e-Password-123');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.waitForURL('**/onboarding');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Go to the dashboard' }).click();
  await page.waitForURL(/\/console$/);

  await page.context().storageState({ path: AUTH_STATE });
});
