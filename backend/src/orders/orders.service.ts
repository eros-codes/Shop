import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import {
  DataSource,
  EntityManager,
  FindOptionsSelect,
  FindOptionsWhere,
  In,
  IsNull,
  Repository,
} from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { FilterOrderDto } from './dto/filter-order.dto';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { User } from '../users/entities/user.entity';
import { Address } from '../address/entities/address.entity';
import { Product } from '../products/entities/product.entity';
import { BasketItem } from '../users/entities/basket-item.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import {
  DiscountCodesService,
  DiscountLine,
} from '../discount-codes/discount-codes.service';
import { DiscountCode } from '../discount-codes/entities/discount-code.entity';
import { WalletsService } from '../wallets/wallets.service';
import { ZarinpalService } from '../payments/zarinpal.service';
import { ShippingOption, ShippingService } from '../shipping/shipping.service';
import { ShippingMethod } from '../shipping/entities/shipping-method.entity';
import { InvoiceService } from './invoice.service';
import { OrderNotificationsService } from '../notifications/order-notifications.service';
import NotificationEventEnum from '../notifications/enums/notification-event.enum';
import { AuditActor, AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import OrderStatusEnum from './enums/order-status.enum';
import PaymentMethodEnum from './enums/payment-method.enum';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import {
  restoreStock,
  syncProductStock,
  toStockLines,
} from '../products/utils/product-stock';
import {
  CatalogCacheScope,
  CatalogCacheService,
} from '../common/cache/catalog-cache.service';
import { isDuplicateEntryError } from '../common/database/mysql-errors';
import {
  DEFAULT_PAYMENT_WINDOW_MINUTES,
  MAX_MONEY_AMOUNT,
  MAX_OPEN_PAYMENT_SESSIONS_PER_USER,
} from '../common/constants/money';
import { AppError } from '../common/errors/app-error';
import { ErrorCodes } from '../common/errors/error-codes';

const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatusEnum, OrderStatusEnum[]> = {
  [OrderStatusEnum.Pending]: [OrderStatusEnum.Paid, OrderStatusEnum.Cancelled],
  [OrderStatusEnum.AwaitingPayment]: [
    OrderStatusEnum.Paid,
    OrderStatusEnum.Cancelled,
  ],
  [OrderStatusEnum.Paid]: [
    OrderStatusEnum.Processing,
    OrderStatusEnum.Cancelled,
  ],
  [OrderStatusEnum.Processing]: [
    OrderStatusEnum.Sent,
    OrderStatusEnum.Cancelled,
  ],
  [OrderStatusEnum.Sent]: [OrderStatusEnum.Delivered],
  [OrderStatusEnum.Delivered]: [],
  [OrderStatusEnum.Cancelled]: [],
};

const CANCELLABLE_WITH_STOCK_RESTORE = [
  OrderStatusEnum.Pending,
  OrderStatusEnum.AwaitingPayment,
  OrderStatusEnum.Paid,
  OrderStatusEnum.Processing,
];

const REFUNDABLE_ON_CANCEL = [OrderStatusEnum.Paid, OrderStatusEnum.Processing];

const DEFAULT_COD_MAX_AMOUNT = 20_000_000;

// An order in one of these has been paid for, so cancelling it has to
// take its units back out of the sales counter.
const SOLD_STATUSES: OrderStatusEnum[] = [
  OrderStatusEnum.Paid,
  OrderStatusEnum.Processing,
  OrderStatusEnum.Sent,
  OrderStatusEnum.Delivered,
];

const UNPAID_STATUSES = [
  OrderStatusEnum.Pending,
  OrderStatusEnum.AwaitingPayment,
];

const ORDER_SELECT: FindOptionsSelect<Order> = {
  id: true,
  status: true,
  payed_time: true,
  delivered_at: true,
  payment_method: true,
  payment_reference: true,
  payment_expires_at: true,
  shippingAddressSnapshot: true,
  items_total: true,
  discount_amount: true,
  shipping_cost: true,
  tax_amount: true,
  cod_fee: true,
  invoice_number: true,
  total_price: true,
  total_quantity: true,
  shipping_method_title: true,
  shipping_eta_days_min: true,
  shipping_eta_days_max: true,
  refunded_amount: true,
  tracking_code: true,
  idempotency_key: true,
  createdAt: true,
  updatedAt: true,
  user: { id: true, display_name: true, mobile: true },
  discount: { id: true, code: true, off_percent: true },
  items: {
    id: true,
    price: true,
    quantity: true,
    variant_title: true,
    variant_sku: true,
    product: { id: true, title: true, slug: true },
  },
};

const ORDER_RELATIONS = {
  user: true,
  discount: true,
  items: { product: true },
} as const;

export interface CreateOrderResult {
  order: Order;
  paymentUrl?: string;
}

export type PaymentOutcome = 'paid' | 'already_paid' | 'refunded';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepository: Repository<OrderItem>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Address)
    private readonly addressesRepository: Repository<Address>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly discountCodesService: DiscountCodesService,
    private readonly walletsService: WalletsService,
    private readonly zarinpalService: ZarinpalService,
    private readonly shippingService: ShippingService,
    private readonly invoiceService: InvoiceService,
    private readonly notifications: OrderNotificationsService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly catalogCache: CatalogCacheService,
  ) {}

  private get paymentWindowMs(): number {
    const minutes =
      Number(this.configService.get<string>('PAYMENT_WINDOW_MINUTES')) ||
      DEFAULT_PAYMENT_WINDOW_MINUTES;
    return minutes * 60 * 1000;
  }

  private calculateOrderTotals(
    items: Array<{ price: number; quantity: number }>,
  ) {
    const total_price = items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );
    const total_quantity = items.reduce((sum, item) => sum + item.quantity, 0);

    return { total_price, total_quantity };
  }

  private async priceOrder(params: {
    lines: Array<{ price: number; quantity: number }>;
    discountAmount?: number;
    province: string;
    weightGrams: number;
    shippingMethodId?: number;
    cashOnDelivery?: boolean;
  }): Promise<{
    items_total: number;
    discount_amount: number;
    shipping_cost: number;
    tax_amount: number;
    cod_fee: number;
    total_price: number;
    total_quantity: number;
    shipping: ShippingOption | null;
  }> {
    const { total_price: items_total, total_quantity } =
      this.calculateOrderTotals(params.lines);
    const discount_amount = Math.min(params.discountAmount ?? 0, items_total);
    const discountedGoods = items_total - discount_amount;

    const shipping = await this.shippingService.priceForOrder({
      province: params.province,
      weightGrams: params.weightGrams,
      goodsTotal: discountedGoods,
      methodId: params.shippingMethodId,
    });
    const shipping_cost = shipping?.cost ?? 0;

    let cod_fee = 0;
    if (params.cashOnDelivery) {
      if (!shipping) {
        throw new BadRequestException(
          'Cash on delivery needs a shipping method that supports it',
        );
      }
      if (!shipping.supportsCashOnDelivery) {
        throw AppError.badRequest(
          ErrorCodes.COD_NOT_SUPPORTED,
          `${shipping.title} does not collect payment at the door - choose another method or pay online`,
          { methodId: shipping.methodId },
        );
      }
      cod_fee = shipping.cashOnDeliveryFee ?? 0;
    }

    const taxRate = Number(
      this.configService.get<string>('TAX_RATE_PERCENT') ?? 0,
    );
    const tax_amount =
      taxRate > 0 ? Math.round((discountedGoods * taxRate) / 100) : 0;

    const total_price = discountedGoods + shipping_cost + tax_amount + cod_fee;
    if (total_price > MAX_MONEY_AMOUNT) {
      throw AppError.badRequest(
        ErrorCodes.AMOUNT_TOO_LARGE,
        'This order total is larger than the allowed maximum',
      );
    }
    if (params.cashOnDelivery) {
      const limit = Number(
        this.configService.get<string>('COD_MAX_AMOUNT') ??
          DEFAULT_COD_MAX_AMOUNT,
      );
      if (total_price > limit) {
        throw AppError.badRequest(
          ErrorCodes.COD_LIMIT_EXCEEDED,
          `Cash on delivery is only available up to ${limit.toLocaleString('en-US')} Toman - please pay online for this order`,
          { limit, total: total_price },
        );
      }
    }

    return {
      items_total,
      discount_amount,
      shipping_cost,
      tax_amount,
      cod_fee,
      total_price,
      total_quantity,
      shipping,
    };
  }

  private applyDiscount(total: number, discount?: DiscountCode | null): number {
    if (!discount) return total;
    return Math.round(total - (total * discount.off_percent) / 100);
  }

  private fingerprintOf(dto: CreateOrderDto): string {
    const canonical = JSON.stringify({
      addressId: dto.addressId,
      discountCode: dto.discountCode ?? null,
      payWithWallet: !!dto.payWithWallet,
      payWithZarinpal: !!dto.payWithZarinpal,
      items: [...dto.items]
        .map((item) => [item.productId, item.quantity])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  async create(
    userId: number,
    createOrderDto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<CreateOrderResult> {
    const {
      addressId,
      items,
      discountCode,
      payWithWallet,
      payWithZarinpal,
      payOnDelivery,
      shippingMethodId,
    } = createOrderDto;

    const chosen = [payWithWallet, payWithZarinpal, payOnDelivery].filter(
      Boolean,
    );
    if (chosen.length !== 1) {
      throw AppError.badRequest(
        ErrorCodes.PAYMENT_METHOD_REQUIRED,
        'Choose exactly one payment method: payWithWallet, payWithZarinpal or payOnDelivery',
      );
    }
    const paymentMethod = payWithWallet
      ? PaymentMethodEnum.Wallet
      : payWithZarinpal
        ? PaymentMethodEnum.Zarinpal
        : PaymentMethodEnum.CashOnDelivery;
    const fingerprint = this.fingerprintOf(createOrderDto);

    // A retried request returns the order it already created. Without this,
    // a dropped connection costs the customer a second order.
    const replay = await this.findByIdempotencyKey(userId, idempotencyKey);
    if (replay) {
      return this.replayExistingOrder(replay, fingerprint);
    }

    if (paymentMethod === PaymentMethodEnum.Zarinpal) {
      await this.assertOpenSessionLimit(userId);
    }

    let createdOrderId: number;
    try {
      createdOrderId = await this.dataSource.transaction(async (manager) => {
        const usersRepo = manager.getRepository(User);
        const addressesRepo = manager.getRepository(Address);
        const productsRepo = manager.getRepository(Product);
        const orderItemsRepo = manager.getRepository(OrderItem);
        const ordersRepo = manager.getRepository(Order);

        const user = await usersRepo.findOneBy({ id: userId });
        if (!user) {
          throw new NotFoundException(`User with id ${userId} not found`);
        }

        const address = await addressesRepo.findOne({
          where: { id: addressId },
          relations: { user: true },
        });
        if (!address) {
          throw new NotFoundException(`Address with id ${addressId} not found`);
        }
        if (address.user.id !== userId) {
          throw new BadRequestException('This address does not belong to you');
        }

        const productIds = items.map((item) => item.productId);
        // SELECT ... FOR UPDATE: a second checkout touching these products waits
        // for this transaction, which closes the race where two orders both read
        // the last unit and both succeed. Lock order everywhere is
        // categories -> product -> variant -> user, so two checkouts cannot
        // deadlock against each other.
        const products = await productsRepo.find({
          where: { id: In(productIds) },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });

        if (products.length !== new Set(productIds).size) {
          throw new BadRequestException('One or more product IDs are invalid');
        }

        // Stock and price live on the variant. A product with a single option
        // needs no choice from the client; one with several refuses to guess.
        const resolved = await this.resolveVariants(manager, items, products);

        const orderItems = items.map((item, index) => {
          const { product, variant } = resolved[index];
          if (variant.stock < item.quantity) {
            throw AppError.badRequest(
              ErrorCodes.INSUFFICIENT_STOCK,
              `${product.title} (${variant.title}) does not have enough stock`,
              {
                productId: product.id,
                variantId: variant.id,
                // The titles travel with the error so a client can name the
                // offending line. In a multi-line basket "out of stock" on
                // its own leaves the customer guessing which item to remove.
                productTitle: product.title,
                variantTitle: variant.title,
                available: variant.stock,
                requested: item.quantity,
              },
            );
          }

          variant.stock -= item.quantity;

          return orderItemsRepo.create({
            product,
            variant,
            // Snapshotted like the shipping address: renaming an option next year
            // must not rewrite what this customer was sold.
            variant_title: variant.title,
            variant_sku: variant.sku,
            price: variant.effectivePrice(product),
            quantity: item.quantity,
          });
        });

        await manager
          .getRepository(ProductVariant)
          .save(resolved.map((entry) => entry.variant));
        await syncProductStock(
          manager,
          products.map((product) => product.id),
        );

        let discount: DiscountCode | undefined;
        let discountAmount = 0;
        if (discountCode) {
          const quote = await this.discountCodesService.quoteForOrder({
            code: discountCode,
            userId,
            lines: await this.toDiscountLines(manager, items, orderItems),
            manager,
          });
          discount = quote.discount;
          discountAmount = quote.amount;
        }

        const weightGrams = resolved.reduce(
          (total, entry, index) =>
            total +
            entry.variant.weightGrams(entry.product) * items[index].quantity,
          0,
        );
        const totals = await this.priceOrder({
          lines: orderItems.map((item) => ({
            price: item.price,
            quantity: item.quantity,
          })),
          discountAmount,
          province: address.province,
          weightGrams,
          shippingMethodId,
          cashOnDelivery: paymentMethod === PaymentMethodEnum.CashOnDelivery,
        });
        const finalPrice = totals.total_price;

        const isWallet = paymentMethod === PaymentMethodEnum.Wallet;
        const isCashOnDelivery =
          paymentMethod === PaymentMethodEnum.CashOnDelivery;
        const invoiceNumber =
          isWallet || isCashOnDelivery
            ? await this.invoiceService.nextNumber(manager)
            : null;
        const order = ordersRepo.create({
          user,
          address,
          shippingAddressSnapshot: {
            province: address.province,
            city: address.city,
            address: address.address,
            postal_code: address.postal_code,
            receiver_mobile: address.receiver_mobile,
            description: address.description,
          },
          items: orderItems,
          items_total: totals.items_total,
          discount_amount: totals.discount_amount,
          shipping_cost: totals.shipping_cost,
          tax_amount: totals.tax_amount,
          cod_fee: totals.cod_fee,
          ...(invoiceNumber ? { invoice_number: invoiceNumber } : {}),
          total_price: finalPrice,
          total_quantity: totals.total_quantity,
          ...(totals.shipping
            ? {
                shipping_method: {
                  id: totals.shipping.methodId,
                } as ShippingMethod,
                shipping_method_title: totals.shipping.title,
                shipping_eta_days_min: totals.shipping.estimatedDaysMin,
                shipping_eta_days_max: totals.shipping.estimatedDaysMax,
              }
            : {}),
          payment_method: paymentMethod,
          idempotency_key: idempotencyKey,
          idempotency_fingerprint: fingerprint,
          ...(discount ? { discount } : {}),
          ...(isWallet
            ? { status: OrderStatusEnum.Paid, payed_time: new Date() }
            : isCashOnDelivery
              ? { status: OrderStatusEnum.Pending }
              : {
                  status: OrderStatusEnum.AwaitingPayment,
                  payment_expires_at: new Date(
                    Date.now() + this.paymentWindowMs,
                  ),
                }),
        });

        const savedOrder = await ordersRepo.save(order);
        if (isWallet) {
          await this.countSales(manager, savedOrder.id, 1);
        }

        if (discount) {
          await this.discountCodesService.consumeOne(discount, manager);
          await ordersRepo.update(
            { id: savedOrder.id },
            { discount_reserved: true },
          );
        }

        if (isWallet) {
          const { transactionId } = await this.walletsService.withdrawByUserId(
            userId,
            finalPrice,
            manager,
            `Order #${savedOrder.id}`,
          );
          await ordersRepo.update(
            { id: savedOrder.id },
            { payment_reference: `wallet-tx:${transactionId}` },
          );
        }

        // Whatever was just ordered leaves the basket in the same
        // transaction that reserved its stock. The client clearing its own
        // local copy is not enough: a signed-in customer's basket lives on
        // the server, so without this the items reappear on the next reload
        // and can be bought twice.
        const basketRepo = manager.getRepository(BasketItem);
        for (const item of createOrderDto.items) {
          const where: Record<string, unknown> = {
            user: { id: userId },
            product: { id: item.productId },
          };
          where.variant = item.variantId ? { id: item.variantId } : IsNull();
          await basketRepo.delete(where);
        }

        return savedOrder.id;
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        const existing = await this.findByIdempotencyKey(
          userId,
          idempotencyKey,
        );
        if (existing) {
          return this.replayExistingOrder(existing, fingerprint);
        }
        throw new ConflictException(
          'A checkout with this Idempotency-Key is already being processed',
        );
      }
      throw error;
    }

    await this.catalogCache.invalidate(CatalogCacheScope.Products);

    if (paymentMethod !== PaymentMethodEnum.Zarinpal) {
      const order = await this.findOne(createdOrderId);
      await this.notifications.notify(
        order,
        paymentMethod === PaymentMethodEnum.CashOnDelivery
          ? NotificationEventEnum.OrderPlaced
          : NotificationEventEnum.OrderPaid,
      );
      return { order };
    }
    return this.openPaymentSession(createdOrderId);
  }

  private async openPaymentSession(
    orderId: number,
  ): Promise<CreateOrderResult> {
    const order = await this.findOne(orderId);
    const backendUrl = this.configService.get<string>('BACKEND_URL');
    const callbackUrl = `${backendUrl}/payments/zarinpal/callback/order`;

    try {
      const { authority, paymentUrl } =
        await this.zarinpalService.requestPayment(
          order.total_price,
          `Order #${order.id}`,
          callbackUrl,
          order.user.mobile,
        );
      await this.ordersRepository.update(
        { id: order.id },
        { zarinpalAuthority: authority },
      );
      return { order: await this.findOne(orderId), paymentUrl };
    } catch (error) {
      this.logger.error(
        `Could not open a payment session for order ${orderId}: ${(error as Error).message}`,
      );
      await this.cancelUnpaidOrder(
        orderId,
        'the payment session could not be opened',
      );
      throw new ServiceUnavailableException(
        'Could not start the payment. Nothing was charged, the order was cancelled - please try again.',
      );
    }
  }

  private async assertOpenSessionLimit(userId: number): Promise<void> {
    const open = await this.ordersRepository.count({
      where: {
        user: { id: userId },
        status: OrderStatusEnum.AwaitingPayment,
        deletedAt: IsNull(),
      },
    });
    if (open >= MAX_OPEN_PAYMENT_SESSIONS_PER_USER) {
      throw new ConflictException(
        `You already have ${open} unpaid orders waiting for payment - finish or cancel one before starting another`,
      );
    }
  }

  private async findByIdempotencyKey(
    userId: number,
    idempotencyKey: string,
  ): Promise<{
    id: number;
    fingerprint: string | null;
    status: OrderStatusEnum;
    authority: string | null;
    deleted: boolean;
  } | null> {
    const row = await this.ordersRepository
      .createQueryBuilder('order')
      .withDeleted()
      .select('order.id', 'id')
      .addSelect('order.idempotency_fingerprint', 'fingerprint')
      .addSelect('order.status', 'status')
      .addSelect('order.zarinpalAuthority', 'authority')
      .addSelect('order.deletedAt', 'deletedAt')
      .where(
        'order.userId = :userId AND order.idempotency_key = :idempotencyKey',
        {
          userId,
          idempotencyKey,
        },
      )
      .getRawOne<{
        id: number;
        fingerprint: string | null;
        status: OrderStatusEnum;
        authority: string | null;
        deletedAt: Date | null;
      }>();

    if (!row) return null;
    return {
      id: Number(row.id),
      fingerprint: row.fingerprint,
      status: row.status,
      authority: row.authority,
      deleted: !!row.deletedAt,
    };
  }

  private async replayExistingOrder(
    existing: {
      id: number;
      fingerprint: string | null;
      status: OrderStatusEnum;
      authority: string | null;
      deleted: boolean;
    },
    fingerprint: string,
  ): Promise<CreateOrderResult> {
    if (existing.fingerprint && existing.fingerprint !== fingerprint) {
      throw new ConflictException(
        'This Idempotency-Key was already used for a different order - use a new key',
      );
    }
    if (existing.deleted) {
      throw new ConflictException(
        'The order created with this Idempotency-Key was deleted - use a new key',
      );
    }
    const order = await this.findOne(existing.id);
    if (
      existing.status === OrderStatusEnum.AwaitingPayment &&
      existing.authority
    ) {
      return {
        order,
        paymentUrl: this.zarinpalService.buildPaymentUrl(existing.authority),
      };
    }
    return { order };
  }

  async findAll(
    userId: number,
    query: FilterOrderDto,
    isAdmin = false,
  ): Promise<PaginatedResult<Order>> {
    const { status, page, limit } = query;

    const [items, total] = await this.ordersRepository.findAndCount({
      select: ORDER_SELECT,
      where: {
        deletedAt: IsNull(),
        ...(isAdmin ? {} : { user: { id: userId } }),
        ...(status ? { status } : {}),
      },
      withDeleted: true,
      relations: ORDER_RELATIONS,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      select: ORDER_SELECT,
      where: { id, deletedAt: IsNull() },
      withDeleted: true,
      relations: ORDER_RELATIONS,
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }

    return order;
  }

  async update(id: number, updateOrderDto: UpdateOrderDto): Promise<Order> {
    const { addressId, items } = updateOrderDto;

    const { savedOrder, stockChanged } = await this.dataSource.transaction(
      async (manager) => {
        const ordersRepo = manager.getRepository(Order);
        const addressesRepo = manager.getRepository(Address);
        const productsRepo = manager.getRepository(Product);
        const orderItemsRepo = manager.getRepository(OrderItem);

        await this.lockOrderRow(ordersRepo, { id }, id);
        const order = await this.loadOrderForWrite(ordersRepo, id);

        if (order.status !== OrderStatusEnum.Pending) {
          throw new BadRequestException(
            `Cannot modify an order once it is ${order.status} - only pending orders can be edited`,
          );
        }
        if (order.zarinpalAuthority) {
          throw new BadRequestException(
            'This order already has an open payment session and can no longer be edited - cancel it (or let it expire) and place a new order',
          );
        }

        if (addressId !== undefined) {
          const newAddress = await addressesRepo.findOne({
            where: { id: addressId },
            relations: { user: true },
          });
          if (!newAddress) {
            throw new NotFoundException(
              `Address with id ${addressId} not found`,
            );
          }
          if (newAddress.user.id !== order.user.id) {
            throw new BadRequestException(
              'This address does not belong to you',
            );
          }
          order.address = newAddress;
          order.shippingAddressSnapshot = {
            province: newAddress.province,
            city: newAddress.city,
            address: newAddress.address,
            postal_code: newAddress.postal_code,
            receiver_mobile: newAddress.receiver_mobile,
            description: newAddress.description,
          };
        }

        if (items !== undefined) {
          const previousItems = order.items ?? [];
          const involvedProductIds = [
            ...new Set([
              ...previousItems
                .map((item) => item.product?.id)
                .filter((id): id is number => !!id),
              ...items.map((item) => item.productId),
            ]),
          ].sort((a, b) => a - b);

          const lockedProducts = await productsRepo.find({
            where: { id: In(involvedProductIds) },
            withDeleted: true,
            order: { id: 'ASC' },
            lock: { mode: 'pessimistic_write' },
          });
          const releasedLines = toStockLines(previousItems);
          const resolved = await this.resolveVariants(
            manager,
            items,
            lockedProducts.filter((product) => !product.deleted_at),
          );
          const variantsById = new Map(
            resolved.map((entry) => [entry.variant.id, entry.variant]),
          );
          const releasedVariants = await this.lockVariants(
            manager,
            releasedLines.map((line) => line.variantId),
          );
          for (const line of releasedLines) {
            const variant =
              variantsById.get(line.variantId) ??
              releasedVariants.get(line.variantId);
            if (variant) {
              variant.stock += line.quantity;
              variantsById.set(variant.id, variant);
            }
          }

          const updatedItems = items.map((item, index) => {
            const { product, variant } = resolved[index];
            const tracked = variantsById.get(variant.id) ?? variant;
            if (product.deleted_at) {
              throw new BadRequestException(
                'One or more product IDs are invalid',
              );
            }
            if (tracked.stock < item.quantity) {
              throw new BadRequestException(
                `${product.title} (${tracked.title}) does not have enough stock`,
              );
            }

            tracked.stock -= item.quantity;
            variantsById.set(tracked.id, tracked);

            return orderItemsRepo.create({
              product,
              variant: tracked,
              variant_title: tracked.title,
              variant_sku: tracked.sku,
              price: tracked.effectivePrice(product),
              quantity: item.quantity,
            });
          });

          await manager
            .getRepository(ProductVariant)
            .save([...variantsById.values()]);
          await syncProductStock(manager, involvedProductIds);

          if (previousItems.length) {
            await orderItemsRepo.remove(previousItems);
          }

          order.items = updatedItems;
          const weightGrams = resolved.reduce(
            (total, entry, index) =>
              total +
              entry.variant.weightGrams(entry.product) * items[index].quantity,
            0,
          );
          const scopedDiscount = order.discount
            ? await this.discountCodesService.findWithScope(order.discount.id)
            : null;
          const totals = await this.priceOrder({
            lines: updatedItems.map((item) => ({
              price: item.price,
              quantity: item.quantity,
            })),
            discountAmount: scopedDiscount
              ? this.discountCodesService.computeAmount(
                  scopedDiscount,
                  await this.toDiscountLines(manager, items, updatedItems),
                )
              : 0,
            province: order.address?.province ?? '',
            weightGrams,
            shippingMethodId: order.shipping_method?.id,
            cashOnDelivery:
              order.payment_method === PaymentMethodEnum.CashOnDelivery,
          });
          order.items_total = totals.items_total;
          order.discount_amount = totals.discount_amount;
          order.shipping_cost = totals.shipping_cost;
          order.tax_amount = totals.tax_amount;
          order.cod_fee = totals.cod_fee;
          order.total_price = totals.total_price;
          order.total_quantity = totals.total_quantity;
          if (totals.shipping) {
            order.shipping_method_title = totals.shipping.title;
            order.shipping_eta_days_min = totals.shipping.estimatedDaysMin;
            order.shipping_eta_days_max = totals.shipping.estimatedDaysMax;
          }
        }

        return {
          savedOrder: await ordersRepo.save(order),
          stockChanged: items !== undefined,
        };
      },
    );

    if (stockChanged) {
      await this.catalogCache.invalidate(CatalogCacheScope.Products);
    }
    return this.findOne(savedOrder.id);
  }

  async remove(id: number): Promise<void> {
    const restoredProductIds = await this.dataSource.transaction(
      async (manager) => {
        const ordersRepo = manager.getRepository(Order);

        await this.lockOrderRow(ordersRepo, { id }, id);
        const order = await this.loadOrderForWrite(ordersRepo, id);

        if (
          order.status !== OrderStatusEnum.Pending &&
          order.status !== OrderStatusEnum.Cancelled
        ) {
          throw new BadRequestException(
            `Cannot delete an order that is ${order.status} - cancel it first via PATCH /orders/:id/status`,
          );
        }
        if (
          order.zarinpalAuthority &&
          order.status !== OrderStatusEnum.Cancelled
        ) {
          throw new BadRequestException(
            'This order has an open payment session - wait for it to be paid or to expire before deleting it',
          );
        }

        let restored: number[] = [];
        if (order.status === OrderStatusEnum.Pending && order.items?.length) {
          restored = await restoreStock(manager, toStockLines(order.items));
        }
        await this.releaseDiscountReservation(order, manager);

        await ordersRepo.softDelete({ id });
        return restored;
      },
    );

    if (restoredProductIds.length > 0) {
      await this.catalogCache.invalidate(CatalogCacheScope.Products);
    }
  }

  async updateStatus(
    id: number,
    updateOrderStatusDto: UpdateOrderStatusDto,
    actor?: AuditActor,
  ): Promise<Order> {
    const { status: newStatus, tracking_code } = updateOrderStatusDto;

    let previousStatus: OrderStatusEnum | null = null;
    let refunded = 0;
    const { savedOrderId, restoredProductIds } =
      await this.dataSource.transaction(async (manager) => {
        const ordersRepo = manager.getRepository(Order);

        await this.lockOrderRow(ordersRepo, { id }, id);
        const order = await this.loadOrderForWrite(ordersRepo, id);

        previousStatus = order.status;
        const allowedNext = ALLOWED_STATUS_TRANSITIONS[order.status] ?? [];
        if (order.status !== newStatus && !allowedNext.includes(newStatus)) {
          throw new BadRequestException(
            `Cannot move an order from ${order.status} to ${newStatus}`,
          );
        }

        let restored: number[] = [];
        if (newStatus === OrderStatusEnum.Cancelled) {
          if (
            CANCELLABLE_WITH_STOCK_RESTORE.includes(order.status) &&
            order.items?.length
          ) {
            restored = await restoreStock(manager, toStockLines(order.items));
          }
          await this.releaseDiscountReservation(order, manager);
          if (
            REFUNDABLE_ON_CANCEL.includes(order.status) &&
            order.total_price > order.refunded_amount
          ) {
            const refundAmount = order.total_price - order.refunded_amount;
            refunded = refundAmount;
            await this.walletsService.refund(
              order.user.id,
              refundAmount,
              `Refund for cancelled order #${order.id}`,
              manager,
            );
            order.refunded_amount = order.total_price;
          }
        }

        order.status = newStatus;
        if (tracking_code !== undefined) {
          order.tracking_code = tracking_code;
        }
        if (newStatus === OrderStatusEnum.Paid && !order.payed_time) {
          order.payed_time = new Date();
        }
        if (newStatus === OrderStatusEnum.Paid) {
          await this.countSales(manager, order.id, 1);
        }
        if (
          newStatus === OrderStatusEnum.Cancelled &&
          previousStatus &&
          SOLD_STATUSES.includes(previousStatus)
        ) {
          await this.countSales(manager, order.id, -1);
        }
        if (newStatus === OrderStatusEnum.Delivered && !order.delivered_at) {
          order.delivered_at = new Date();
        }
        if (newStatus === OrderStatusEnum.Paid && !order.invoice_number) {
          order.invoice_number = await this.invoiceService.nextNumber(manager);
        }
        if (
          newStatus === OrderStatusEnum.Paid ||
          newStatus === OrderStatusEnum.Cancelled
        ) {
          order.payment_expires_at = null;
        }
        const saved = await ordersRepo.save(order);

        return { savedOrderId: saved.id, restoredProductIds: restored };
      });

    if (restoredProductIds.length > 0) {
      await this.catalogCache.invalidate(CatalogCacheScope.Products);
    }

    await this.auditService.record({
      action: 'order.status_changed',
      entityType: 'order',
      entityId: savedOrderId,
      actor,
      changes: {
        status: { from: previousStatus, to: newStatus },
        ...(refunded > 0 ? { refunded_to_wallet: refunded } : {}),
        ...(tracking_code ? { tracking_code } : {}),
      },
    });

    const order = await this.findOne(savedOrderId);
    const event =
      newStatus === OrderStatusEnum.Paid
        ? NotificationEventEnum.OrderPaid
        : newStatus === OrderStatusEnum.Sent
          ? NotificationEventEnum.OrderSent
          : newStatus === OrderStatusEnum.Delivered
            ? NotificationEventEnum.OrderDelivered
            : newStatus === OrderStatusEnum.Cancelled
              ? NotificationEventEnum.OrderCancelled
              : null;
    if (event) {
      await this.notifications.notify(order, event);
    }
    return order;
  }

  // The one way an unpaid order ends: stock and the discount reservation
  // go back, and the order is marked cancelled - never deleted, so a
  // late callback still finds it.
  async cancelUnpaidOrder(orderId: number, reason: string): Promise<boolean> {
    const restoredProductIds = await this.dataSource.transaction(
      async (manager) => {
        const ordersRepo = manager.getRepository(Order);
        const locked = await ordersRepo.findOne({
          select: { id: true, status: true },
          where: { id: orderId },
          withDeleted: true,
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked || !UNPAID_STATUSES.includes(locked.status)) {
          return [];
        }

        const order = await this.loadOrderForWrite(ordersRepo, orderId);
        const restored = order.items?.length
          ? await restoreStock(manager, toStockLines(order.items))
          : [];
        await this.releaseDiscountReservation(order, manager);
        await ordersRepo.update(
          { id: orderId },
          {
            status: OrderStatusEnum.Cancelled,
            payment_expires_at: null,
          },
        );
        this.logger.log(`Order ${orderId} cancelled: ${reason}`);
        return restored;
      },
    );

    if (restoredProductIds.length > 0) {
      await this.catalogCache.invalidate(CatalogCacheScope.Products);
    }
    return restoredProductIds.length > 0;
  }

  async finalizePaidOrder(
    orderId: number,
    paymentReference: string,
  ): Promise<PaymentOutcome> {
    const outcome = await this.settlePaidOrder(orderId, paymentReference);
    if (outcome === 'paid') {
      // settlePaidOrder is the one path that moves sales_count without
      // touching the catalogue cache, so the public product list kept
      // serving a stale sales_count - which is what "best selling" sorts on.
      await this.catalogCache.invalidate(CatalogCacheScope.Products);
      await this.notifications.notify(
        await this.findOne(orderId),
        NotificationEventEnum.OrderPaid,
      );
    }
    return outcome;
  }

  // A payment that lands after the order was cancelled is refunded to the
  // wallet rather than ignored - the money did leave the customer.
  private async settlePaidOrder(
    orderId: number,
    paymentReference: string,
  ): Promise<PaymentOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const ordersRepo = manager.getRepository(Order);
      const locked = await ordersRepo.findOne({
        select: { id: true, status: true },
        where: { id: orderId },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException(`Order with id ${orderId} not found`);
      }
      if (locked.status === OrderStatusEnum.Paid) {
        return 'already_paid';
      }

      const order = await this.loadOrderForWrite(ordersRepo, orderId);

      if (UNPAID_STATUSES.includes(order.status) && !order.deletedAt) {
        if (order.discount && !order.discount_reserved) {
          await this.discountCodesService.consumeOne(order.discount, manager);
          await ordersRepo.update({ id: orderId }, { discount_reserved: true });
        }
        await this.countSales(manager, orderId, 1);
        await ordersRepo.update(
          { id: orderId },
          {
            status: OrderStatusEnum.Paid,
            payed_time: new Date(),
            payment_reference: paymentReference,
            payment_expires_at: null,
            ...(order.invoice_number
              ? {}
              : {
                  invoice_number: await this.invoiceService.nextNumber(manager),
                }),
          },
        );
        return 'paid';
      }

      const refundAmount = order.total_price - order.refunded_amount;
      if (refundAmount > 0) {
        await this.walletsService.refund(
          order.user.id,
          refundAmount,
          `Refund for order #${order.id} paid after it was closed`,
          manager,
        );
        await ordersRepo.update(
          { id: orderId },
          {
            refunded_amount: order.total_price,
            payment_reference: paymentReference,
          },
        );
      }
      this.logger.warn(
        `Order ${orderId} was paid after it closed - ${refundAmount} refunded to the customer's wallet`,
      );
      await this.auditService.record({
        action: 'order.refunded_late_payment',
        entityType: 'order',
        entityId: orderId,
        changes: { amount: refundAmount, reference: paymentReference },
      });
      return 'refunded';
    });
  }

  async findByAuthority(authority: string): Promise<Order | null> {
    return this.ordersRepository.findOne({
      where: { zarinpalAuthority: authority },
      withDeleted: true,
      relations: { user: true },
    });
  }

  private async resolveVariants(
    manager: EntityManager,
    items: Array<{ productId: number; quantity: number; variantId?: number }>,
    products: Product[],
  ): Promise<Array<{ product: Product; variant: ProductVariant }>> {
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const variantsRepo = manager.getRepository(ProductVariant);

    const requestedIds = items
      .map((item) => item.variantId)
      .filter((id): id is number => !!id);
    const byId = await this.lockVariants(manager, requestedIds);

    const defaultsNeeded = items
      .filter((item) => !item.variantId)
      .map((item) => item.productId);
    const defaults = new Map<number, ProductVariant[]>();
    if (defaultsNeeded.length > 0) {
      const rows = await variantsRepo.find({
        where: {
          product: { id: In([...new Set(defaultsNeeded)]) },
          is_active: true,
        },
        relations: { product: true },
        order: { id: 'ASC' },
      });
      for (const row of rows) {
        const list = defaults.get(row.product.id) ?? [];
        list.push(row);
        defaults.set(row.product.id, list);
      }
      const chosen = [...defaults.values()]
        .filter((list) => list.length === 1)
        .map((list) => list[0].id);
      const locked = await this.lockVariants(manager, chosen);
      for (const [id, variant] of locked) byId.set(id, variant);
    }

    return items.map((item) => {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new BadRequestException('One or more product IDs are invalid');
      }

      if (item.variantId) {
        const variant = byId.get(item.variantId);
        if (!variant) {
          throw new BadRequestException(`Variant ${item.variantId} not found`);
        }
        if (variant.product?.id !== product.id) {
          throw new BadRequestException(
            `Variant ${item.variantId} does not belong to product ${product.id}`,
          );
        }
        if (!variant.is_active) {
          throw AppError.badRequest(
            ErrorCodes.VARIANT_NOT_FOR_SALE,
            `${product.title} (${variant.title}) is not for sale`,
            { productId: product.id, variantId: variant.id },
          );
        }
        return { product, variant };
      }

      const options = defaults.get(product.id) ?? [];
      if (options.length === 0) {
        throw new BadRequestException(`${product.title} is not for sale`);
      }
      if (options.length > 1) {
        throw AppError.badRequest(
          ErrorCodes.VARIANT_REQUIRED,
          `${product.title} has ${options.length} options - send the variantId you want`,
          { productId: product.id, optionCount: options.length },
        );
      }
      const variant = byId.get(options[0].id) ?? options[0];
      return { product, variant };
    });
  }

  // Two reads on purpose: MySQL cannot take a row lock and resolve a join
  // in the same statement, so the lock is taken first and the relations
  // are read after.
  //
  // The locking read has to be the one that returns the columns we act on.
  // SELECT ... FOR UPDATE is a *current* read: it sees the latest committed
  // row. A plain SELECT in the same transaction is a consistent read and
  // keeps returning the snapshot taken at the transaction's first read -
  // so taking the lock on a `select: { id }` query and then reading `stock`
  // without a lock still handed every concurrent checkout the same stale
  // value, and the last unit in the warehouse could be sold many times over.
  private async lockVariants(
    manager: EntityManager,
    variantIds: number[],
  ): Promise<Map<number, ProductVariant>> {
    const ids = [...new Set(variantIds)]
      .filter((id) => !!id)
      .sort((a, b) => a - b);
    if (ids.length === 0) return new Map();

    const variants = await manager.getRepository(ProductVariant).find({
      where: { id: In(ids) },
      withDeleted: true,
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });

    // Second pass purely to attach the product association. Which product a
    // variant belongs to is not a contended value, so a snapshot read is
    // fine here - unlike stock, which now comes from the locked read above.
    const related = await manager.getRepository(ProductVariant).find({
      where: { id: In(ids) },
      withDeleted: true,
      relations: { product: true },
      order: { id: 'ASC' },
    });
    const productById = new Map(related.map((row) => [row.id, row.product]));
    for (const variant of variants) {
      variant.product = productById.get(variant.id) as Product;
    }

    return new Map(variants.map((variant) => [variant.id, variant]));
  }

  // Keeps products.sales_count honest: counted when an order is paid,
  // given back when a paid order is cancelled. GREATEST stops it from
  // going negative if history is ever edited by hand.
  private async countSales(
    manager: EntityManager,
    orderId: number,
    sign: 1 | -1,
  ): Promise<void> {
    await manager.query(
      'UPDATE `products` p INNER JOIN (' +
        'SELECT `product_id`, SUM(`quantity`) AS q FROM `order_items` ' +
        'WHERE `order_id` = ? GROUP BY `product_id`' +
        ') oi ON oi.`product_id` = p.`id` ' +
        'SET p.`sales_count` = GREATEST(CAST(p.`sales_count` AS SIGNED) + (? * oi.q), 0)',
      [orderId, sign],
    );
  }

  private async toDiscountLines(
    manager: EntityManager,
    items: Array<{ productId: number; quantity: number }>,
    lines: Array<{ price: number; quantity: number }>,
  ): Promise<DiscountLine[]> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    if (productIds.length === 0) return [];

    const rows: Array<{ product_id: number; category_id: number }> =
      await manager.query(
        'SELECT `product_id`, `category_id` FROM `product_category` WHERE `product_id` IN (' +
          productIds.map(() => '?').join(', ') +
          ')',
        productIds,
      );
    const categoriesByProduct = new Map<number, number[]>();
    for (const row of rows) {
      const list = categoriesByProduct.get(Number(row.product_id)) ?? [];
      list.push(Number(row.category_id));
      categoriesByProduct.set(Number(row.product_id), list);
    }

    return items.map((item, index) => ({
      productId: item.productId,
      categoryIds: categoriesByProduct.get(item.productId) ?? [],
      lineTotal: Number(lines[index]?.price ?? 0) * item.quantity,
    }));
  }

  private async releaseDiscountReservation(
    order: Order,
    manager: EntityManager,
  ): Promise<void> {
    if (!order.discount || !order.discount_reserved) {
      return;
    }
    await this.discountCodesService.releaseOne(order.discount.id, manager);
    await manager
      .getRepository(Order)
      .update({ id: order.id }, { discount_reserved: false });
    order.discount_reserved = false;
  }

  private async lockOrderRow(
    ordersRepo: Repository<Order>,
    where: FindOptionsWhere<Order>,
    id: number,
  ): Promise<void> {
    const locked = await ordersRepo.findOne({
      select: { id: true },
      where: { ...where, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }
  }

  private async loadOrderForWrite(
    ordersRepo: Repository<Order>,
    id: number,
  ): Promise<Order> {
    const order = await ordersRepo.findOne({
      where: { id },
      withDeleted: true,
      relations: {
        user: true,
        address: true,
        discount: true,
        shipping_method: true,
        items: { product: true, variant: true },
      },
    });
    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }
    return order;
  }
}
