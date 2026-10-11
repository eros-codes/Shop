// Signing in and out of the storefront, as an account of its own
// (sign-in is rate limited per number).
import { GUEST, expect, test } from '../../support/fixtures.js';
import { ACCOUNTS, PASSWORD, STORE_URL } from '../../support/env.js';

test.use({ storageState: GUEST });

async function signIn(page, password = PASSWORD) {
  await page.fill('.auth-card input[inputmode=numeric]', ACCOUNTS.loginTester);
  await page.fill('.auth-card input[type=password]', password);
  await page.click('.auth-card form button[type=submit]');
}

test('a wrong password is told in Persian, under the field', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, 'not-the-password-1');
  await expect(page.getByText('شماره موبایل یا رمز عبور درست نیست.')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('after signing in a crafted ?next= stays on this site, and signing out reaches every tab', async ({
  page,
  context,
}) => {
  await page.goto('/login?next=/\\evil.com');
  await signIn(page);
  await expect(page.locator('a.header-action[href="/account"]')).toBeVisible();
  expect(new URL(page.url()).origin).toBe(STORE_URL);

  const second = await context.newPage();
  await second.goto('/account');
  await second.locator('.account-logout').click();

  // The first tab follows without a reload.
  await expect(page.locator('a.header-action[href="/account"]')).toHaveCount(0);
});
