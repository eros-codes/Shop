import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { User } from '../users/entities/user.entity';
import { Address } from '../address/entities/address.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { BasketItem } from '../users/entities/basket-item.entity';
import { DiscountCodesService } from '../discount-codes/discount-codes.service';
import { WalletsService } from '../wallets/wallets.service';
import { ZarinpalService } from '../payments/zarinpal.service';
import { ShippingService } from '../shipping/shipping.service';
import { InvoiceService } from './invoice.service';
import { OrderNotificationsService } from '../notifications/order-notifications.service';
import NotificationEventEnum from '../notifications/enums/notification-event.enum';
import { ConfigService } from '@nestjs/config';
import OrderStatusEnum from './enums/order-status.enum';
import PaymentMethodEnum from './enums/payment-method.enum';
import {
  CatalogCacheScope,
  CatalogCacheService,
} from '../common/cache/catalog-cache.service';
import { AuditService } from '../audit/audit.service';
import { ErrorCodes } from '../common/errors/error-codes';

const mockRepo = () => ({
  findOneBy: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  findBy: jest.fn(),
  create: jest.fn((data) => data),
  save: jest.fn((data) =>
    Promise.resolve(Array.isArray(data) ? data : { id: 1, ...data }),
  ),
  delete: jest.fn(),
  softDelete: jest.fn(),
  remove: jest.fn(),
  increment: jest.fn(),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  count: jest.fn().mockResolvedValue(0),
  createQueryBuilder: jest.fn(),
});

describe('OrdersService', () => {
  let service: OrdersService;
  let discountCodesService: {
    findValidByCode: jest.Mock;
    quoteForOrder: jest.Mock;
    computeAmount: jest.Mock;
    findWithScope: jest.Mock;
    consumeOne: jest.Mock;
    releaseOne: jest.Mock;
  };
  let walletsService: {
    findByUserId: jest.Mock;
    withdrawByUserId: jest.Mock;
    refund: jest.Mock;
  };
  let zarinpalService: {
    requestPayment: jest.Mock;
    verifyPayment: jest.Mock;
    buildPaymentUrl: jest.Mock;
  };
  let shippingService: { priceForOrder: jest.Mock };
  let invoiceService: { nextNumber: jest.Mock };
  let notifications: { notify: jest.Mock };
  let configService: { get: jest.Mock };
  let ordersQb: Record<string, jest.Mock>;

  let userRepo: ReturnType<typeof mockRepo>;
  let addressRepo: ReturnType<typeof mockRepo>;
  let productRepo: ReturnType<typeof mockRepo>;
  let variantRepo: ReturnType<typeof mockRepo>;
  let orderItemRepo: ReturnType<typeof mockRepo>;
  let basketRepo: ReturnType<typeof mockRepo>;
  let orderRepo: ReturnType<typeof mockRepo>;
  let catalogCache: { invalidate: jest.Mock };

  beforeEach(async () => {
    userRepo = mockRepo();
    addressRepo = mockRepo();
    productRepo = mockRepo();
    variantRepo = mockRepo();
    variantRepo.find.mockImplementation(() => Promise.resolve([variant()]));
    orderItemRepo = mockRepo();
    orderRepo = mockRepo();
    catalogCache = { invalidate: jest.fn() };
    ordersQb = {};
    for (const method of ['withDeleted', 'select', 'addSelect', 'where']) {
      ordersQb[method] = jest.fn(() => ordersQb);
    }
    ordersQb.getRawOne = jest.fn().mockResolvedValue(undefined);
    orderRepo.createQueryBuilder.mockImplementation(() => ordersQb);
    shippingService = { priceForOrder: jest.fn().mockResolvedValue(null) };
    invoiceService = {
      nextNumber: jest.fn().mockResolvedValue('INV-1404-000001'),
    };
    discountCodesService = {
      findValidByCode: jest.fn(),
      quoteForOrder: jest.fn(),
      computeAmount: jest.fn().mockReturnValue(0),
      findWithScope: jest.fn(),
      consumeOne: jest.fn(),
      releaseOne: jest.fn(),
    };
    notifications = { notify: jest.fn() };
    configService = { get: jest.fn(() => undefined) };
    zarinpalService = {
      requestPayment: jest.fn().mockResolvedValue({
        authority: 'A-100',
        paymentUrl: 'https://pay.example/A-100',
      }),
      verifyPayment: jest.fn(),
      buildPaymentUrl: jest.fn(
        (authority: string) => `https://pay.example/${authority}`,
      ),
    };

    basketRepo = mockRepo();

    const mockManager = {
      query: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn((entity) => {
        if (entity === BasketItem) return basketRepo;
        if (entity === User) return userRepo;
        if (entity === Address) return addressRepo;
        if (entity === Product) return productRepo;
        if (entity === ProductVariant) return variantRepo;
        if (entity === OrderItem) return orderItemRepo;
        if (entity === Order) return orderRepo;
        throw new Error(`No mock repo configured for ${entity}`);
      }),
    };

    const mockDataSource = {
      transaction: jest.fn((cb: any) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AuditService, useValue: { record: jest.fn() } },
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(OrderItem), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: getRepositoryToken(Address), useFactory: mockRepo },
        { provide: getRepositoryToken(Product), useFactory: mockRepo },
        { provide: getRepositoryToken(ProductVariant), useFactory: mockRepo },
        {
          provide: DiscountCodesService,
          useValue: discountCodesService,
        },
        {
          provide: WalletsService,
          useValue: {
            findByUserId: jest.fn(),
            withdrawByUserId: jest
              .fn()
              .mockResolvedValue({ wallet: { id: 1 }, transactionId: 55 }),
            refund: jest.fn(),
          },
        },
        { provide: ZarinpalService, useValue: zarinpalService },
        { provide: ShippingService, useValue: shippingService },
        { provide: InvoiceService, useValue: invoiceService },
        { provide: OrderNotificationsService, useValue: notifications },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: CatalogCacheService, useValue: catalogCache },
      ],
    }).compile();

    service = module.get(OrdersService);
    discountCodesService = module.get(DiscountCodesService);
    walletsService = module.get(WalletsService);

    orderRepo.findOne.mockResolvedValue({
      id: 1,
      status: OrderStatusEnum.Pending,
      total_price: 200,
      refunded_amount: 0,
      user: { id: 7, mobile: '09120000007' },
      items: [],
    });
  });

  afterEach(() => jest.clearAllMocks());

  const baseDto = {
    addressId: 1,
    items: [{ productId: 1, quantity: 2 }],
    payWithWallet: true,
  };
  const zarinpalDto = {
    addressId: 1,
    items: [{ productId: 1, quantity: 2 }],
    payWithZarinpal: true,
  };
  const product = {
    id: 1,
    title: 'Test Product',
    is_published: true,
    price: 100,
    stock: 5,
    effectivePrice: () => 100,
  };
  const variant = () => ({
    id: 11,
    title: 'Default',
    sku: 'test-product-default',
    stock: 5,
    is_active: true,
    product,
    effectivePrice: () => 100,
    weightGrams: () => 0,
  });
  const address = { id: 1, user: { id: 7 } };

  describe('create - stock', () => {
    it('decrements stock by the ordered quantity', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product }]);

      await service.create(7, baseDto, 'idem-key-0001');

      const savedVariants = variantRepo.save.mock.calls[0][0];
      expect(savedVariants[0].stock).toBe(3);
    });

    it('rejects when requested quantity exceeds stock, before saving anything', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product, stock: 1 }]);
      variantRepo.find.mockImplementation(() =>
        Promise.resolve([{ ...variant(), stock: 1 }]),
      );

      await expect(
        service.create(7, baseDto as any, 'idem-key-0001'),
      ).rejects.toMatchObject({ code: ErrorCodes.INSUFFICIENT_STOCK });
      expect(variantRepo.save).not.toHaveBeenCalled();
      expect(orderRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('create - the basket', () => {
    it('removes the ordered lines from the basket in the same transaction', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product }]);

      await service.create(7, baseDto, 'idem-key-0001');

      // A signed-in customer's basket lives on the server, so clearing it
      // client-side is not enough - the rows must go with the order.
      expect(basketRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          user: { id: 7 },
          product: { id: baseDto.items[0].productId },
        }),
      );
    });

    // baseDto sends no variantId (the product has one option), but the
    // basket line was stored with the variant it resolved to - matching on
    // "variant IS NULL" left it in the basket to be bought again.
    it('clears the basket line of the variant actually sold, even when none was sent', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product }]);

      await service.create(7, baseDto, 'idem-key-0101');

      expect(basketRepo.delete).toHaveBeenCalledWith({
        user: { id: 7 },
        product: { id: 1 },
        variant: { id: 11 },
      });
    });

    it('refuses a product the shop has unpublished, even by id', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product, is_published: false }]);

      await expect(
        service.create(7, baseDto, 'idem-key-0102'),
      ).rejects.toMatchObject({ code: ErrorCodes.VARIANT_NOT_FOR_SALE });
      expect(orderRepo.save).not.toHaveBeenCalled();
    });

    it('leaves the basket alone when the order could not be created', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product, stock: 1 }]);
      variantRepo.find.mockImplementation(() =>
        Promise.resolve([{ ...variant(), stock: 1 }]),
      );

      await expect(
        service.create(7, baseDto as any, 'idem-key-0001'),
      ).rejects.toMatchObject({ code: ErrorCodes.INSUFFICIENT_STOCK });
      expect(basketRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('create - address ownership', () => {
    it('rejects an address that belongs to a different user', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue({ id: 1, user: { id: 999 } });

      await expect(
        service.create(7, baseDto as any, 'idem-key-0001'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an address that does not exist', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(7, baseDto as any, 'idem-key-0001'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create - discount codes', () => {
    it('takes off exactly what the code quoted', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product }]);
      discountCodesService.quoteForOrder.mockResolvedValue({
        discount: { id: 1 },
        amount: 20,
      });

      await service.create(
        7,
        { ...baseDto, discountCode: 'SAVE10' },
        'idem-key-0001',
      );

      const savedOrder = orderRepo.save.mock.calls[0][0];
      expect(savedOrder.total_price).toBe(180);
      expect(discountCodesService.consumeOne).toHaveBeenCalled();
    });

    it('never consumes the discount code if stock validation fails first', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product, stock: 0 }]);
      variantRepo.find.mockImplementation(() =>
        Promise.resolve([{ ...variant(), stock: 0 }]),
      );

      await expect(
        service.create(
          7,
          { ...baseDto, discountCode: 'SAVE10' } as any,
          'idem-key-0001',
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.INSUFFICIENT_STOCK });
      expect(discountCodesService.findValidByCode).not.toHaveBeenCalled();
      expect(discountCodesService.consumeOne).not.toHaveBeenCalled();
    });
  });

  describe('create - pay with wallet', () => {
    it('rejects when the wallet balance is insufficient, and rolls the order back', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product }]);
      walletsService.withdrawByUserId.mockRejectedValue(
        new BadRequestException('Insufficient wallet balance'),
      );

      await expect(
        service.create(
          7,
          { ...baseDto, payWithWallet: true } as any,
          'idem-key-0001',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(catalogCache.invalidate).not.toHaveBeenCalled();
    });

    it('marks the order Paid and withdraws the balance on success', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product }]);
      walletsService.findByUserId.mockResolvedValue({ amount: 500 });

      await service.create(
        7,
        { ...baseDto, payWithWallet: true },
        'idem-key-0001',
      );

      const savedOrder = orderRepo.save.mock.calls[0][0];
      expect(savedOrder.status).toBe(OrderStatusEnum.Paid);
      expect(savedOrder.payed_time).toBeInstanceOf(Date);
      expect(walletsService.withdrawByUserId).toHaveBeenCalledWith(
        7,
        200,
        expect.anything(),
        'Order #1',
      );
    });
  });

  describe('stock and cache', () => {
    it('invalidates the product cache after a checkout took stock', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product }]);

      await service.create(7, baseDto, 'idem-key-0001');

      expect(catalogCache.invalidate).toHaveBeenCalledWith(
        CatalogCacheScope.Products,
      );
    });

    it('edits items on product rows locked in one ascending-id read, returning the old reservation first', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Pending,
        items: [{ quantity: 2, product: { id: 2 }, variant: { id: 12 } }],
      });
      const productA = {
        id: 1,
        title: 'A',
        is_published: true,
        price: 100,
        stock: 5,
        effectivePrice: () => 100,
      };
      const productB = {
        id: 2,
        title: 'B',
        is_published: true,
        price: 50,
        stock: 3,
        effectivePrice: () => 50,
      };
      productRepo.find.mockResolvedValue([productA, productB]);
      variantRepo.find.mockImplementation(() =>
        Promise.resolve([
          {
            id: 11,
            title: 'A-default',
            sku: 'a',
            stock: 5,
            is_active: true,
            product: productA,
            effectivePrice: () => 100,
            weightGrams: () => 0,
          },
          {
            id: 12,
            title: 'B-default',
            sku: 'b',
            stock: 3,
            is_active: true,
            product: productB,
            effectivePrice: () => 50,
            weightGrams: () => 0,
          },
        ]),
      );

      await service.update(1, {
        items: [
          { productId: 2, quantity: 4, variantId: 12 },
          { productId: 1, quantity: 1, variantId: 11 },
        ],
      });

      const lockQuery = productRepo.find.mock.calls[0][0];
      expect(lockQuery.lock).toEqual({ mode: 'pessimistic_write' });
      expect(lockQuery.withDeleted).toBe(true);
      const saved = variantRepo.save.mock.calls[0][0];
      expect(saved.find((v: any) => v.id === 12).stock).toBe(1);
      expect(saved.find((v: any) => v.id === 11).stock).toBe(4);
      expect(catalogCache.invalidate).toHaveBeenCalledWith(
        CatalogCacheScope.Products,
      );
    });

    it('refuses to put a soft-deleted product into an edited order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Pending,
        items: [],
      });
      productRepo.find.mockResolvedValue([
        {
          id: 1,
          title: 'Gone',
          is_published: true,
          price: 10,
          stock: 9,
          deleted_at: new Date(),
        },
      ]);

      await expect(
        service.update(1, { items: [{ productId: 1, quantity: 1 }] } as any),
      ).rejects.toThrow(BadRequestException);
      expect(productRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update - lifecycle restriction', () => {
    it('rejects modifying a non-Pending order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Paid,
        items: [],
      });

      await expect(
        service.update(1, { items: [{ productId: 1, quantity: 1 }] } as any),
      ).rejects.toMatchObject({ code: ErrorCodes.ORDER_NOT_EDITABLE });
      expect(productRepo.save).not.toHaveBeenCalled();
    });

    it('allows modifying a Pending order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Pending,
        items: [],
      });
      productRepo.find.mockResolvedValue([{ ...product }]);

      await service.update(1, {
        items: [{ productId: 1, quantity: 1 }],
      });

      expect(orderRepo.save).toHaveBeenCalled();
    });
  });

  describe('remove - lifecycle restriction', () => {
    it('rejects deleting a Paid order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Paid,
        items: [],
      });

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(orderRepo.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes a Pending order and restores its stock', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Pending,
        items: [
          {
            quantity: 2,
            product: { ...product, stock: 3 },
            variant: { id: 11 },
          },
        ],
      });

      await service.remove(1);

      expect(variantRepo.increment).toHaveBeenCalledWith(
        { id: 11 },
        'stock',
        2,
      );
      expect(productRepo.save).not.toHaveBeenCalled();
      expect(orderRepo.softDelete).toHaveBeenCalledWith({ id: 1 });
      expect(catalogCache.invalidate).toHaveBeenCalledWith(
        CatalogCacheScope.Products,
      );
    });

    it('soft-deletes an already-Cancelled order WITHOUT restoring stock again', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Cancelled,
        items: [
          {
            quantity: 2,
            product: { ...product, stock: 5 },
            variant: { id: 11 },
          },
        ],
      });

      await service.remove(1);

      expect(variantRepo.increment).not.toHaveBeenCalled();
      expect(catalogCache.invalidate).not.toHaveBeenCalled();
      expect(orderRepo.softDelete).toHaveBeenCalledWith({ id: 1 });
    });
  });

  describe('updateStatus - state machine', () => {
    it('rejects an invalid transition (Cancelled -> Paid)', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Cancelled,
        items: [],
      });

      await expect(
        service.updateStatus(1, { status: OrderStatusEnum.Paid }),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_STATUS_TRANSITION });
    });

    it('rejects skipping ahead (Sent -> Cancelled is not allowed once shipped)', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Sent,
        items: [],
      });

      await expect(
        service.updateStatus(1, { status: OrderStatusEnum.Cancelled }),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_STATUS_TRANSITION });
    });

    it('allows a valid transition (Pending -> Paid)', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Pending,
        items: [],
        payed_time: null,
      });

      const result = await service.updateStatus(1, {
        status: OrderStatusEnum.Paid,
      });

      expect(result.status).toBe(OrderStatusEnum.Paid);
      expect(result.payed_time).toBeInstanceOf(Date);
    });

    // Re-sending the current status is how a tracking code gets corrected.
    // It used to run the status's side effects again: a second "paid"
    // counted the sale twice.
    it('only updates the tracking code when the status does not change', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Paid,
        items: [{ quantity: 2, product: { id: 1 }, variant: { id: 11 } }],
        payed_time: new Date(),
        invoice_number: 'INV-1405-000001',
      });

      await service.updateStatus(1, {
        status: OrderStatusEnum.Paid,
        tracking_code: 'TRK-9',
      });

      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 1 },
        { tracking_code: 'TRK-9' },
      );
      expect(orderRepo.save).not.toHaveBeenCalled();
      expect(invoiceService.nextNumber).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('restores stock when cancelling a Paid (not-yet-shipped) order', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Paid,
        items: [
          {
            quantity: 3,
            product: { ...product, stock: 2 },
            variant: { id: 11 },
          },
        ],
      });

      await service.updateStatus(1, { status: OrderStatusEnum.Cancelled });

      expect(variantRepo.increment).toHaveBeenCalledWith(
        { id: 11 },
        'stock',
        3,
      );
      expect(catalogCache.invalidate).toHaveBeenCalledWith(
        CatalogCacheScope.Products,
      );
    });
  });

  // A customer's DELETE used to soft-delete their order - a cancelled and
  // refunded one included - and it was gone from the panel.
  describe('cancelByCustomer', () => {
    const actor = { userId: 7, label: '09120000002' };

    it('cancels an untouched order and keeps it on record', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Pending,
        items: [{ quantity: 1, product, variant: { id: 11 } }],
      });

      const result = await service.cancelByCustomer(1, actor);

      expect(result.status).toBe(OrderStatusEnum.Cancelled);
      expect(orderRepo.softDelete).not.toHaveBeenCalled();
      expect(variantRepo.increment).toHaveBeenCalledWith(
        { id: 11 },
        'stock',
        1,
      );
    });

    it('refuses an order the shop has already taken on', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Paid,
        total_price: 1000,
        refunded_amount: 0,
        user: { id: 7 },
        items: [],
      });

      await expect(service.cancelByCustomer(1, actor)).rejects.toMatchObject({
        code: ErrorCodes.ORDER_NOT_CANCELLABLE,
      });
      expect(orderRepo.save).not.toHaveBeenCalled();
      expect(walletsService.refund).not.toHaveBeenCalled();
    });

    it('treats a repeated request on a cancelled order as done', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Cancelled,
        items: [],
      });

      const result = await service.cancelByCustomer(1, actor);

      expect(result.status).toBe(OrderStatusEnum.Cancelled);
      expect(orderRepo.save).not.toHaveBeenCalled();
      expect(orderRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for a non-existent order', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          { provide: AuditService, useValue: { record: jest.fn() } },
          OrdersService,
          { provide: getRepositoryToken(Order), useFactory: mockRepo },
          { provide: getRepositoryToken(OrderItem), useFactory: mockRepo },
          { provide: getRepositoryToken(User), useFactory: mockRepo },
          { provide: getRepositoryToken(Address), useFactory: mockRepo },
          { provide: getRepositoryToken(Product), useFactory: mockRepo },
          { provide: getRepositoryToken(ProductVariant), useFactory: mockRepo },
          {
            provide: ShippingService,
            useValue: { priceForOrder: jest.fn().mockResolvedValue(null) },
          },
          {
            provide: InvoiceService,
            useValue: {
              nextNumber: jest.fn().mockResolvedValue('INV-1404-000001'),
            },
          },
          {
            provide: OrderNotificationsService,
            useValue: { notify: jest.fn() },
          },
          {
            provide: DiscountCodesService,
            useValue: { findValidByCode: jest.fn(), consumeOne: jest.fn() },
          },
          {
            provide: WalletsService,
            useValue: { findByUserId: jest.fn(), withdrawByUserId: jest.fn() },
          },
          {
            provide: ZarinpalService,
            useValue: { requestPayment: jest.fn(), verifyPayment: jest.fn() },
          },
          { provide: ConfigService, useValue: { get: jest.fn() } },
          { provide: DataSource, useValue: { transaction: jest.fn() } },
          { provide: CatalogCacheService, useValue: { invalidate: jest.fn() } },
        ],
      }).compile();
      const freshService = module.get(OrdersService);
      const ordersRepository = module.get(getRepositoryToken(Order));
      ordersRepository.findOne.mockResolvedValue(null);

      await expect(freshService.findOne(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
  describe('create - payment method', () => {
    it('rejects an order with no payment method at all', async () => {
      await expect(
        service.create(
          7,
          { addressId: 1, items: [{ productId: 1, quantity: 1 }] } as any,
          'idem-key-0001',
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.PAYMENT_METHOD_REQUIRED });
      expect(orderRepo.save).not.toHaveBeenCalled();
    });

    it('rejects an order that asks for both payment methods', async () => {
      await expect(
        service.create(
          7,
          { ...baseDto, payWithZarinpal: true } as any,
          'idem-key-0001',
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.PAYMENT_METHOD_REQUIRED });
    });

    it('records how a wallet order was paid', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product }]);

      await service.create(7, baseDto, 'idem-key-0001');

      const savedOrder = orderRepo.save.mock.calls[0][0];
      expect(savedOrder.payment_method).toBe(PaymentMethodEnum.Wallet);
      expect(savedOrder.status).toBe(OrderStatusEnum.Paid);
      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 1 },
        { payment_reference: 'wallet-tx:55' },
      );
    });

    it('opens an expiring payment session for a ZarinPal order', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product }]);

      const result = await service.create(7, zarinpalDto, 'idem-key-0002');

      const savedOrder = orderRepo.save.mock.calls[0][0];
      expect(savedOrder.status).toBe(OrderStatusEnum.AwaitingPayment);
      expect(savedOrder.payment_expires_at).toBeInstanceOf(Date);
      expect(result.paymentUrl).toBe('https://pay.example/A-100');
      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 1 },
        { zarinpalAuthority: 'A-100' },
      );
    });
  });

  describe('create - idempotency', () => {
    it('returns the original order instead of creating a second one', async () => {
      ordersQb.getRawOne.mockResolvedValue({
        id: 1,
        fingerprint: null,
        status: OrderStatusEnum.AwaitingPayment,
        authority: 'A-100',
        deletedAt: null,
      });

      const result = await service.create(7, zarinpalDto, 'idem-key-0003');

      expect(orderRepo.save).not.toHaveBeenCalled();
      expect(productRepo.save).not.toHaveBeenCalled();
      expect(result.paymentUrl).toBe('https://pay.example/A-100');
    });

    it('refuses a key that was used for a different basket', async () => {
      ordersQb.getRawOne.mockResolvedValue({
        id: 1,
        fingerprint: 'a-different-fingerprint',
        status: OrderStatusEnum.AwaitingPayment,
        authority: 'A-100',
        deletedAt: null,
      });

      await expect(
        service.create(7, zarinpalDto as any, 'idem-key-0003'),
      ).rejects.toThrow(ConflictException);
    });

    it('caps how many unpaid payment sessions one user can hold', async () => {
      orderRepo.count.mockResolvedValue(3);

      await expect(
        service.create(7, zarinpalDto as any, 'idem-key-0004'),
      ).rejects.toThrow(ConflictException);
      expect(orderRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('create - discount reservation', () => {
    it('takes a use of the code up front, even for a ZarinPal order', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product }]);
      discountCodesService.quoteForOrder.mockResolvedValue({
        discount: { id: 3 },
        amount: 20,
      });

      await service.create(
        7,
        { ...zarinpalDto, discountCode: 'SAVE10' },
        'idem-key-0005',
      );

      expect(discountCodesService.consumeOne).toHaveBeenCalled();
      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 1 },
        { discount_reserved: true },
      );
    });
  });

  describe('create - gateway failure', () => {
    it('undoes the order instead of leaving stock reserved forever', async () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue(address);
      productRepo.find.mockResolvedValue([{ ...product }]);
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.AwaitingPayment,
        total_price: 200,
        refunded_amount: 0,
        user: { id: 7, mobile: '09120000007' },
        items: [{ quantity: 2, product: { id: 1 }, variant: { id: 11 } }],
        discount: { id: 3 },
        discount_reserved: true,
      });
      zarinpalService.requestPayment.mockRejectedValue(
        new Error('gateway down'),
      );

      await expect(
        service.create(7, zarinpalDto as any, 'idem-key-0006'),
      ).rejects.toMatchObject({
        status: 503,
        code: ErrorCodes.PAYMENT_GATEWAY_UNAVAILABLE,
      });

      expect(variantRepo.increment).toHaveBeenCalledWith(
        { id: 11 },
        'stock',
        2,
      );
      expect(discountCodesService.releaseOne).toHaveBeenCalledWith(
        3,
        expect.anything(),
      );
      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 1 },
        expect.objectContaining({ status: OrderStatusEnum.Cancelled }),
      );
    });
  });

  describe('update - immutable once a payment session exists', () => {
    it('refuses to edit an order that already has an Authority', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Pending,
        zarinpalAuthority: 'A-100',
        user: { id: 7 },
        items: [],
      });

      await expect(
        service.update(1, { items: [{ productId: 1, quantity: 1 }] } as any),
      ).rejects.toMatchObject({ code: ErrorCodes.ORDER_NOT_EDITABLE });
      expect(productRepo.save).not.toHaveBeenCalled();
    });

    it('re-prices the discount after the items change', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Pending,
        user: { id: 7 },
        items: [],
        discount: { id: 3 },
      });
      productRepo.find.mockResolvedValue([
        { id: 1, title: 'A', is_published: true, price: 100, stock: 9 },
      ]);
      discountCodesService.findWithScope.mockResolvedValue({ id: 3 });
      discountCodesService.computeAmount.mockReturnValue(20);

      await service.update(1, {
        items: [{ productId: 1, quantity: 2 }],
      });

      const saved = orderRepo.save.mock.calls[0][0];
      expect(saved.total_price).toBe(180);
    });
  });

  describe('remove - open payment session', () => {
    it('refuses to delete an order whose payment page is still live', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Pending,
        zarinpalAuthority: 'A-100',
        user: { id: 7 },
        items: [],
      });

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(orderRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus - refund on cancel', () => {
    it('gives the money back to the wallet when a paid order is cancelled', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Paid,
        total_price: 500,
        refunded_amount: 0,
        user: { id: 7 },
        items: [{ quantity: 1, product: { id: 1 }, variant: { id: 11 } }],
        discount: { id: 3 },
        discount_reserved: true,
      });

      await service.updateStatus(1, {
        status: OrderStatusEnum.Cancelled,
      });

      expect(walletsService.refund).toHaveBeenCalledWith(
        7,
        500,
        expect.stringContaining('Refund'),
        expect.anything(),
      );
      expect(orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ refunded_amount: 500 }),
      );
      expect(discountCodesService.releaseOne).toHaveBeenCalledWith(
        3,
        expect.anything(),
      );
      expect(variantRepo.increment).toHaveBeenCalledWith(
        { id: 11 },
        'stock',
        1,
      );
    });

    it('does not refund twice', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Paid,
        total_price: 500,
        refunded_amount: 500,
        user: { id: 7 },
        items: [],
      });

      await service.updateStatus(1, {
        status: OrderStatusEnum.Cancelled,
      });

      expect(walletsService.refund).not.toHaveBeenCalled();
    });
  });

  describe('finalizePaidOrder', () => {
    it('marks an awaiting-payment order paid, with its payment reference', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.AwaitingPayment,
        total_price: 200,
        refunded_amount: 0,
        user: { id: 7 },
        items: [],
        discount_reserved: true,
      });

      const outcome = await service.finalizePaidOrder(1, 'zarinpal:9988');

      expect(outcome).toBe('paid');
      expect(orderRepo.update).toHaveBeenCalledWith(
        { id: 1 },
        expect.objectContaining({
          status: OrderStatusEnum.Paid,
          payment_reference: 'zarinpal:9988',
        }),
      );
    });

    it('is a no-op when the order is already paid (replayed callback)', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Paid,
      });

      const outcome = await service.finalizePaidOrder(1, 'zarinpal:9988');

      expect(outcome).toBe('already_paid');
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    // A customer can reopen the gateway's callback URL from their history
    // at any time, and ZarinPal answers a repeat verify with 101 ("verified
    // before"). Once the shop has started on the order it is no longer
    // `paid` - but it is still a paid order, not a closed one, and treating
    // it as a late payment handed the whole amount back to the wallet.
    it.each([
      OrderStatusEnum.Processing,
      OrderStatusEnum.Sent,
      OrderStatusEnum.Delivered,
    ])(
      'never refunds a replayed callback for an order that is already %s',
      async (status) => {
        orderRepo.findOne.mockResolvedValue({
          id: 1,
          status,
          total_price: 200,
          refunded_amount: 0,
          user: { id: 7 },
          items: [],
        });

        const outcome = await service.finalizePaidOrder(1, 'zarinpal:9988');

        expect(outcome).toBe('already_paid');
        expect(walletsService.refund).not.toHaveBeenCalled();
        expect(orderRepo.update).not.toHaveBeenCalled();
      },
    );

    it('refunds to the wallet when the money lands after the order closed', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Cancelled,
        total_price: 200,
        refunded_amount: 0,
        user: { id: 7 },
        items: [],
      });

      const outcome = await service.finalizePaidOrder(1, 'zarinpal:9988');

      expect(outcome).toBe('refunded');
      expect(walletsService.refund).toHaveBeenCalledWith(
        7,
        200,
        expect.stringContaining('after it was closed'),
        expect.anything(),
      );
    });

    it('does not refund again for an order that was already refunded when cancelled', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Cancelled,
        total_price: 200,
        refunded_amount: 200,
        user: { id: 7 },
        items: [],
      });

      const outcome = await service.finalizePaidOrder(1, 'zarinpal:9988');

      expect(outcome).toBe('refunded');
      expect(walletsService.refund).not.toHaveBeenCalled();
    });

    it('takes the discount use for a legacy order that never reserved one', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.AwaitingPayment,
        total_price: 200,
        refunded_amount: 0,
        user: { id: 7 },
        items: [],
        discount: { id: 3, off_percent: 10 },
        discount_reserved: false,
      });

      await service.finalizePaidOrder(1, 'zarinpal:9988');

      expect(discountCodesService.consumeOne).toHaveBeenCalled();
    });
  });

  describe('create - the bill (shipping + tax, in Toman)', () => {
    const setUpCheckout = () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue({
        id: 1,
        province: 'تهران',
        user: { id: 7 },
      });
      productRepo.find.mockResolvedValue([{ ...product }]);
    };

    it('itemises goods, shipping and tax, and charges their sum', async () => {
      setUpCheckout();
      shippingService.priceForOrder.mockResolvedValue({
        methodId: 3,
        title: 'پست پیشتاز',
        cost: 50_000,
        estimatedDaysMin: 2,
        estimatedDaysMax: 4,
      });
      configService.get.mockImplementation((key: string) =>
        key === 'TAX_RATE_PERCENT' ? '10' : undefined,
      );

      await service.create(7, baseDto, 'idem-key-bill');

      const saved = orderRepo.save.mock.calls[0][0];
      expect(saved.items_total).toBe(200);
      expect(saved.discount_amount).toBe(0);
      expect(saved.shipping_cost).toBe(50_000);
      expect(saved.tax_amount).toBe(20);
      expect(saved.total_price).toBe(200 + 50_000 + 20);
      expect(saved.shipping_method_title).toBe('پست پیشتاز');
    });

    it('taxes the goods after the discount, and never the shipping', async () => {
      setUpCheckout();
      discountCodesService.quoteForOrder.mockResolvedValue({
        discount: { id: 3 },
        amount: 100,
      });
      shippingService.priceForOrder.mockResolvedValue({
        methodId: 3,
        title: 'پیک',
        cost: 30_000,
        estimatedDaysMin: 1,
        estimatedDaysMax: 1,
      });
      configService.get.mockImplementation((key: string) =>
        key === 'TAX_RATE_PERCENT' ? '10' : undefined,
      );

      await service.create(
        7,
        { ...baseDto, discountCode: 'HALF' },
        'idem-key-bill-2',
      );

      const saved = orderRepo.save.mock.calls[0][0];
      expect(saved.discount_amount).toBe(100);
      expect(saved.tax_amount).toBe(10);
      expect(saved.total_price).toBe(100 + 30_000 + 10);
    });

    it('charges no shipping line when the shop has none configured', async () => {
      setUpCheckout();

      await service.create(7, baseDto, 'idem-key-bill-3');

      const saved = orderRepo.save.mock.calls[0][0];
      expect(saved.shipping_cost).toBe(0);
      expect(saved.shipping_method_title).toBeUndefined();
      expect(saved.total_price).toBe(200);
    });
  });

  describe('create - cash on delivery', () => {
    const setUpCheckout = () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue({
        id: 1,
        province: 'تهران',
        user: { id: 7 },
      });
      productRepo.find.mockResolvedValue([{ ...product }]);
    };
    const codDto = {
      addressId: 1,
      items: [{ productId: 1, quantity: 2 }],
      payOnDelivery: true,
    };

    it('is a confirmed, unpaid sale: reserved, invoiced, waiting for the courier', async () => {
      setUpCheckout();
      shippingService.priceForOrder.mockResolvedValue({
        methodId: 3,
        title: 'پست پیشتاز',
        cost: 40_000,
        cashOnDeliveryFee: 15_000,
        supportsCashOnDelivery: true,
        estimatedDaysMin: 2,
        estimatedDaysMax: 4,
      });

      await service.create(7, codDto, 'idem-key-cod');

      const saved = orderRepo.save.mock.calls[0][0];
      expect(saved.payment_method).toBe(PaymentMethodEnum.CashOnDelivery);
      expect(saved.status).toBe(OrderStatusEnum.Pending);
      expect(saved.payment_expires_at).toBeUndefined();
      expect(saved.cod_fee).toBe(15_000);
      expect(saved.total_price).toBe(200 + 40_000 + 15_000);
      expect(saved.invoice_number).toBe('INV-1404-000001');
    });

    it('refuses a carrier that does not collect money at the door', async () => {
      setUpCheckout();
      shippingService.priceForOrder.mockResolvedValue({
        methodId: 3,
        title: 'پست عادی',
        cost: 20_000,
        cashOnDeliveryFee: 0,
        supportsCashOnDelivery: false,
        estimatedDaysMin: 5,
        estimatedDaysMax: 9,
      });

      await expect(
        service.create(7, codDto as any, 'idem-key-cod-2'),
      ).rejects.toMatchObject({ code: ErrorCodes.COD_NOT_SUPPORTED });
      expect(orderRepo.save).not.toHaveBeenCalled();
    });

    it('refuses more cash than a courier should carry', async () => {
      setUpCheckout();
      productRepo.find.mockResolvedValue([{ ...product, price: 30_000_000 }]);
      variantRepo.find.mockImplementation(() =>
        Promise.resolve([{ ...variant(), effectivePrice: () => 30_000_000 }]),
      );
      shippingService.priceForOrder.mockResolvedValue({
        methodId: 3,
        title: 'پست پیشتاز',
        cost: 0,
        cashOnDeliveryFee: 0,
        supportsCashOnDelivery: true,
        estimatedDaysMin: 2,
        estimatedDaysMax: 4,
      });
      configService.get.mockImplementation((k: string) =>
        k === 'COD_MAX_AMOUNT' ? '20000000' : undefined,
      );

      await expect(
        service.create(7, codDto as any, 'idem-key-cod-3'),
      ).rejects.toMatchObject({ code: ErrorCodes.COD_LIMIT_EXCEEDED });
    });

    it('still refuses two payment methods at once', async () => {
      await expect(
        service.create(
          7,
          { ...codDto, payWithWallet: true } as any,
          'idem-key-cod-4',
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.PAYMENT_METHOD_REQUIRED });
    });
  });

  describe('telling the customer what happened', () => {
    const setUpCheckout = () => {
      userRepo.findOneBy.mockResolvedValue({ id: 7 });
      addressRepo.findOne.mockResolvedValue({
        id: 1,
        province: 'تهران',
        user: { id: 7 },
      });
      productRepo.find.mockResolvedValue([{ ...product }]);
    };

    it('a wallet order is confirmed as paid', async () => {
      setUpCheckout();

      await service.create(7, baseDto, 'idem-key-sms-1');

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.anything(),
        NotificationEventEnum.OrderPaid,
      );
    });

    it('a cash-on-delivery order is confirmed as placed, not paid', async () => {
      setUpCheckout();
      shippingService.priceForOrder.mockResolvedValue({
        methodId: 3,
        title: 'پست پیشتاز',
        cost: 0,
        cashOnDeliveryFee: 0,
        supportsCashOnDelivery: true,
        estimatedDaysMin: 2,
        estimatedDaysMax: 4,
      });

      await service.create(
        7,
        {
          addressId: 1,
          items: [{ productId: 1, quantity: 1 }],
          payOnDelivery: true,
        },
        'idem-key-sms-2',
      );

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.anything(),
        NotificationEventEnum.OrderPlaced,
      );
    });

    it('shipping an order tells the customer it is on its way', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.Processing,
        total_price: 500,
        refunded_amount: 0,
        user: { id: 7 },
        items: [],
      });

      await service.updateStatus(1, { status: OrderStatusEnum.Sent });

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.anything(),
        NotificationEventEnum.OrderSent,
      );
    });

    it('an expired, never-confirmed payment session says nothing', async () => {
      orderRepo.findOne.mockResolvedValue({
        id: 1,
        status: OrderStatusEnum.AwaitingPayment,
        total_price: 500,
        refunded_amount: 0,
        user: { id: 7 },
        items: [],
      });

      await service.cancelUnpaidOrder(1, 'expired');

      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });
});
