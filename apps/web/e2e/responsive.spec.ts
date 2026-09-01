import { expect, test, type Page } from '@playwright/test';

import { AUTH_STATE } from './auth-state';

/**
 * Responsive smoke (backlog L3.4 — real-device & responsiveness pass).
 *
 * Emulated-viewport pre-check for the manual physical-hardware pass
 * (docs/device-testing.md): at a small-phone and a tablet width, every key
 * screen must lay out with **no horizontal page scroll** (CLAUDE.md: "the page
 * body must never scroll horizontally" — wide tables/diagrams scroll inside their
 * own container, not the document).
 *
 * This does not replace the on-device walk (tap-target feel, native PDF viewer,
 * real Safari/Chrome quirks) — it catches layout regressions between them.
 */

const VIEWPORTS = [
  { name: 'phone (375×667)', width: 375, height: 667 },
  { name: 'tablet (768×1024)', width: 768, height: 1024 },
] as const;

async function prep(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cookie-consent', 'essential');
    } catch {
      /* private mode */
    }
  });
}

/** The document itself must not scroll sideways (a few px of rounding slack). */
async function expectNoHorizontalScroll(page: Page, where: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(
    overflow.scrollWidth,
    `${where}: document scrolls horizontally (${overflow.scrollWidth}px content in ${overflow.clientWidth}px viewport)`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 2);
}

const PUBLIC_PATHS = ['/', '/login', '/signup', '/forgot-password', '/privacy', '/terms'];
const AUTHED_PATHS = [
  '/console',
  '/console/invoices',
  '/console/invoices/new',
  '/console/clients',
  '/console/products',
  '/console/settings',
  // Dev host for the real visual template editor — its edit⇆preview view stacks
  // to tabs on phone (X.2); reachable without a paid tier, unlike /templates/new.
  '/console/dev/template-editor',
];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('public screens have no horizontal scroll', async ({ page }) => {
      await prep(page);
      for (const path of PUBLIC_PATHS) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await expectNoHorizontalScroll(page, `${vp.name} ${path}`);
      }
    });

    test.describe('authed', () => {
      test.use({ storageState: AUTH_STATE });

      test('console screens have no horizontal scroll', async ({ page }) => {
        await prep(page);
        for (const path of AUTHED_PATHS) {
          await page.goto(path);
          await page.waitForLoadState('networkidle');
          await expectNoHorizontalScroll(page, `${vp.name} ${path}`);
        }
      });
    });
  });
}
