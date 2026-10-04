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

const SOLD_STATUSES = ['paid', 'processing', 'sent', 'delivered'];

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
  ) {}

  private range(query: SalesReportDto): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  async sales(query: SalesReportDto) {
    const { from, to } = this.range(query);
    const format = query.granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';

    const rows = await this.orders
      .createQueryBuilder('o')
      .select(`DATE_FORMAT(o.createdAt, '${format}')`, 'period')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('COALESCE(SUM(o.total_price), 0)', 'gross')
      .addSelect('COALESCE(SUM(o.refunded_amount), 0)', 'refunded')
      .addSelect('COALESCE(SUM(o.shipping_cost), 0)', 'shipping')
      .addSelect('COALESCE(SUM(o.tax_amount), 0)', 'tax')
      .addSelect('COALESCE(SUM(o.discount_amount), 0)', 'discounts')
      .where('o.status IN (:...statuses)', { statuses: SOLD_STATUSES })
      .andWhere('o.deletedAt IS NULL')
      .andWhere('o.createdAt BETWEEN :from AND :to', { from, to })
      .groupBy('period')
      .orderBy('period', 'ASC')
      .getRawMany<Record<string, string>>();

    const periods = rows.map((row) => ({
      period: row.period,
      orders: Number(row.orders),
      gross: Number(row.gross),
      refunded: Number(row.refunded),
      net: Number(row.gross) - Number(row.refunded),
      shipping: Number(row.shipping),
      tax: Number(row.tax),
      discounts: Number(row.discounts),
    }));

    const totals = periods.reduce(
      (sum, period) => ({
        orders: sum.orders + period.orders,
        gross: sum.gross + period.gross,
        refunded: sum.refunded + period.refunded,
        net: sum.net + period.net,
        shipping: sum.shipping + period.shipping,
        tax: sum.tax + period.tax,
        discounts: sum.discounts + period.discounts,
      }),
      {
        orders: 0,
        gross: 0,
        refunded: 0,
        net: 0,
        shipping: 0,
        tax: 0,
        discounts: 0,
      },
    );

    return {
      currency: CURRENCY_CODE,
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
      .andWhere('o.createdAt BETWEEN :from AND :to', { from, to })
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

  async summary() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfToday);
    startOfMonth.setDate(1);

    const [today, month] = await Promise.all([
      this.sales({ from: startOfToday.toISOString() }),
      this.sales({ from: startOfMonth.toISOString(), granularity: 'month' }),
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
