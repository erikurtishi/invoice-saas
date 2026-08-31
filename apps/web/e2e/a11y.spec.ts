import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { AUTH_STATE } from './auth-state';

/**
 * Accessibility pass (backlog X.5.6): an axe-core scan of the key screens, failing
 * on any *serious* or *critical* violation (colour contrast, missing labels,
 * name-role-value, focus order). Lighter `minor` / `moderate` findings are
 * reported but not gated.
 *
 * Scans the light theme (the app's primary, contrast-tuned palette); a dark-mode
 * sweep is a tracked follow-up — see docs/testing.md.
 */

const BLOCKING = ['serious', 'critical'];

async function scan(page: Page, url: string): Promise<void> {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cookie-consent', 'essential');
    } catch {
      /* ignore */
    }
  });
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
  expect(
    blocking,
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help} ×${v.nodes.length}`).join('\n'),
  ).toEqual([]);
}

test.describe('public pages', () => {
  for (const path of ['/', '/login', '/signup', '/forgot-password', '/privacy', '/terms']) {
    test(`no serious a11y violations on ${path}`, async ({ page }) => {
      await scan(page, path);
    });
  }
});

test.describe('authed pages', () => {
  test.use({ storageState: AUTH_STATE });

  for (const path of [
    '/console',
    '/console/invoices',
    '/console/invoices/new',
    '/console/clients',
    '/console/products',
    '/console/settings',
  ]) {
    test(`no serious a11y violations on ${path}`, async ({ page }) => {
      await scan(page, path);
    });
  }
});
