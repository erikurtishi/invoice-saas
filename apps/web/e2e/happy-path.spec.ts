import { expect, test } from '@playwright/test';

/**
 * The two happy paths from backlog X.5.3, run end to end against the real API:
 *
 *   signup → business profile → first client → create + issue an invoice → download the PDF
 *   …then → send the invoice, and confirm the send-success state
 *
 * One test, one page, `test.step` per stage — the account and session persist
 * across the whole flow. The `e2e-*@example.test` tenant is removed by
 * `global-teardown.ts`.
 */

const RUN = Date.now();
const EMAIL = `e2e-${RUN}@example.test`;
const PASSWORD = 'e2e-Password-123';
const CLIENT_NAME = `E2E Client ${RUN}`;
const CLIENT_EMAIL = `e2e-client-${RUN}@example.test`;

test('signup → profile → client → invoice → download → send', async ({ page }) => {
  // Skip the cookie banner so it doesn't overlay the bottom of the viewport
  // (it also carries role="dialog", which would collide with modal locators).
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cookie-consent', 'essential');
    } catch {
      /* private mode */
    }
  });

  await test.step('sign up and finish onboarding', async () => {
    await page.goto('/signup');
    await page.getByLabel('Business name').fill(`E2E Co ${RUN}`);
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await page.waitForURL('**/onboarding');
    await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByRole('button', { name: 'Create your first invoice' }).click();
    await page.waitForURL(/\/console\/invoices$/);
  });

  await test.step('create a client', async () => {
    await page.goto('/console/clients');
    await page.getByRole('button', { name: 'New client' }).click();

    const dialog = page.getByRole('dialog', { name: 'Add a client' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Client name').fill(CLIENT_NAME);
    await dialog.getByLabel(/^Email/).fill(CLIENT_EMAIL);
    await dialog.getByRole('button', { name: 'Add client' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: CLIENT_NAME })).toBeVisible();
  });

  await test.step('create and issue an invoice', async () => {
    await page.goto('/console/invoices/new');

    const clientField = page.getByRole('combobox', { name: 'Search clients' });
    await clientField.fill(CLIENT_NAME.slice(0, 14));
    await page.getByRole('option', { name: new RegExp(CLIENT_NAME) }).click();

    await page.getByRole('button', { name: 'Add a blank line' }).click();
    await page.getByLabel('Description 1').fill('Consulting services');
    await page.getByLabel('Unit price 1').fill('250');

    await page.getByRole('button', { name: 'Save invoice' }).click();
    await page.waitForURL(/\/invoices\/[a-z0-9]+$/i);
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
  });

  await test.step('download the PDF', async () => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  });

  await test.step('send the invoice and see the confirmation', async () => {
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    // Its own confirmation state (X.7.10) — recipient + timestamp, not just a toast.
    const confirmation = page.getByRole('status').filter({ hasText: 'Emailed to' });
    await expect(confirmation).toBeVisible({ timeout: 20_000 });
    await expect(confirmation).toContainText(CLIENT_EMAIL);
  });
});
