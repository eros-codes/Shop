import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { assertDisposableTestDatabase } from './assert-test-database';
import { bootApp, createAccount, idempotencyKey } from './shop-helpers';
import userRoleEnum from '../src/users/enums/userRoleEnum';
import { Order } from '../src/orders/entities/order.entity';

assertDisposableTestDatabase();

// Sales reports cut days on Tehran time. Grouped by the server's clock, an
// order placed just after midnight in Tehran landed on the previous day
// whenever the host ran on UTC.
describe('Reports (e2e)', () => {
  let app: INestApplication;
  let admin: { token: string };
  let orderId: number;
  const run = Date.now();

  const api = () => request(app.getHttpServer());
  const sales = async (query: string) => {
    const res = await api()
      .get(`/reports/sales?${query}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    return res.body.data as {
      totals: { orders: number };
      periods: { period: string; label: string; orders: number }[];
    };
  };

  beforeAll(async () => {
    app = await bootApp();
    admin = await createAccount(app, userRoleEnum.AdminUser);
    const customer = await createAccount(app, userRoleEnum.NormalUser, {
      walletAmount: 50_000_000,
      withAddress: true,
    });

    const product = await api()
      .post('/products')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: `E2E Lamp ${run}`,
        description: 'brass',
        price: 1_000_000,
        stock: 0,
        weight_grams: 1_000,
        variants: [{ title: 'زرد', sku: `e2e-lamp-${run}`, stock: 5 }],
      });

    const order = await api()
      .post('/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', idempotencyKey('report-order'))
      .send({
        addressId: customer.addressId,
        payWithWallet: true,
        items: [
          {
            productId: product.body.data.id,
            variantId: product.body.data.variants[0].id,
            quantity: 1,
          },
        ],
      });
    orderId = order.body.data.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('counts an order at 00:30 Tehran time on that Tehran day and Persian month', async () => {
    // 1 January 2026, 00:30 in Tehran (11 Dey 1404) - still 31 December
    // in UTC.
    const before = {
      newYear: await sales('from=2026-01-01&to=2026-01-01'),
      eve: await sales('from=2025-12-31&to=2025-12-31'),
      dey: await sales('from=2026-01-01&to=2026-01-01&granularity=month'),
    };

    const dataSource = app.get(DataSource);
    const table = dataSource.getMetadata(Order).tableName;
    // createdAt is kept in the database server's zone, whatever that is.
    await dataSource.query(
      `UPDATE \`${table}\` SET createdAt = CONVERT_TZ('2025-12-31 21:00:00', '+00:00', @@session.time_zone) WHERE id = ?`,
      [orderId],
    );

    const newYear = await sales('from=2026-01-01&to=2026-01-01');
    expect(newYear.totals.orders).toBe(before.newYear.totals.orders + 1);
    expect(newYear.periods).toContainEqual(
      expect.objectContaining({ period: '2026-01-01', label: '۱۱ دی' }),
    );

    const eve = await sales('from=2025-12-31&to=2025-12-31');
    expect(eve.totals.orders).toBe(before.eve.totals.orders);

    const dey = await sales('from=2026-01-01&to=2026-01-01&granularity=month');
    expect(dey.totals.orders).toBe(before.dey.totals.orders + 1);
    // The bucket is the Persian month: 1 Dey 1404 is 22 December 2025.
    expect(dey.periods).toEqual([
      expect.objectContaining({ period: '2025-12-22', label: 'دی ۱۴۰۴' }),
    ]);
  });
});
