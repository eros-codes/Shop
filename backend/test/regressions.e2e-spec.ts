import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { assertDisposableTestDatabase } from './assert-test-database';
import {
  PASSWORD,
  bootApp,
  createAccount,
  idempotencyKey,
} from './shop-helpers';
import userRoleEnum from '../src/users/enums/userRoleEnum';

assertDisposableTestDatabase();

// Each test here pins down one defect that was found by exercising the
// running shop, not by reading it. Most of them passed every unit test at
// the time: they only show up with a real database, real concurrency or a
// real token. If one of these starts failing, read the comment above it
// before "fixing" the test.
describe('Regressions (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let admin: { token: string };
  let customer: { id: number; token: string; addressId?: number };
  let shippingMethodId: number;
  const run = Date.now();

  const api = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) =>
    req.set('Authorization', `Bearer ${admin.token}`);
  const asCustomer = (req: request.Test) =>
    req.set('Authorization', `Bearer ${customer.token}`);

  const stockOf = async (variantId: number): Promise<number> => {
    const [row] = await dataSource.query(
      'SELECT stock FROM product_variants WHERE id = ?',
      [variantId],
    );
    return Number(row.stock);
  };

  // A product with a single option, so its stock is easy to reason about.
  const productWithStock = async (stock: number) => {
    const res = await asAdmin(api().post('/products')).send({
      title: `E2E regression ${run}-${Math.random().toString(36).slice(2, 7)}`,
      description: 'regression fixture',
      price: 100_000,
      stock: 0,
      weight_grams: 200,
      variants: [
        {
          title: 'تک',
          sku: `e2e-reg-${run}-${Math.random().toString(36).slice(2, 8)}`,
          stock,
        },
      ],
    });
    expect(res.status).toBe(201);
    return {
      productId: res.body.data.id as number,
      variantId: res.body.data.variants[0].id as number,
    };
  };

  const order = (productId: number, variantId: number, label: string) =>
    asCustomer(api().post('/orders'))
      .set('Idempotency-Key', idempotencyKey(label))
      .send({
        addressId: customer.addressId,
        payWithWallet: true,
        shippingMethodId,
        items: [{ productId, variantId, quantity: 1 }],
      });

  beforeAll(async () => {
    app = await bootApp();
    dataSource = app.get(DataSource);
    admin = await createAccount(app, userRoleEnum.AdminUser);
    customer = await createAccount(app, userRoleEnum.NormalUser, {
      walletAmount: 500_000_000,
      withAddress: true,
    });

    const zone = await asAdmin(api().post('/shipping/zones')).send({
      title: `e2e-reg-zone-${run}`,
      provinces: [],
      is_default: true,
    });
    const method = await asAdmin(api().post('/shipping/methods')).send({
      title: 'e2e regression post',
      code: `e2e-reg-${run}`,
      estimated_days_min: 1,
      estimated_days_max: 2,
    });
    shippingMethodId = method.body.data.id;
    await asAdmin(
      api().post(`/shipping/methods/${shippingMethodId}/rates`),
    ).send({ zoneId: zone.body.data.id, base_cost: 10_000, per_kg_cost: 0 });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  // The variant lock used to be taken by a query that selected only `id`,
  // and stock was then read by a plain SELECT. Under REPEATABLE READ that
  // plain read returns the transaction's snapshot, not the latest commit,
  // so every concurrent checkout saw the same last unit and all of them
  // succeeded. Eight buyers, one item.
  it('sells the last unit exactly once under concurrent checkouts', async () => {
    const { productId, variantId } = await productWithStock(1);

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        order(productId, variantId, `race-${run}-${i}`),
      ),
    );

    const sold = results.filter((res) => res.status === 201);
    const refused = results.filter((res) => res.status >= 400);
    expect(sold).toHaveLength(1);
    expect(refused).toHaveLength(7);
    refused.forEach((res) => expect(res.body.code).toBe('INSUFFICIENT_STOCK'));
    expect(await stockOf(variantId)).toBe(0);
  }, 60_000);

  // A signed-in customer's basket lives on the server. The client only
  // cleared its local copy after ordering, so the ordered lines came back
  // on the next reload and could be bought a second time.
  it('removes the ordered lines from the server-side basket', async () => {
    const { productId, variantId } = await productWithStock(5);
    const other = await productWithStock(5);

    await asCustomer(api().post('/products/basket')).send({
      product_id: productId,
      variant_id: variantId,
    });
    await asCustomer(api().post('/products/basket')).send({
      product_id: other.productId,
      variant_id: other.variantId,
    });

    const placed = await order(productId, variantId, `basket-${run}`);
    expect(placed.status).toBe(201);

    const basket = await asCustomer(
      api().get(`/products/basket/${customer.id}`),
    );
    const lines = (
      basket.body.data as Array<{
        product: { id: number };
        variant?: { id: number } | null;
      }>
    ).map((line) => `${line.product.id}:${line.variant?.id ?? ''}`);

    expect(lines).not.toContain(`${productId}:${variantId}`);
    // ...and only that line: the rest of the basket is untouched.
    expect(lines).toContain(`${other.productId}:${other.variantId}`);
  }, 60_000);

  // The product editor used to PATCH every variant with the stock it had
  // when the page was opened. A sale made while it was open was written
  // back over on save, even if the admin had only changed the title.
  describe('stock edits that race a sale', () => {
    it('leaves stock alone when only other fields change', async () => {
      const { productId, variantId } = await productWithStock(12);
      await dataSource.query(
        'UPDATE product_variants SET stock = stock - 5 WHERE id = ?',
        [variantId],
      );

      const res = await asAdmin(
        api().patch(`/products/${productId}/variants/${variantId}`),
      ).send({ title: 'renamed' });

      expect(res.status).toBe(200);
      expect(await stockOf(variantId)).toBe(7);
    });

    it('refuses a stock value based on a stale read', async () => {
      const { productId, variantId } = await productWithStock(12);
      await dataSource.query(
        'UPDATE product_variants SET stock = stock - 5 WHERE id = ?',
        [variantId],
      );

      const stale = await asAdmin(
        api().patch(`/products/${productId}/variants/${variantId}`),
      ).send({ stock: 20, expected_stock: 12 });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('STOCK_CHANGED');
      expect(await stockOf(variantId)).toBe(7);

      const fresh = await asAdmin(
        api().patch(`/products/${productId}/variants/${variantId}`),
      ).send({ stock: 20, expected_stock: 7 });
      expect(fresh.status).toBe(200);
      expect(await stockOf(variantId)).toBe(20);
    });
  });

  // Both combination guards bailed out on an empty option list, so a
  // product could pick up two identical "Default" variants - the picker
  // cannot tell them apart and the stock silently splits. Option-less
  // variants are now told apart by title: differently named ones are fine
  // (checkout.e2e relies on exactly that), a repeated name is not.
  it('refuses a second option-less variant with the same name', async () => {
    const { productId } = await productWithStock(3);

    const same = await asAdmin(
      api().post(`/products/${productId}/variants`),
    ).send({ title: 'تک', stock: 1, price: 100_000 });
    expect(same.status).toBe(400);

    const different = await asAdmin(
      api().post(`/products/${productId}/variants`),
    ).send({ title: 'دیگر', stock: 1, price: 100_000 });
    expect(different.status).toBe(201);
  });

  // Bookmarks were write-only: rows went in and nothing ever read them
  // back, so a signed-in customer's favourites vanished on refresh. The
  // literal route also has to be declared before `:id`, or Nest parses
  // "bookmark" as a product id.
  it('reads back the bookmarks it stores', async () => {
    const { productId } = await productWithStock(1);
    await asCustomer(api().post('/products/bookmark')).send({
      product_id: productId,
    });

    const res = await asCustomer(api().get('/products/bookmark'));

    expect(res.status).toBe(200);
    expect(res.body.data.productIds).toContain(productId);
  });

  // Access tokens were trusted for their whole lifetime without looking at
  // the database, so a password change left a stolen token working, a
  // demoted admin kept admin rights and a removed account stayed signed in.
  describe('tokens issued before a change of circumstances', () => {
    it('stops a token issued before the password changed', async () => {
      const victim = await createAccount(app, userRoleEnum.NormalUser);
      // iat has whole-second resolution; make sure the change lands in a
      // later second than the token so the comparison is unambiguous.
      await new Promise((resolve) => setTimeout(resolve, 1_100));

      const changed = await api()
        .patch('/auth/password')
        .set('Authorization', `Bearer ${victim.token}`)
        .send({ currentPassword: PASSWORD, newPassword: 'Rotated123x' });
      expect(changed.status).toBe(200);

      const stolen = await api()
        .get('/addresses')
        .set('Authorization', `Bearer ${victim.token}`);
      expect(stolen.status).toBe(401);
    }, 30_000);

    it('takes the role from the database, not the token', async () => {
      const demoted = await createAccount(app, userRoleEnum.AdminUser);
      const before = await api()
        .get('/users')
        .set('Authorization', `Bearer ${demoted.token}`);
      expect(before.status).toBe(200);

      await dataSource.query('UPDATE users SET role = ? WHERE id = ?', [
        userRoleEnum.NormalUser,
        demoted.id,
      ]);

      const after = await api()
        .get('/users')
        .set('Authorization', `Bearer ${demoted.token}`);
      expect(after.status).toBe(403);
    });

    it('stops a token whose account has been removed', async () => {
      const gone = await createAccount(app, userRoleEnum.NormalUser);
      await dataSource.query(
        'UPDATE users SET deletedAt = NOW(3) WHERE id = ?',
        [gone.id],
      );

      const res = await api()
        .get('/addresses')
        .set('Authorization', `Bearer ${gone.token}`);
      expect(res.status).toBe(401);
    });
  });
});
