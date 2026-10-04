import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReturnRequest } from './entities/return-request.entity';
import { ReturnItem } from './entities/return-item.entity';
import ReturnStatusEnum from './enums/return-status.enum';
import {
  CreateReturnRequestDto,
  FilterReturnRequestDto,
  UpdateReturnStatusDto,
} from './dto/return.dto';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import OrderStatusEnum from '../orders/enums/order-status.enum';
import { WalletsService } from '../wallets/wallets.service';
import { AuditActor, AuditService } from '../audit/audit.service';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { restoreStock } from '../products/utils/product-stock';
import {
  CatalogCacheScope,
  CatalogCacheService,
} from '../common/cache/catalog-cache.service';

const DEFAULT_RETURN_WINDOW_DAYS = 7;

// Refunding is the only step that moves money, and it is reachable only
// after the goods are back with the shop.
const ALLOWED_TRANSITIONS: Record<ReturnStatusEnum, ReturnStatusEnum[]> = {
  [ReturnStatusEnum.Requested]: [
    ReturnStatusEnum.Approved,
    ReturnStatusEnum.Rejected,
    ReturnStatusEnum.Cancelled,
  ],
  [ReturnStatusEnum.Approved]: [
    ReturnStatusEnum.Received,
    ReturnStatusEnum.Rejected,
  ],
  [ReturnStatusEnum.Received]: [ReturnStatusEnum.Refunded],
  [ReturnStatusEnum.Refunded]: [],
  [ReturnStatusEnum.Rejected]: [],
  [ReturnStatusEnum.Cancelled]: [],
};

// A live request holds the quantities it asked for, so the same units
// cannot be returned twice.
const HOLDS_QUANTITY = [
  ReturnStatusEnum.Requested,
  ReturnStatusEnum.Approved,
  ReturnStatusEnum.Received,
  ReturnStatusEnum.Refunded,
];

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    @InjectRepository(ReturnRequest)
    private readonly requests: Repository<ReturnRequest>,
    @InjectRepository(ReturnItem)
    private readonly returnItems: Repository<ReturnItem>,
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    private readonly walletsService: WalletsService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly catalogCache: CatalogCacheService,
    private readonly dataSource: DataSource,
  ) {}

  private get windowDays(): number {
    return (
      Number(this.configService.get<string>('RETURN_WINDOW_DAYS')) ||
      DEFAULT_RETURN_WINDOW_DAYS
    );
  }

  async create(
    userId: number,
    dto: CreateReturnRequestDto,
  ): Promise<ReturnRequest> {
    const order = await this.orders.findOne({
      where: { id: dto.orderId },
      relations: { user: true, items: { product: true, variant: true } },
    });
    if (!order) {
      throw new NotFoundException(`Order with id ${dto.orderId} not found`);
    }
    if (order.user.id !== userId) {
      throw new ForbiddenException('This order does not belong to you');
    }

    if (order.status !== OrderStatusEnum.Delivered) {
      throw new BadRequestException(
        'Only delivered orders can be returned - cancel it instead if it has not arrived yet',
      );
    }
    const deliveredAt = order.delivered_at ?? order.updatedAt;
    const daysSince =
      (Date.now() - deliveredAt.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSince > this.windowDays) {
      throw new BadRequestException(
        `The ${this.windowDays}-day return window for this order has passed`,
      );
    }

    const alreadyReturned = await this.returnedQuantities(order.id);
    const orderItems = new Map(order.items.map((item) => [item.id, item]));

    const items = dto.items.map((line) => {
      const orderItem = orderItems.get(line.orderItemId);
      if (!orderItem) {
        throw new BadRequestException(
          `Item ${line.orderItemId} is not part of this order`,
        );
      }
      const remaining =
        orderItem.quantity - (alreadyReturned.get(orderItem.id) ?? 0);
      if (line.quantity > remaining) {
        throw new BadRequestException(
          remaining > 0
            ? `You can only return ${remaining} more of "${orderItem.product?.title ?? 'this item'}"`
            : `"${orderItem.product?.title ?? 'This item'}" has already been returned`,
        );
      }
      return this.returnItems.create({
        orderItem: { id: orderItem.id } as OrderItem,
        quantity: line.quantity,
      });
    });

    const saved = await this.requests.save(
      this.requests.create({
        order: { id: order.id } as Order,
        user: { id: userId } as never,
        items,
        reason: dto.reason,
        description: dto.description ?? null,
        status: ReturnStatusEnum.Requested,
      }),
    );

    await this.auditService.record({
      action: 'return.requested',
      entityType: 'return_request',
      entityId: saved.id,
      actor: { userId },
      changes: { orderId: order.id, reason: dto.reason },
    });

    return this.findOne(saved.id);
  }

  private async returnedQuantities(
    orderId: number,
  ): Promise<Map<number, number>> {
    const rows = await this.returnItems
      .createQueryBuilder('item')
      .innerJoin('item.returnRequest', 'request')
      .select('item.order_item_id', 'orderItemId')
      .addSelect('SUM(item.quantity)', 'quantity')
      .where('request.order_id = :orderId', { orderId })
      .andWhere('request.status IN (:...statuses)', {
        statuses: HOLDS_QUANTITY,
      })
      .groupBy('item.order_item_id')
      .getRawMany<{ orderItemId: number; quantity: string }>();

    return new Map(
      rows.map((row) => [Number(row.orderItemId), Number(row.quantity)]),
    );
  }

  async findAll(
    userId: number,
    query: FilterReturnRequestDto,
    isAdmin = false,
  ): Promise<PaginatedResult<ReturnRequest>> {
    const { page, limit, status } = query;
    const [items, total] = await this.requests.findAndCount({
      where: {
        ...(isAdmin ? {} : { user: { id: userId } }),
        ...(status ? { status } : {}),
      },
      relations: { order: true, user: true, items: { orderItem: true } },
      select: {
        id: true,
        status: true,
        reason: true,
        description: true,
        refund_amount: true,
        restock: true,
        admin_note: true,
        resolved_at: true,
        created_at: true,
        order: { id: true, invoice_number: true, total_price: true },
        user: { id: true, display_name: true, mobile: true },
      },
      order: { created_at: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number): Promise<ReturnRequest> {
    const request = await this.requests.findOne({
      where: { id },
      relations: {
        order: true,
        user: true,
        items: { orderItem: { product: true } },
        resolved_by: true,
      },
      select: {
        id: true,
        status: true,
        reason: true,
        description: true,
        refund_amount: true,
        restock: true,
        admin_note: true,
        resolved_at: true,
        created_at: true,
        order: { id: true, invoice_number: true, total_price: true },
        user: { id: true, display_name: true, mobile: true },
        resolved_by: { id: true, display_name: true },
      },
    });
    if (!request) {
      throw new NotFoundException(`Return request ${id} not found`);
    }
    return request;
  }

  async updateStatus(
    id: number,
    dto: UpdateReturnStatusDto,
    actor?: AuditActor,
  ): Promise<ReturnRequest> {
    const restored = await this.dataSource.transaction(async (manager) => {
      const requests = manager.getRepository(ReturnRequest);
      const locked = await requests.findOne({
        select: { id: true, status: true },
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException(`Return request ${id} not found`);
      }

      const request = await requests.findOne({
        where: { id },
        relations: {
          order: { user: true },
          items: { orderItem: { variant: true, product: true } },
        },
      });
      if (!request) {
        throw new NotFoundException(`Return request ${id} not found`);
      }

      const allowed = ALLOWED_TRANSITIONS[request.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `A ${request.status} return cannot become ${dto.status}`,
        );
      }

      if (dto.restock !== undefined) request.restock = dto.restock;
      if (dto.admin_note !== undefined) request.admin_note = dto.admin_note;

      let restoredProductIds: number[] = [];
      if (dto.status === ReturnStatusEnum.Refunded) {
        const amount = this.refundAmountFor(request);
        const order = request.order;
        const remaining = order.total_price - order.refunded_amount;
        if (amount > remaining) {
          throw new BadRequestException(
            'This refund would give back more than the customer paid for the order',
          );
        }

        await this.walletsService.refund(
          order.user.id,
          amount,
          `Refund for returned items from order #${order.id}`,
          manager,
        );
        await manager
          .getRepository(Order)
          .update(
            { id: order.id },
            { refunded_amount: order.refunded_amount + amount },
          );
        request.refund_amount = amount;

        if (request.restock) {
          restoredProductIds = await restoreStock(
            manager,
            request.items
              .filter((item) => !!item.orderItem.variant)
              .map((item) => ({
                variantId: item.orderItem.variant!.id,
                quantity: item.quantity,
              })),
          );
        }
      }

      request.status = dto.status;
      if (
        dto.status === ReturnStatusEnum.Refunded ||
        dto.status === ReturnStatusEnum.Rejected
      ) {
        request.resolved_at = new Date();
        request.resolved_by = actor?.userId
          ? ({ id: actor.userId } as never)
          : null;
      }
      await requests.save(request);

      return restoredProductIds;
    });

    if (restored.length > 0) {
      await this.catalogCache.invalidate(CatalogCacheScope.Products);
    }

    const updated = await this.findOne(id);
    await this.auditService.record({
      action: `return.${dto.status}`,
      entityType: 'return_request',
      entityId: id,
      actor,
      changes: {
        status: dto.status,
        ...(updated.refund_amount
          ? { refund_amount: updated.refund_amount }
          : {}),
        ...(dto.restock !== undefined ? { restock: dto.restock } : {}),
      },
    });
    return updated;
  }

  async cancel(id: number, userId: number): Promise<void> {
    const request = await this.requests.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!request) {
      throw new NotFoundException(`Return request ${id} not found`);
    }
    if (request.user.id !== userId) {
      throw new ForbiddenException('This return request is not yours');
    }
    if (request.status !== ReturnStatusEnum.Requested) {
      throw new BadRequestException(
        `A return that is already ${request.status} cannot be cancelled`,
      );
    }
    await this.requests.update({ id }, { status: ReturnStatusEnum.Cancelled });
  }

  // The goods at what they were sold for, plus their share of the tax.
  // Shipping is not refunded: the parcel was delivered.
  private refundAmountFor(request: ReturnRequest): number {
    const goods = request.items.reduce(
      (total, item) => total + Number(item.orderItem.price) * item.quantity,
      0,
    );
    const order = request.order;
    const taxable = order.items_total - order.discount_amount;
    const discountShare =
      order.items_total > 0
        ? Math.round((goods * order.discount_amount) / order.items_total)
        : 0;
    const goodsAfterDiscount = goods - discountShare;
    const taxShare =
      taxable > 0 && order.tax_amount > 0
        ? Math.round((goodsAfterDiscount * order.tax_amount) / taxable)
        : 0;

    return goodsAfterDiscount + taxShare;
  }
}
