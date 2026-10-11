// Discount codes, shipping zones and categories.
import { expect, test } from '../../support/fixtures.js';
import { api, items, tokensFor } from '../../support/api.js';

test('a discount code: Persian digits, the end date is the end of that day in Tehran, a limit can be cleared', async ({
  page,
}) => {
  const { admin } = tokensFor();
  const code = `E2E${Date.now().toString().slice(-6)}`;
  const find = async () =>
    items((await api('GET', '/discount-codes?limit=100', { token: admin })).data).find((d) => d.code === code);

  await page.goto('/discounts');
  await page.getByRole('button', { name: 'کد تخفیف جدید' }).click();
  await page.fill('.modal input[name=code]', code);
  await page.fill('.modal input[name=capacity]', '۵۰');
  await page.fill('.modal input[name=off_percent]', '۱۰');
  await page.fill('.modal input[name=max_discount_amount]', '۵۰۰۰۰');
  await page.fill('.modal input[name=expires_at]', '2030-12-20');
  await page.locator('.modal form button[type=submit]').click();
  await expect.poll(find).toBeTruthy();

  const created = await find();
  try {
    expect(created.capacity).toBe(50);
    expect(created.max_discount_amount).toBe(50000);
    // 23:59:59 on 20 Dec in Tehran (+03:30).
    expect(new Date(created.expires_at).toISOString()).toBe('2030-12-20T20:29:59.000Z');

    await page.locator('table.data tbody tr', { hasText: code }).locator('.icon-btn').first().click();
    await page.fill('.modal input[name=max_discount_amount]', '');
    await page.locator('.modal form button[type=submit]').click();
    await expect.poll(async () => (await find()).max_discount_amount).toBeNull();
  } finally {
    await api('DELETE', `/discount-codes/${created.id}`, { token: admin });
  }
});

test('saving a shipping zone untouched keeps its provinces; the picker offers all 31', async ({ page }) => {
  const zones = (await api('GET', '/shipping/zones')).data;
  const zone = zones.find((z) => (z.provinces ?? []).length > 1);

  await page.goto('/shipping');
  await page.locator('table.data tbody tr', { hasText: zone.title }).locator('.icon-btn').first().click();
  await expect(page.locator('.province-grid input[type=checkbox]')).toHaveCount(31);
  await page.locator('.modal form button[type=submit]').click();
  await expect(page.locator('.modal')).toHaveCount(0);

  const after = (await api('GET', '/shipping/zones')).data.find((z) => z.id === zone.id);
  expect([...after.provinces].sort()).toEqual([...zone.provinces].sort());
});

test('a sub-category can move to the top level, and never under itself', async ({ page }) => {
  const { admin } = tokensFor();
  const tree = (await api('GET', '/categories/tree')).data;
  const parent = tree.find((node) => (node.children ?? []).length);
  const child = parent.children[0];

  await page.goto('/categories');
  await page.locator('table.data tbody tr', { hasText: child.title }).locator('.icon-btn').nth(1).click();
  await expect(page.locator('.modal select[name=parentId]')).toHaveValue(String(parent.id));
  await page.selectOption('.modal select[name=parentId]', '');
  await page.locator('.modal form button[type=submit]').click();
  try {
    await expect
      .poll(async () => (await api('GET', '/categories/tree')).data.some((node) => node.id === child.id))
      .toBe(true);
  } finally {
    await api('PATCH', `/categories/${child.id}`, { token: admin, body: { parentId: parent.id } });
  }

  const loop = await api('PATCH', `/categories/${parent.id}`, { token: admin, body: { parentId: child.id } });
  expect(loop.json.code).toBe('CATEGORY_LOOP');
});
