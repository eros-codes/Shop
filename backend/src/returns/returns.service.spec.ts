import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { ReturnRequest } from './entities/return-request.entity';
import { ReturnItem } from './entities/return-item.entity';
import { Order } from '../orders/entities/order.entity';
import { WalletsService } from '../wallets/wallets.service';
import { AuditService } from '../audit/audit.service';
import { CatalogCacheService } from '../common/cache/catalog-cache.service';
import ReturnStatusEnum from './enums/return-status.enum';
import ReturnReasonEnum from './enums/return-reason.enum';
import OrderStatusEnum from '../orders/enums/order-status.enum';

describe('ReturnsService', () => {
  let service: ReturnsService;
  let requests: Record<string, jest.Mock>;
  let returnItems: Record<string, jest.Mock>;
  let orders: Record<string, jest.Mock>;
  let wallets: { refund: jest.Mock };
  let manager: Record<string, jest.Mock>;
  let variantRepo: Record<string, jest.Mock>;
  let qb: Record<string, jest.Mock>;

  const deliveredOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 5,
    user: { id: 7 },
    status: OrderStatusEnum.Delivered,
    delivered_at: new Date(),
    items_total: 200_000,
    discount_amount: 0,
    tax_amount: 20_000,
    shipping_cost: 30_000,
    total_price: 250_000,
    refunded_amount: 0,
    items: [
      {
        id: 11,
        quantity: 2,
        price: 100_000,
        product: { title: 'Lamp' },
        variant: { id: 21 },
      },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    qb = {};
    for (const m of [
      'innerJoin',
      'select',
      'addSelect',
      'where',
      'andWhere',
      'groupBy',
    ]) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getRawMany = jest.fn().mockResolvedValue([]);

    requests = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 3, ...data })),
      findOne: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      update: jest.fn(),
    };
    returnItems = {
      create: jest.fn((data) => data),
      createQueryBuilder: jest.fn(() => qb),
    };
    orders = { findOne: jest.fn(), update: jest.fn() };
    wallets = { refund: jest.fn() };
    variantRepo = {
      increment: jest.fn(),
      find: jest.fn().mockResolvedValue([{ id: 21, product: { id: 9 } }]),
    };
    manager = {
      getRepository: jest.fn((entity: { name?: string }) =>
        entity?.name === 'ProductVariant' ? variantRepo : requests,
      ),
      query: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReturnsService,
        { provide: getRepositoryToken(ReturnRequest), useValue: requests },
        { provide: getRepositoryToken(ReturnItem), useValue: returnItems },
        { provide: getRepositoryToken(Order), useValue: orders },
        { provide: WalletsService, useValue: wallets },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(() => '7') } },
        { provide: CatalogCacheService, useValue: { invalidate: jest.fn() } },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn((cb: any) => cb(manager)) },
        },
      ],
    }).compile();

    service = moduleRef.get(ReturnsService);
  });

  describe('requesting a return', () => {
    const dto = {
      orderId: 5,
      reason: ReturnReasonEnum.Damaged,
      items: [{ orderItemId: 11, quantity: 1 }],
    };

    it('accepts one for a delivered order inside the window', async () => {
      orders.findOne.mockResolvedValue(deliveredOrder());
      requests.findOne.mockResolvedValue({ id: 3, user: { id: 7 } });

      await service.create(7, dto);

      expect(requests.save).toHaveBeenCalled();
    });

    it("refuses someone else's order", async () => {
      orders.findOne.mockResolvedValue(deliveredOrder({ user: { id: 99 } }));

      await expect(service.create(7, dto as never)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses an order that has not been delivered', async () => {
      orders.findOne.mockResolvedValue(
        deliveredOrder({ status: OrderStatusEnum.Sent }),
      );

      await expect(service.create(7, dto as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses one after the window has closed', async () => {
      orders.findOne.mockResolvedValue(
        deliveredOrder({
          delivered_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        }),
      );

      await expect(service.create(7, dto as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses an item that is not part of the order', async () => {
      orders.findOne.mockResolvedValue(deliveredOrder());

      await expect(
        service.create(7, {
          ...dto,
          items: [{ orderItemId: 99, quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses more than is left after an earlier return', async () => {
      orders.findOne.mockResolvedValue(deliveredOrder());
      qb.getRawMany.mockResolvedValue([{ orderItemId: 11, quantity: '2' }]);

      await expect(service.create(7, dto as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resolving a return', () => {
    const pending = (overrides: Record<string, unknown> = {}) => ({
      id: 3,
      status: ReturnStatusEnum.Received,
      restock: true,
      order: deliveredOrder(),
      items: [
        {
          quantity: 1,
          orderItem: { id: 11, price: 100_000, variant: { id: 21 } },
        },
      ],
      ...overrides,
    });

    it('refunds the goods and their share of the tax, never the shipping', async () => {
      requests.findOne.mockResolvedValue(pending());

      await service.updateStatus(3, {
        status: ReturnStatusEnum.Refunded,
      });

      expect(wallets.refund).toHaveBeenCalledWith(
        7,
        110_000,
        expect.stringContaining('Refund'),
        expect.anything(),
      );
    });

    it('refuses to give back more than the customer paid', async () => {
      requests.findOne.mockResolvedValue(
        pending({ order: deliveredOrder({ refunded_amount: 250_000 }) }),
      );

      await expect(
        service.updateStatus(3, { status: ReturnStatusEnum.Refunded }),
      ).rejects.toThrow(BadRequestException);
      expect(wallets.refund).not.toHaveBeenCalled();
    });

    it('will not refund before the goods are back', async () => {
      requests.findOne.mockResolvedValue(
        pending({ status: ReturnStatusEnum.Requested }),
      );

      await expect(
        service.updateStatus(3, { status: ReturnStatusEnum.Refunded }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lets the customer cancel while nothing has happened yet', async () => {
      requests.findOne.mockResolvedValue({
        id: 3,
        status: ReturnStatusEnum.Requested,
        user: { id: 7 },
      });

      await service.cancel(3, 7);

      expect(requests.update).toHaveBeenCalledWith(
        { id: 3 },
        { status: ReturnStatusEnum.Cancelled },
      );
    });

    it('does not let them cancel one that is already approved', async () => {
      requests.findOne.mockResolvedValue({
        id: 3,
        status: ReturnStatusEnum.Approved,
        user: { id: 7 },
      });

      await expect(service.cancel(3, 7)).rejects.toThrow(BadRequestException);
    });
  });
});
