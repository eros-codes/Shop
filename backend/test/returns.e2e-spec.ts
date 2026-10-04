import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { assertDisposableTestDatabase } from './assert-test-database';
import { bootApp, createAccount, idempotencyKey } from './shop-helpers';
import userRoleEnum from '../src/users/enums/userRoleEnum';

assertDisposableTestDatabase();

// What happens after delivery: the goods come back, they are checked,
// and only then does money move - which is the part worth having an
// end-to-end test for, because it touches the wallet, the stock and the
// order's own refund ledger at once.
describe('Returns (e2e)', () => {
  let app: INestApplication;
  let admin: { token: string };
  let customer: { id: number; token: string; addressId?: number };
  let productId: number;
  let variantId: number;
  let orderId: number;
  let orderItemId: number;
  const run = Date.now();

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await bootApp();
    admin = await createAccount(app, userRoleEnum.AdminUser);
    customer = await createAccount(app, userRoleEnum.NormalUser, {
      walletAmount: 50_000_000,
      withAddress: true,
    });

    const product = await api()
      .post('/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: `E2E Chair ${run}`,
        description: 'wooden',
        price: 1_000_000,
        stock: 0,
        weight_grams: 5_000,
        variants: [{ title: 'قهوه‌ای', sku: `e2e-chair-${run}`, stock: 5 }],
      });
    productId = product.body.data.id;
    variantId = product.body.data.variants[0].id;

    const order = await api()
      .post('/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', idempotencyKey('return-order'))
      .send({
        addressId: customer.addressId,
        payWithWallet: true,
        items: [{ productId, variantId, quantity: 2 }],
      });
    orderId = order.body.data.id;
    orderItemId = order.body.data.items[0].id;

    for (const status of ['processing', 'sent', 'delivered']) {
      await api()
        .patch(`/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ status });
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('refuses a return of more than was bought', async () => {
    const res = await api()
      .post('/returns')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        orderId,
        reason: 'damaged',
        items: [{ orderItemId, quantity: 5 }],
      });

    expect(res.status).toBe(400);
  });

  it('accepts a request for a delivered order', async () => {
    const res = await api()
      .post('/returns')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        orderId,
        reason: 'damaged',
        description: 'یک پایه شکسته بود',
        items: [{ orderItemId, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('requested');
  });

  it('will not pay anything out before the goods are back', async () => {
    const list = await api()
      .get('/returns')
      .set('Authorization', `Bearer ${customer.token}`);
    const returnId = list.body.data.items[0].id;

    const res = await api()
      .patch(`/returns/${returnId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'refunded' });

    expect(res.status).toBe(400);
  });

  it('refunds the goods and their tax, restocks them, and records it on the order', async () => {
    const dataSource = app.get(DataSource);
    const list = await api()
      .get('/returns')
      .set('Authorization', `Bearer ${admin.token}`);
    const returnId = list.body.data.items[0].id;

    await api()
      .patch(`/returns/${returnId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'approved' });
    await api()
      .patch(`/returns/${returnId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'received' });

    const walletBefore = await dataSource.query(
      'SELECT amount FROM wallets WHERE user_id = ?',
      [customer.id],
    );
    const stockBefore = await dataSource.query(
      'SELECT stock FROM product_variants WHERE id = ?',
      [variantId],
    );

    const refunded = await api()
      .patch(`/returns/${returnId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'refunded', restock: true });
    expect(refunded.status).toBe(200);

    const walletAfter = await dataSource.query(
      'SELECT amount FROM wallets WHERE user_id = ?',
      [customer.id],
    );
    const stockAfter = await dataSource.query(
      'SELECT stock FROM product_variants WHERE id = ?',
      [variantId],
    );
    const order = await dataSource.query(
      'SELECT tax_amount, refunded_amount FROM `order` WHERE id = ?',
      [orderId],
    );

    const goods = 1_000_000;
    const taxShare = Math.round(
      (goods * Number(order[0].tax_amount)) / (goods * 2),
    );
    expect(Number(walletAfter[0].amount) - Number(walletBefore[0].amount)).toBe(
      goods + taxShare,
    );
    expect(Number(stockAfter[0].stock)).toBe(Number(stockBefore[0].stock) + 1);
    expect(Number(order[0].refunded_amount)).toBe(goods + taxShare);
  });

  it('cannot be refunded twice', async () => {
    const list = await api()
      .get('/returns')
      .set('Authorization', `Bearer ${admin.token}`);
    const returnId = list.body.data.items[0].id;

    const res = await api()
      .patch(`/returns/${returnId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'refunded' });

    expect(res.status).toBe(400);
  });

  it('records who did it in the audit log', async () => {
    const res = await api()
      .get('/audit-logs?action=return.refunded')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items[0].actor).toBeTruthy();
  });
});
