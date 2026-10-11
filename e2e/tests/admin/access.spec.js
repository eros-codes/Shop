// Who gets into the panel, and what the admin sees first.
import { GUEST, expect, test } from '../../support/fixtures.js';
import { ACCOUNTS, PASSWORD } from '../../support/env.js';

test.describe('a customer', () => {
  test.use({ storageState: GUEST });

  test('is turned away, and stays out after a reload', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[inputmode=numeric]', ACCOUNTS.outsider);
    await page.fill('input[type=password]', PASSWORD);
    await page.click('form button[type=submit]');
    await expect(page.getByText('این حساب دسترسی مدیریت ندارد.')).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('.rail')).toHaveCount(0);
  });
});

test('the dashboard names the admin, the page, and what is waiting', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.rail')).toBeVisible();
  await expect(page).toHaveTitle(/پیشخوان/);
  await expect(page.locator('.topbar .who')).toContainText('مدیر فروشگاه');
  // The seed leaves paid orders to prepare, at the least.
  await expect(page.locator('.todo-item').first()).toBeVisible();
});
