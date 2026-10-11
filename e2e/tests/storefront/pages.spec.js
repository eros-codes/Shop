// The account's wallet page, and the legal / contact pages, whose numbers
// and details come from the API's settings rather than being written in.
import { GUEST, expect, test } from '../../support/fixtures.js';

test('the wallet page lists transactions in Persian', async ({ page }) => {
  await page.goto('/account/wallet');
  const history = page.locator('.card', { has: page.locator('h2', { hasText: 'تراکنش‌ها' }) });
  await expect(history.locator('.spread').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/admin_charge|zarinpal_charge|withdrawal/);
});

test.describe('information pages', () => {
  test.use({ storageState: GUEST });

  for (const [path, title] of [
    ['/return-policy', 'شرایط مرجوعی'],
    ['/terms', 'قوانین و مقررات'],
    ['/privacy', 'حریم خصوصی'],
    ['/contact', 'تماس با ما'],
  ]) {
    test(`${path} renders`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('.info-page h1')).toHaveText(title);
    });
  }

  test('the return policy and terms state the numbers the API runs with', async ({ page }) => {
    await page.goto('/return-policy');
    await expect(page.locator('.info-page')).toContainText('تا ۷ روز پس از تحویل');
    await page.goto('/terms');
    await expect(page.locator('.info-page')).toContainText('۱۰٪');
    await expect(page.locator('.info-page')).toContainText('۱۵ دقیقه');
  });

  test('the contact page shows what is set and leaves out what is not', async ({ page }) => {
    await page.goto('/contact');
    const info = page.locator('.info-page');
    await expect(info).toContainText('۰۲۱-۱۲۳۴۵۶۷۸');
    await expect(info).toContainText('شنبه تا چهارشنبه');
    await expect(info).not.toContainText('ایمیل');
    await expect(info).not.toContainText('نشانی');
  });
});
