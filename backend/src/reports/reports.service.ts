import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../orders/entities/order.entity';
import {
  LowStockDto,
  SalesReportDto,
  TopProductsDto,
} from './dto/report-query.dto';
import { CURRENCY_CODE } from '../common/constants/currency';
import { queryRows } from '../common/database/raw-query';
import {
  SHOP_TIME_ZONE,
  SHOP_UTC_OFFSET,
  parseShopBoundary,
  persianDayLabel,
  persianMonthLabel,
  persianMonthStart,
  startOfShopDay,
  startOfShopMonth,
  toUtcSql,
} from '../common/time/shop-time';

const SOLD_STATUSES = ['paid', 'processing', 'sent', 'delivered'];

// createdAt is filled in by MySQL, in the database server's own zone.
// Days are cut on Tehran time: grouped by the server's clock, an order
// placed at 1am in Tehran landed on the previous day whenever the host
// ran on UTC.
const ORDER_DAY_IN_TEHRAN = `DATE_FORMAT(CONVERT_TZ(o.createdAt, @@session.time_zone, '${SHOP_UTC_OFFSET}'), '%Y-%m-%d')`;
// The range is compared in the column's own zone, so the index still
// applies: the bounds are converted, not every row.
const ORDER_IN_RANGE =
  "o.createdAt BETWEEN CONVERT_TZ(:from, '+00:00', @@session.time_zone) " +
  "AND CONVERT_TZ(:to, '+00:00', @@session.time_zone)";

const SUM_FIELDS = [
  'orders',
  'gross',
  'refunded',
  'shipping',
  'tax',
  'discounts',
] as const;
type Sums = Record<(typeof SUM_FIELDS)[number], number>;
const emptySums = (): Sums => ({
  orders: 0,
  gross: 0,
  refunded: 0,
  shipping: 0,
  tax: 0,
  discounts: 0,
});

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
  ) {}

  // A bare date is a whole Tehran day; with no `from`, the 30 days up to
  // `to`, starting at a Tehran midnight.
  private range(query: SalesReportDto): { from: Date; to: Date } {
    const to = query.to ? parseShopBoundary(query.to, 'end') : new Date();
    const from = query.from
      ? parseShopBoundary(query.from, 'start')
      : startOfShopDay(new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000));
    return { from, to };
  }

  // Days are Tehran days; months are Persian months (Mehr, Aban, ...),
  // rolled up from the days - MySQL has no Persian calendar. `period` is
  // the first day of the bucket as YYYY-MM-DD, `label` how it reads.
  async sales(query: SalesReportDto) {
    const { from, to } = this.range(query);
    const byMonth = query.granularity === 'month';

    const rows = await this.orders
      .createQueryBuilder('o')
      .select(ORDER_DAY_IN_TEHRAN, 'day')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('COALESCE(SUM(o.total_price), 0)', 'gross')
      .addSelect('COALESCE(SUM(o.refunded_amount), 0)', 'refunded')
      .addSelect('COALESCE(SUM(o.shipping_cost), 0)', 'shipping')
      .addSelect('COALESCE(SUM(o.tax_amount), 0)', 'tax')
      .addSelect('COALESCE(SUM(o.discount_amount), 0)', 'discounts')
      .where('o.status IN (:...statuses)', { statuses: SOLD_STATUSES })
      .andWhere('o.deletedAt IS NULL')
      .andWhere(ORDER_IN_RANGE, { from: toUtcSql(from), to: toUtcSql(to) })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<Record<string, string>>();

    const buckets = new Map<string, Sums>();
    for (const row of rows) {
      const key = byMonth ? persianMonthStart(row.day) : row.day;
      const sums = buckets.get(key) ?? emptySums();
      for (const field of SUM_FIELDS) {
        sums[field] += Number(row[field]);
      }
      buckets.set(key, sums);
    }

    const periods = [...buckets].map(([period, sums]) => ({
      period,
      label: byMonth ? persianMonthLabel(period) : persianDayLabel(period),
      ...sums,
      net: sums.gross - sums.refunded,
    }));

    const totals = periods.reduce(
      (sum, period) => {
        for (const field of SUM_FIELDS) {
          sum[field] += period[field];
        }
        sum.net += period.net;
        return sum;
      },
      { ...emptySums(), net: 0 },
    );

    return {
      currency: CURRENCY_CODE,
      timeZone: SHOP_TIME_ZONE,
      from,
      to,
      granularity: query.granularity ?? 'day',
      totals: {
        ...totals,
        averageOrderValue: totals.orders
          ? Math.round(totals.net / totals.orders)
          : 0,
      },
      periods,
    };
  }

  async topProducts(query: TopProductsDto) {
    const { from, to } = this.range(query);
    const rows = await this.orders
      .createQueryBuilder('o')
      .innerJoin('o.items', 'item')
      .innerJoin('item.product', 'product')
      .select('product.id', 'productId')
      .addSelect('product.title', 'title')
      .addSelect('SUM(item.quantity)', 'quantity')
      .addSelect('SUM(item.quantity * item.price)', 'revenue')
      .where('o.status IN (:...statuses)', { statuses: SOLD_STATUSES })
      .andWhere('o.deletedAt IS NULL')
      .andWhere(ORDER_IN_RANGE, { from: toUtcSql(from), to: toUtcSql(to) })
      .groupBy('product.id')
      .addGroupBy('product.title')
      .orderBy('quantity', 'DESC')
      .limit(query.limit ?? 10)
      .getRawMany<Record<string, string>>();

    return {
      currency: CURRENCY_CODE,
      from,
      to,
      items: rows.map((row) => ({
        productId: Number(row.productId),
        title: row.title,
        quantity: Number(row.quantity),
        revenue: Number(row.revenue),
      })),
    };
  }

  async lowStock(query: LowStockDto) {
    const threshold = query.threshold ?? 5;
    const rows = await queryRows<{
      variantId: number;
      variantTitle: string;
      sku: string;
      stock: number;
      productId: number;
      productTitle: string;
    }>(
      this.orders.manager,
      'SELECT v.`id` AS variantId, v.`title` AS variantTitle, v.`sku` AS sku, v.`stock` AS stock, ' +
        'p.`id` AS productId, p.`title` AS productTitle ' +
        'FROM `product_variants` v INNER JOIN `products` p ON p.`id` = v.`product_id` ' +
        'WHERE v.`deleted_at` IS NULL AND v.`is_active` = 1 AND p.`deleted_at` IS NULL ' +
        'AND v.`stock` <= ? ORDER BY v.`stock` ASC, p.`title` ASC LIMIT ?',
      [threshold, query.limit ?? 50],
    );

    return {
      threshold,
      items: rows.map((row) => ({
        productId: Number(row.productId),
        productTitle: row.productTitle,
        variantId: Number(row.variantId),
        variantTitle: row.variantTitle,
        sku: row.sku,
        stock: Number(row.stock),
      })),
    };
  }

  // "Today" and "this month" as the shop sees them: since midnight in
  // Tehran, and since the first of the Persian month. Taken from the
  // server's clock they started at 3:30am on a UTC host, and the month
  // was the Gregorian one.
  async summary() {
    const [today, month] = await Promise.all([
      this.sales({ from: startOfShopDay().toISOString() }),
      this.sales({
        from: startOfShopMonth().toISOString(),
        granularity: 'month',
      }),
    ]);

    const counts = await this.orders
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('o.deletedAt IS NULL')
      .groupBy('o.status')
      .getRawMany<{ status: string; count: string }>();

    return {
      currency: CURRENCY_CODE,
      today: today.totals,
      thisMonth: month.totals,
      ordersByStatus: Object.fromEntries(
        counts.map((row) => [row.status, Number(row.count)]),
      ),
    };
  }
}
