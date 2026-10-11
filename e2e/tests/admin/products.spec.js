// The catalogue in the panel: creating a product, its pictures, taking an
// option off sale, and finding a product by its SKU.
import { expect, pngOf, test } from '../../support/fixtures.js';
import { api, items, tokensFor } from '../../support/api.js';

test('a new product: Persian digits, saved price and stock, then on to its pictures', async ({ page }) => {
  const { admin } = tokensFor();
  const title = `کالای آزمایشی ${Date.now()}`;
  await page.goto('/products');
  await page.getByRole('button', { name: 'کالای جدید' }).first().click();
  const modal = page.locator('.modal');
  await modal.locator('input.input').first().fill(title);
  await modal.locator('textarea').first().fill('ساخته‌شده در تست');
  const price = modal.locator('.field', { hasText: 'قیمت (تومان)' }).locator('input');
  await price.fill('۱۲۳۰۰۰');
  await expect(price).toHaveValue('123000');
  await modal.getByRole('button', { name: 'گزینه‌ها' }).click();
  await modal.locator('.field', { hasText: 'موجودی' }).locator('input').first().fill('۳');
  await page.locator('.modal-foot').getByRole('button', { name: 'ذخیره' }).click();

  await expect(modal.getByText('آپلود تصویر')).toBeVisible();
  const created = items(
    (await api('GET', `/products?includeDrafts=true&search=${encodeURIComponent(title)}`, { token: admin })).data,
  )[0];
  try {
    expect(Number(created.price)).toBe(123000);
    expect(Number(created.stock)).toBe(3);
  } finally {
    await api('DELETE', `/products/${created.id}`, { token: admin });
  }
});

test('any picture can be made the cover; the rest keep their order', async ({ page, browser }) => {
  const { admin } = tokensFor();
  const product = items((await api('GET', '/products?limit=1', { token: admin })).data)[0];
  const form = new FormData();
  for (const [i, colour] of ['#e63946', '#2a9d8f'].entries()) {
    form.append('images', new Blob([await pngOf(browser, colour)], { type: 'image/png' }), `e2e-${i}.png`);
  }
  expect((await api('POST', `/products/${product.id}/images`, { token: admin, form })).status).toBe(201);
  const uploaded = (await api('GET', `/products/${product.id}`, { token: admin })).data.images;
  const before = uploaded.map((i) => i.id);

  // Stored as WebP, at the widths it has (a 120px picture is never enlarged).
  for (const image of uploaded.slice(-2)) {
    expect(image.url).toMatch(/\.webp$/);
    expect(image.sizes).toEqual([{ width: 120, url: image.url }]);
  }

  await page.goto(`/products?edit=${product.id}`);
  await page.locator('.modal').getByRole('button', { name: 'تصاویر' }).click();
  await expect(page.locator('.modal .badge', { hasText: 'تصویر اصلی' })).toHaveCount(1);
  await page.locator('.modal').getByRole('button', { name: 'تصویر اصلی شود' }).last().click();

  const expected = [before.at(-1), ...before.slice(0, -1)];
  await expect
    .poll(async () => (await api('GET', `/products/${product.id}`, { token: admin })).data.images.map((i) => i.id))
    .toEqual(expected);
});

test('an option can be taken off sale without deleting it', async ({ page }) => {
  const { admin } = tokensFor();
  let product;
  for (const summary of items((await api('GET', '/products?limit=50', { token: admin })).data)) {
    const full = (await api('GET', `/products/${summary.id}`, { token: admin })).data;
    if (full.variants.filter((v) => v.is_active !== false).length >= 2) {
      product = full;
      break;
    }
  }
  test.skip(!product, 'no product with two options on sale');
  const variant = product.variants.find((v) => v.is_active !== false);

  await page.goto(`/products?edit=${product.id}`);
  await page.locator('.modal').getByRole('button', { name: 'گزینه‌ها' }).click();
  await page.locator('.modal label.checkbox', { hasText: 'در فروش' }).first().locator('input').uncheck();
  await page.locator('.modal-foot').getByRole('button', { name: 'ذخیره' }).click();
  try {
    await expect
      .poll(async () => {
        const full = (await api('GET', `/products/${product.id}`, { token: admin })).data;
        return full.variants.find((v) => v.id === variant.id)?.is_active;
      })
      .toBe(false);
  } finally {
    await api('PATCH', `/products/${product.id}/variants/${variant.id}`, {
      token: admin,
      body: { is_active: true },
    });
  }
});

test('a product is found by the SKU of one of its options', async ({ page }) => {
  const { admin } = tokensFor();
  let found;
  for (const summary of items((await api('GET', '/products?limit=20', { token: admin })).data)) {
    const full = (await api('GET', `/products/${summary.id}`, { token: admin })).data;
    const sku = full.variants.find((v) => v.sku)?.sku;
    if (sku) {
      found = { title: full.title, sku };
      break;
    }
  }
  test.skip(!found, 'no option with a SKU');

  await page.goto('/products');
  await page.locator('input[placeholder^="نام کالا یا کد انبار"]').fill(found.sku);
  await expect(page.locator('table.data tbody tr', { hasText: found.title })).toHaveCount(1);
});
