// Orders in the panel: finding one, cash on delivery from confirmation to a
// parcel refused at the door, the printable invoice, and tracking codes.
import { expect, test } from '../../support/fixtures.js';
import {
  api,
  items,
  placeCodOrder,
  sellableProduct,
  tokensFor,
  userIdOf,
  variantStock,
  walletBalance,
} from '../../support/api.js';

async function openOrder(page, order) {
  await page.goto(`/orders?search=${encodeURIComponent(order.invoice_number ?? order.id)}`);
  await expect(page.locator('table.data tbody tr')).toHaveCount(1);
  await page.locator('table.data tbody tr').first().locator('.icon-btn').click();
  await expect(page.locator('.modal')).toBeVisible();
}

test('search finds an order beyond the first page', async ({ page }) => {
  const { admin } = tokensFor();
  const all = (await api('GET', '/orders?limit=100', { token: admin })).data;
  const far = all.items[all.items.length - 1];
  await page.goto('/orders');
  await page.locator('.search-box input').fill(far.invoice_number);
  await expect(page.locator('table.data tbody tr', { hasText: far.invoice_number })).toHaveCount(1);
});

test('cash on delivery: confirmed, sent, refused at the door - no refund of money never paid', async ({
  page,
  context,
}) => {
  const { admin, customer } = tokensFor();
  const chosen = await sellableProduct();
  const order = await placeCodOrder(customer, chosen);
  const stockOrdered = await variantStock(chosen.product.id, chosen.variant.id);
  const walletBefore = await walletBalance(admin, userIdOf(customer));

  await openOrder(page, order);
  const select = page.locator('.modal .select');
  await expect(select.locator('option', { hasText: 'تأیید و شروع آماده‌سازی' })).toHaveCount(1);

  // The invoice that goes in the parcel.
  const [invoice] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.modal-foot').getByRole('button', { name: 'چاپ فاکتور' }).click(),
  ]);
  await expect(invoice.locator('body')).toContainText(order.invoice_number);
  await expect(invoice.locator('body')).toContainText(chosen.product.title);
  await invoice.close();

  await select.selectOption('processing');
  await page.locator('.modal-foot').getByRole('button', { name: 'ثبت تغییر وضعیت' }).click();
  await expect
    .poll(async () => (await api('GET', `/orders/${order.id}`, { token: admin })).data.status)
    .toBe('processing');
  expect((await api('GET', `/orders/${order.id}`, { token: admin })).data.payed_time).toBeFalsy();

  const sent = await api('PATCH', `/orders/${order.id}/status`, {
    token: admin,
    body: { status: 'sent', tracking_code: '123456789' },
  });
  expect(sent.status).toBe(200);

  await openOrder(page, order);
  await select.selectOption('cancelled');
  await expect(page.locator('.modal p.tiny').last()).toContainText('وجهی دریافت نشده');
  await page.locator('.modal-foot').getByRole('button', { name: 'ثبت تغییر وضعیت' }).click();
  await expect
    .poll(async () => (await api('GET', `/orders/${order.id}`, { token: admin })).data.status)
    .toBe('cancelled');

  expect(await walletBalance(admin, userIdOf(customer))).toBe(walletBefore);
  expect(await variantStock(chosen.product.id, chosen.variant.id)).toBe(stockOrdered + 1);
});

test("a sent order's tracking code can be corrected, typed in Persian digits", async ({ page }) => {
  const { admin, customer } = tokensFor();
  const order = await placeCodOrder(customer, await sellableProduct());
  for (const status of ['processing', 'sent']) {
    await api('PATCH', `/orders/${order.id}/status`, {
      token: admin,
      body: { status, ...(status === 'sent' ? { tracking_code: '111111' } : {}) },
    });
  }

  await openOrder(page, order);
  await page.locator('.modal .field', { hasText: 'کد رهگیری' }).locator('input').fill('۹۸۷۶۵۴');
  await page.locator('.modal-foot').getByRole('button', { name: 'ذخیره' }).click();
  await expect
    .poll(async () => (await api('GET', `/orders/${order.id}`, { token: admin })).data.tracking_code)
    .toBe('987654');
  expect((await api('GET', `/orders/${order.id}`, { token: admin })).data.status).toBe('sent');
});

test('the customer behind an order is one click away', async ({ page }) => {
  const { admin } = tokensFor();
  const order = items((await api('GET', '/orders?limit=1', { token: admin })).data)[0];
  await openOrder(page, order);
  await page.getByRole('link', { name: 'همه‌ی سفارش‌های این مشتری' }).click();
  await expect(page).toHaveURL(/\/orders\?search=09\d{9}/);
  await expect(page.locator('table.data tbody tr').first()).toBeVisible();
});
