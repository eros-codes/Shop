// Accounts and wallets in the panel - roles, manual charges and
// withdrawals with their reason, and accounts made by staff.
import { expect, test } from '../../support/fixtures.js';
import { ACCOUNTS, PASSWORD } from '../../support/env.js';
import { api, items, tokensFor, userIdOf, walletBalance } from '../../support/api.js';

async function findUser(page, mobile) {
  await page.goto('/users');
  await page.locator('.search-box input').fill(mobile);
  const row = page.locator('table.data tbody tr', { hasText: mobile });
  await expect(row).toHaveCount(1);
  return row;
}

test("an admin cannot change their own role, in the panel or the API", async ({ page }) => {
  const { admin } = tokensFor();
  const row = await findUser(page, ACCOUNTS.admin);
  await expect(row.getByRole('button', { name: 'سلب دسترسی مدیر' })).toBeDisabled();

  const refused = await api('PATCH', `/users/${userIdOf(admin)}/role`, { token: admin, body: { role: 'user' } });
  expect(refused.status).toBe(403);
  expect(refused.json.code).toBe('CANNOT_CHANGE_OWN_ROLE');
});

test('making someone an admin asks first', async ({ page }) => {
  const row = await findUser(page, ACCOUNTS.outsider);
  await row.getByRole('button', { name: 'مدیر کردن' }).click();
  await expect(page.locator('.modal', { hasText: 'دادن دسترسی مدیر' })).toBeVisible();
  await page.locator('.modal').getByRole('button', { name: 'انصراف' }).click();
  const user = items((await api('GET', `/users?search=${ACCOUNTS.outsider}`, { token: tokensFor().admin })).data)[0];
  expect(user.role).toBe('user');
});

test('a wallet: charged and withdrawn with a reason, asked first, and every move logged', async ({ page }) => {
  const { admin, customer } = tokensFor();
  const customerId = userIdOf(customer);
  const start = await walletBalance(admin, customerId);

  const row = await findUser(page, ACCOUNTS.customer);
  await row.getByRole('button', { name: 'کیف پول' }).click();
  const modal = page.locator('.modal', { hasText: 'موجودی فعلی' });
  const amount = modal.locator('input[inputmode=numeric]');
  const note = modal.locator('.field', { hasText: 'توضیح' }).locator('input');

  await amount.fill('۵۰۰۰۰');
  await note.fill('هدیه‌ی جشنواره');
  await modal.getByRole('button', { name: 'شارژ کیف پول' }).click();
  // The panel clears the form once the server has answered. Waiting only
  // for the server let the next amount be typed before that, and then
  // wiped - on a slow machine the test raced its own page.
  await expect(amount).toHaveValue('');
  await expect.poll(() => walletBalance(admin, customerId)).toBe(start + 50000);

  await modal.getByRole('button', { name: 'برداشت', exact: true }).click();
  await amount.fill('20000');
  await note.fill('واریز به کارت مشتری');
  await modal.getByRole('button', { name: 'برداشت از کیف پول' }).click();
  const confirm = page.locator('.modal', { hasText: 'کم می‌شود' });
  await expect(confirm).toBeVisible();
  // Nothing leaves before it is confirmed.
  expect(await walletBalance(admin, customerId)).toBe(start + 50000);
  await confirm.locator('.modal-foot').getByRole('button', { name: 'برداشت' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(amount).toHaveValue('');
  await expect.poll(() => walletBalance(admin, customerId)).toBe(start + 30000);

  // More than there is: refused, in Persian.
  await amount.fill(String(start + 1_000_000));
  await modal.getByRole('button', { name: 'برداشت از کیف پول' }).click();
  await page.locator('.modal', { hasText: 'کم می‌شود' }).locator('.modal-foot').getByRole('button', { name: 'برداشت' }).click();
  await expect(page.locator('.toast').last()).toContainText('موجودی کیف پول کافی نیست');
  expect(await walletBalance(admin, customerId)).toBe(start + 30000);

  // Both reasons are on the customer's statement...
  const wallet = (await api('POST', `/wallets/user/${customerId}`, { token: admin })).data;
  const statement = items((await api('GET', `/wallets/${wallet.id}/transactions?limit=5`, { token: admin })).data);
  expect(statement).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ amount: -20000, description: 'واریز به کارت مشتری' }),
      expect.objectContaining({ amount: 50000, description: 'هدیه‌ی جشنواره' }),
    ]),
  );

  // ...and the withdrawal reads plainly in the activity log.
  await page.goto('/audit');
  await expect(
    page.locator('table.data tbody tr', { hasText: 'برداشت دستی از کیف پول' }).first(),
  ).toContainText('واریز به کارت مشتری');
});

test('a customer cannot withdraw from their own wallet', async () => {
  const { admin, customer } = tokensFor();
  const wallet = (await api('POST', `/wallets/user/${userIdOf(customer)}`, { token: admin })).data;
  const refused = await api('PATCH', `/wallets/${wallet.id}/withdraw`, { token: customer, body: { amount: 1000 } });
  expect(refused.status).toBe(403);
});

test('staff can create an account: errors under their fields, a taken number named, and logged', async ({ page }) => {
  const { admin } = tokensFor();
  await page.goto('/users');
  await page.getByRole('button', { name: 'کاربر جدید' }).click();
  const modal = page.locator('.modal', { hasText: 'ساخت حساب' });

  await modal.locator('input[name=mobile]').fill(ACCOUNTS.customer);
  await modal.locator('input[name=display_name]').fill('تکراری');
  await modal.locator('input[name=password]').fill('abc');
  await modal.getByRole('button', { name: 'ساخت حساب' }).click();
  await expect(modal.locator('.field-error')).toContainText('حداقل ۸');

  await modal.locator('input[name=password]').fill(PASSWORD);
  await modal.getByRole('button', { name: 'ساخت حساب' }).click();
  await expect(page.locator('.toast').last()).toContainText('قبلاً حساب ساخته شده');

  const mobile = `0919${String(Date.now()).slice(-7)}`;
  await modal.locator('input[name=mobile]').fill(mobile);
  await modal.locator('input[name=display_name]').fill('مشتری تلفنی');
  await modal.getByRole('button', { name: 'ساخت حساب' }).click();
  await expect(modal).toHaveCount(0);

  const made = items((await api('GET', `/users?search=${mobile}`, { token: admin })).data);
  expect(made).toHaveLength(1);
  expect(made[0].role).toBe('user');
  expect((await api('POST', '/auth/login', { body: { mobile, password: PASSWORD } })).status).toBe(200);
  const log = items((await api('GET', '/audit-logs?limit=10', { token: admin })).data);
  expect(log.some((entry) => entry.action === 'user.created' && Number(entry.entity_id ?? entry.entityId) === made[0].id)).toBe(true);
});
