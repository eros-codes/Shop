// Browsing as a guest: what the shop says about itself, the catalogue,
// favourites, and the parts of the basket that work before signing in.
import { GUEST, expect, test } from '../../support/fixtures.js';
import { api, digitsOf, sellableProduct, tokensFor } from '../../support/api.js';

test.use({ storageState: GUEST });

test('the home page makes no promise the shop does not keep', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.product-card').first()).toBeVisible();
  // The return window comes from the API (RETURN_WINDOW_DAYS=7), once the
  // shop's settings have loaded.
  await expect(page.locator('body')).toContainText('۷ روز مهلت مرجوعی');
  const body = await page.locator('body').innerText();
  for (const claim of ['اصالت', '۲۴ ساعته', 'قید و شرط', 'اورجینال', 'شامل مالیات']) {
    expect(body, `"${claim}" on the home page`).not.toContain(claim);
  }
  const year = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' })
    .format(new Date())
    .match(/[۰-۹]+/)[0];
  expect(body).toContain(`© ${year}`);
});

test('the footer shows the contact links that are set, and only those', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('footer a[aria-label="تلگرام"]')).toHaveCount(1);
  await expect(page.locator('footer a[aria-label="اینستاگرام"]')).toHaveCount(0);
  await expect(page.locator('footer img[alt="نماد اعتماد الکترونیکی"]')).toHaveCount(0);
});

test('a product page shows its price and names itself in the tab', async ({ page }) => {
  const { product } = await sellableProduct();
  await page.goto(`/product/${product.slug}`);
  await expect(page.locator('.buy-cta')).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(`^${product.title}`));
  expect(digitsOf(await page.locator('.buy-price').innerText()).length).toBeGreaterThan(0);
});

test('the price filter keeps digits typed on a Persian keyboard', async ({ page }) => {
  await page.goto('/products');
  await page.locator('.filters-toggle').click();
  const from = page.locator('.drawer input[placeholder="از"]');
  await from.fill('۱۲۳۴۵');
  await expect(from).toHaveValue('12345');
});

test('a guest can keep favourites', async ({ page }) => {
  await page.goto('/products');
  await page.locator('.product-card .wish-btn').first().click();
  await page.locator('a.header-action[href="/favorites"]').click();
  await expect(page).toHaveURL(/\/favorites$/);
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page).toHaveTitle(/^علاقه‌مندی‌ها/);
});

test('checkout asks a guest to sign in first, and comes back after', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)checkout/);
});

test("a guest's basket shows today's price, not the price when it was added", async ({ page }) => {
  const { admin } = tokensFor();
  const { product, variant } = await sellableProduct({ singleOption: true });

  await page.goto(`/product/${product.slug}`);
  await page.locator('.buy-cta').click();

  // The price changes after it went into the basket.
  const now = Number(variant.price ?? product.price) + 1000;
  const patchVariant = (body) =>
    api('PATCH', `/products/${product.id}/variants/${variant.id}`, { token: admin, body });
  expect((await patchVariant({ price: now, sale_price: null })).status).toBe(200);
  try {
    await page.goto('/cart');
    await expect
      .poll(async () => digitsOf(await page.locator('.cart-line .strong').last().innerText()))
      .toBe(String(now));
  } finally {
    await patchVariant({ price: variant.price ?? null, sale_price: variant.sale_price ?? null });
  }
});

test('on a phone a product card loads a small copy of the photo, never the full one', async ({
  page,
  browser,
}) => {
  const { admin } = tokensFor();
  const { product } = await sellableProduct();

  // A camera-sized photo, drawn by the browser.
  const maker = await browser.newPage();
  const jpeg = await maker.evaluate(async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 3000, height: 2000 });
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 3000, 2000);
    gradient.addColorStop(0, '#e63946');
    gradient.addColorStop(1, '#2a9d8f');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 3000, 2000);
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.92));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await maker.close();

  const form = new FormData();
  form.append('images', new Blob([Uint8Array.from(jpeg)], { type: 'image/jpeg' }), 'camera.jpg');
  const uploaded = await api('POST', `/products/${product.id}/images`, { token: admin, form });
  const image = uploaded.data.images.at(-1);
  expect(image.sizes.map((size) => size.width)).toEqual([400, 800, 1600]);
  await api('PATCH', `/products/${product.id}/images/${image.id}/cover`, { token: admin });

  try {
    await page.goto(`/products?search=${encodeURIComponent(product.title)}`);
    const picture = page.locator('.product-card', { hasText: product.title }).first().locator('img');
    await picture.scrollIntoViewIfNeeded();
    // A card is half a phone screen wide: the 400 or (on a dense screen)
    // the 800 - not the 1600, and not the original upload.
    await expect
      .poll(() => picture.evaluate((element) => element.currentSrc))
      .toMatch(/-(400|800)\.webp$/);
  } finally {
    await api('DELETE', `/products/${product.id}/images/${image.id}`, { token: admin });
  }
});
