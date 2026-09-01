import { devices, expect, test, type Page } from '@playwright/test';

/**
 * Mobile critical-path walk (backlog L3.4.2).
 *
 * The full `happy-path` flow — signup → onboarding → client → product → create +
 * issue an invoice → download the PDF → send — re-run at a **phone** and a
 * **tablet** device profile (real mobile viewport + `hasTouch` + mobile UA, via
 * Playwright's device descriptors). At every screen the document must not scroll
 * sideways and the primary tap target must be a usable size; the template editor
 * must collapse to its tabbed (not side-by-side) layout.
 *
 * This runs on the Chromium engine, so it covers the Android-Chrome case and
 * catches layout / flow regressions at mobile size. The iOS-Safari (WebKit)
 * rendering spot-check and the "does it feel right to tap" pass stay manual —
 * see docs/device-testing.md.
 */

/** Device descriptor minus `defaultBrowserType` — that field can't be set inside a
 *  `describe`, and this suite runs on the configured (chromium) engine anyway. */
function mobile(name: string) {
  const { defaultBrowserType: _drop, ...rest } = devices[name];
  return rest;
}

const DEVICES = [
  { name: 'phone', descriptor: mobile('iPhone 13') },
  { name: 'tablet', descriptor: mobile('iPad Mini') },
] as const;

/** The document itself must not scroll sideways (a few px of rounding slack). */
async function expectNoHScroll(page: Page, where: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    scrollWidth,
    `${where}: page scrolls horizontally (${scrollWidth}px in ${clientWidth}px)`,
  ).toBeLessThanOrEqual(clientWidth + 2);
}

/**
 * The app's form controls sit on a consistent 36px scale (`h-9` buttons / inputs
 * / selects). A labelled button on that scale clears WCAG 2.5.8 (AA) target size
 * (24×24) with margin; the check here just guards against a clipped / collapsed
 * button — height ≥ 32, width ≥ 44.
 */
async function expectTapTarget(page: Page, role: 'button' | 'link', name: string): Promise<void> {
  const el = page.getByRole(role, { name, exact: false }).first();
  await expect(el).toBeVisible();
  const box = await el.boundingBox();
  expect(box, `${name}: no box`).not.toBeNull();
  expect(box!.height, `${name}: ${box!.height}px tall`).toBeGreaterThanOrEqual(32);
  expect(box!.width, `${name}: ${box!.width}px wide`).toBeGreaterThanOrEqual(44);
}

for (const dev of DEVICES) {
  test.describe(`${dev.name} (${dev.descriptor.viewport.width}×${dev.descriptor.viewport.height})`, () => {
    test.use({ ...dev.descriptor });

    test('signup → onboarding → client → product → invoice → download → send', async ({ page }) => {
      const run = `${Date.now()}-${dev.name}`;
      const email = `e2e-m-${run}@example.test`;
      const password = 'e2e-Password-123';
      const clientName = `E2E M ${run}`;
      const clientEmail = `e2e-mc-${run}@example.test`;

      await page.addInitScript(() => {
        try {
          localStorage.setItem('cookie-consent', 'essential');
        } catch {
          /* private mode */
        }
      });

      await test.step('sign up + onboarding', async () => {
        await page.goto('/signup');
        await expectNoHScroll(page, `${dev.name} /signup`);
        await page.getByLabel('Business name').fill(`E2E M Co ${run}`);
        await page.getByLabel('Email').fill(email);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await expectTapTarget(page, 'button', 'Create account');
        await page.getByRole('button', { name: 'Create account' }).click();

        await page.waitForURL('**/onboarding');
        await expectNoHScroll(page, `${dev.name} /onboarding`);
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.getByRole('button', { name: 'Skip for now' }).click();
        await page.getByRole('button', { name: 'Create your first invoice' }).click();
        await page.waitForURL(/\/console\/invoices$/);
        await expectNoHScroll(page, `${dev.name} /console/invoices`);
      });

      await test.step('create a client', async () => {
        await page.goto('/console/clients');
        await expectNoHScroll(page, `${dev.name} /console/clients`);
        await page.getByRole('button', { name: 'New client' }).click();
        const dialog = page.getByRole('dialog', { name: 'Add a client' });
        await expect(dialog).toBeVisible();
        await dialog.getByLabel('Client name').fill(clientName);
        await dialog.getByLabel(/^Email/).fill(clientEmail);
        await dialog.getByRole('button', { name: 'Add client' }).click();
        await expect(dialog).toBeHidden();
        await expect(page.getByRole('button', { name: clientName })).toBeVisible();
      });

      await test.step('create a product', async () => {
        await page.goto('/console/products');
        await expectNoHScroll(page, `${dev.name} /console/products`);
        await page.getByRole('button', { name: 'New product' }).click();
        const dialog = page.getByRole('dialog', { name: 'Add a product' });
        await expect(dialog).toBeVisible();
        await dialog.getByLabel('Name', { exact: true }).fill(`Widget ${run}`);
        await dialog.getByLabel('Default price').fill('120');
        await dialog.getByRole('button', { name: 'Add product' }).click();
        await expect(dialog).toBeHidden();
      });

      await test.step('template editor collapses to tabs', async () => {
        await page.goto('/console/dev/template-editor');
        await expectNoHScroll(page, `${dev.name} template editor`);
        // The editor host here is the dev-only route (`import.meta.env.DEV` in
        // App.tsx) — it's the only way to reach `<TemplateEditor>` as a fresh
        // FREE signup, which `/console/templates/new` bounces (3.3.6). A
        // production build (`vite preview`, L4.1) tree-shakes that route out, so
        // race the tablist against the 404 screen and skip the layout assertion
        // when it isn't mounted.
        const designTab = page.getByRole('tab', { name: /design/i });
        const notFound = page.getByRole('heading', { name: /not found/i });
        await expect(designTab.or(notFound).first()).toBeVisible();
        if (await notFound.isVisible()) {
          test.info().annotations.push({
            type: 'skip',
            description: 'dev template-editor route absent from this build (production preview)',
          });
          return;
        }
        // Below `lg` the editor renders a Design/Preview tablist, not the
        // side-by-side grid (template-editor.tsx).
        await expect(designTab).toBeVisible();
        await expect(page.getByRole('tab', { name: /preview/i })).toBeVisible();
        await page.getByRole('tab', { name: /preview/i }).click();
      });

      await test.step('create + issue an invoice', async () => {
        await page.goto('/console/invoices/new');
        await expectNoHScroll(page, `${dev.name} /console/invoices/new`);
        const clientField = page.getByRole('combobox', { name: 'Search clients' });
        await clientField.fill(clientName.slice(0, 12));
        await page.getByRole('option', { name: new RegExp(clientName) }).click();

        await page.getByRole('button', { name: 'Add a blank line' }).click();
        // The line-items editor keeps both layouts in the DOM (desktop table +
        // mobile card, one `display:none`); target whichever is on screen. The
        // desktop input is aria-labelled "Description 1", the mobile card's is
        // just "Description".
        await page
          .getByLabel(/^Description( 1)?$/)
          .filter({ visible: true })
          .fill('Consulting services');
        await page
          .getByLabel(/^Unit price( 1)?$/)
          .filter({ visible: true })
          .fill('250');
        await expectNoHScroll(page, `${dev.name} invoice form with a line item`);

        await expectTapTarget(page, 'button', 'Save invoice');
        await page.getByRole('button', { name: 'Save invoice' }).click();
        await page.waitForURL(/\/invoices\/[a-z0-9]+$/i);
        await expectNoHScroll(page, `${dev.name} issued invoice`);
        await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
      });

      await test.step('download the PDF', async () => {
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download' }).click();
        expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
      });

      await test.step('send the invoice', async () => {
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        const confirmation = page.getByRole('status').filter({ hasText: 'Emailed to' });
        await expect(confirmation).toBeVisible({ timeout: 20_000 });
        await expect(confirmation).toContainText(clientEmail);
      });
    });
  });
}
