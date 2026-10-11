// The signed-in customer: basket, checkout, paying from the wallet, and
// cancelling an order that has not been confirmed yet.
import { expect, test } from '../../support/fixtures.js';
import {
  api,
  basketLines,
  digitsOf,
  emptyBasket,
  placeCodOrder,
  sellableProduct,
  tokensFor,
  userIdOf,
  variantStock,
  walletBalance,
} from '../../support/api.js';

test.beforeEach(async () => {
  await emptyBasket(tokensFor().customer);
});

test('three units go into the basket in one request, and a line comes out in one', async ({ page }) => {
  const { customer } = tokensFor();
  const { product } = await sellableProduct({ minStock: 4, singleOption: true });

  await page.goto(`/product/${product.slug}`);
  await expect(page.locator('.buy-cta')).toBeVisible();
  const more = page.locator('.qty button[aria-label="افزایش"]').first();
  await more.click();
  await more.click();

  const posts = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/products/basket')) posts.push(r);
  });
  await page.locator('.buy-cta').click();
  await expect.poll(async () => (await basketLines(customer)).find((l) => l.product.id === product.id)?.quantity).toBe(3);
  expect(posts).toHaveLength(1);

  const deletes = [];
  page.on('request', (r) => {
    if (r.method() === 'DELETE' && r.url().endsWith('/api/products/basket')) deletes.push(r);
  });
  await page.goto('/cart');
  await page.locator('.cart-line button.btn-danger').first().click();
  await expect.poll(async () => (await basketLines(customer)).length).toBe(0);
  expect(deletes).toHaveLength(1);
});

test('asking for more than is in stock is refused with a code the UI can translate', async () => {
  const { customer } = tokensFor();
  const { product, variant } = await sellableProduct();
  const refused = await api('POST', '/products/basket', {
    token: customer,
    body: { product_id: product.id, variant_id: variant.id, quantity: 1000 },
  });
  expect(refused.status).toBe(400);
  expect(refused.json.code).toBe('INSUFFICIENT_STOCK');
});

test('checkout prices on the server, and the wallet is charged exactly what it showed', async ({ page }) => {
  const { customer, admin } = tokensFor();
  const { product, variant } = await sellableProduct();
  await api('POST', '/products/basket', {
    token: customer,
    body: { product_id: product.id, variant_id: variant.id },
  });
  const balanceBefore = await walletBalance(admin, userIdOf(customer));

  await page.goto('/checkout');
  const total = page.locator('.summary-total span').last();
  await expect(total).not.toHaveText(/…|—/, { timeout: 15_000 });
  const shown = digitsOf(await total.innerText());
  expect(Number(shown)).toBeGreaterThan(0);

  // A code that does not exist is turned down on the spot.
  await page.fill('.summary input[placeholder="کد تخفیف"]', 'NOPE-NOPE');
  await page.click('.summary button[aria-label="اعمال کد تخفیف"]');
  const note = page.locator('.summary .tiny').first();
  await expect(note).toHaveText(/کد|تخفیف/);
  await expect(note).not.toHaveText(/اعمال شد/);

  // The province of a new address is picked from a list.
  await page.getByRole('button', { name: 'آدرس جدید' }).click();
  await expect(page.locator('select[name="province"]')).toHaveCount(1);
  await page.keyboard.press('Escape');

  await page.locator('.option-card', { hasText: 'کیف پول' }).click();
  await page.locator('.summary').getByRole('button', { name: 'پرداخت از کیف پول و ثبت سفارش' }).click();
  await expect(page).toHaveURL(/\/account\/orders\/\d+/, { timeout: 20_000 });

  const orderId = page.url().match(/orders\/(\d+)/)[1];
  const order = (await api('GET', `/orders/${orderId}`, { token: customer })).data;
  expect(String(order.total_price)).toBe(shown);
  expect(order.status).toBe('paid');
  expect(await walletBalance(admin, userIdOf(customer))).toBe(balanceBefore - Number(shown));
});

test('an order not yet confirmed can be cancelled from its page, and its stock comes back', async ({ page }) => {
  const { customer } = tokensFor();
  const chosen = await sellableProduct();
  const order = await placeCodOrder(customer, chosen);
  const stockAfterOrder = await variantStock(chosen.product.id, chosen.variant.id);

  await page.goto(`/account/orders/${order.id}`);
  await page.getByRole('button', { name: 'لغو سفارش' }).click();
  await page.getByRole('button', { name: 'بله، لغو شود' }).click();
  await expect(page.locator('.badge').first()).toContainText('لغو');

  const after = (await api('GET', `/orders/${order.id}`, { token: customer })).data;
  expect(after.status).toBe('cancelled');
  expect(await variantStock(chosen.product.id, chosen.variant.id)).toBe(stockAfterOrder + 1);
});
