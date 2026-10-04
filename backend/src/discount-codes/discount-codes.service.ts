import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { DiscountCode } from './entities/discount-code.entity';
import { CreateDiscountCodeDto } from './dto/create-discount-code.dto';
import { UpdateDiscountCodeDto } from './dto/update-discount-code.dto';
import { FilterDiscountCodeDto } from './dto/filter-discount-code.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { isDuplicateEntryError } from '../common/database/mysql-errors';
import DiscountStatusEnum from './enums/discount-status.enum';
import DiscountTypeEnum from './enums/discount-type.enum';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { Category } from '../categories/entities/category.entity';
import OrderStatusEnum from '../orders/enums/order-status.enum';

export interface DiscountLine {
  productId: number;
  categoryIds: number[];
  lineTotal: number;
}
import { AuditActor, AuditService } from '../audit/audit.service';

@Injectable()
export class DiscountCodesService {
  constructor(
    @InjectRepository(DiscountCode)
    private readonly discountCodeRepository: Repository<DiscountCode>,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly auditService: AuditService,
  ) {}

  private assertCoherent(dto: Partial<CreateDiscountCodeDto>): void {
    const type = dto.type ?? DiscountTypeEnum.Percent;
    if (type === DiscountTypeEnum.Fixed && !dto.off_amount) {
      throw new BadRequestException(
        'A fixed-amount code needs off_amount (in Toman)',
      );
    }
    if (type === DiscountTypeEnum.Percent && !dto.off_percent) {
      throw new BadRequestException('A percentage code needs off_percent');
    }
    if (
      dto.starts_at &&
      dto.expires_at &&
      new Date(dto.starts_at) > new Date(dto.expires_at)
    ) {
      throw new BadRequestException('The code cannot expire before it starts');
    }
  }

  private getRepo(manager?: EntityManager): Repository<DiscountCode> {
    return manager
      ? manager.getRepository(DiscountCode)
      : this.discountCodeRepository;
  }

  async create(
    createDto: CreateDiscountCodeDto,
    actor?: AuditActor,
  ): Promise<DiscountCode> {
    this.assertCoherent(createDto);
    const { productIds, categoryIds, ...rest } = createDto;
    try {
      const discountCode = this.discountCodeRepository.create({
        ...rest,
        off_percent: rest.off_percent ?? 0,
        starts_at: rest.starts_at ? new Date(rest.starts_at) : null,
        expires_at: rest.expires_at ? new Date(rest.expires_at) : null,
        products: (productIds ?? []).map((id) => ({ id }) as Product),
        categories: (categoryIds ?? []).map((id) => ({ id }) as Category),
      });
      const saved = await this.discountCodeRepository.save(discountCode);
      await this.auditService.record({
        action: 'discount_code.created',
        entityType: 'discount_code',
        entityId: saved.id,
        actor,
        changes: { ...createDto },
      });
      return saved;
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(
          `A discount code "${createDto.code}" already exists (it may have been deleted earlier)`,
        );
      }
      throw error;
    }
  }

  async findAll(
    query: FilterDiscountCodeDto,
  ): Promise<PaginatedResult<DiscountCode>> {
    const { page, limit } = query;
    const [items, total] = await this.discountCodeRepository.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findWithScope(id: number): Promise<DiscountCode | null> {
    return this.discountCodeRepository.findOne({
      where: { id },
      relations: { products: true, categories: true },
      withDeleted: true,
    });
  }

  async findOne(id: number): Promise<DiscountCode> {
    const discountCode = await this.discountCodeRepository.findOneBy({ id });
    if (!discountCode) {
      throw new NotFoundException(`Discount code with id ${id} not found`);
    }
    return discountCode;
  }

  async update(
    id: number,
    updateDto: UpdateDiscountCodeDto,
    actor?: AuditActor,
  ): Promise<DiscountCode> {
    const discountCode = await this.discountCodeRepository.findOne({
      where: { id },
      relations: { products: true, categories: true },
    });
    if (!discountCode) {
      throw new NotFoundException(`Discount code with id ${id} not found`);
    }
    this.assertCoherent({ ...discountCode, ...updateDto } as never);

    const { productIds, categoryIds, ...rest } = updateDto;
    Object.assign(discountCode, rest, {
      ...(rest.starts_at !== undefined
        ? { starts_at: rest.starts_at ? new Date(rest.starts_at) : null }
        : {}),
      ...(rest.expires_at !== undefined
        ? { expires_at: rest.expires_at ? new Date(rest.expires_at) : null }
        : {}),
      ...(productIds !== undefined
        ? {
            products: productIds.map(
              (productId) => ({ id: productId }) as Product,
            ),
          }
        : {}),
      ...(categoryIds !== undefined
        ? {
            categories: categoryIds.map(
              (categoryId) => ({ id: categoryId }) as Category,
            ),
          }
        : {}),
    });
    const saved = await this.discountCodeRepository.save(discountCode);
    await this.auditService.record({
      action: 'discount_code.updated',
      entityType: 'discount_code',
      entityId: id,
      actor,
      changes: { ...updateDto },
    });
    return saved;
  }

  async remove(id: number, actor?: AuditActor): Promise<void> {
    const result = await this.discountCodeRepository.softDelete({ id });
    if (!result.affected) {
      throw new NotFoundException(`Discount code with id ${id} not found`);
    }
    await this.auditService.record({
      action: 'discount_code.deleted',
      entityType: 'discount_code',
      entityId: id,
      actor,
    });
  }

  async findValidByCode(
    code: string,
    manager?: EntityManager,
  ): Promise<DiscountCode> {
    const discountCode = await this.getRepo(manager).findOne({
      where: { code },
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (discountCode) {
      const withScope = await this.getRepo(manager).findOne({
        where: { id: discountCode.id },
        relations: { products: true, categories: true },
      });
      discountCode.products = withScope?.products ?? [];
      discountCode.categories = withScope?.categories ?? [];
    }
    if (!discountCode) {
      throw new BadRequestException('Discount code not found');
    }
    if (discountCode.status !== DiscountStatusEnum.Active) {
      throw new BadRequestException('Discount code is not active');
    }
    if (discountCode.capacity <= 0) {
      throw new BadRequestException('Discount code has been fully used');
    }
    return discountCode;
  }

  // Every rule a code carries: campaign window, minimum order, per-customer
  // limit, scope, and the ceiling on a percentage.
  async quoteForOrder(params: {
    code: string;
    userId: number;
    lines: DiscountLine[];
    manager?: EntityManager;
  }): Promise<{ discount: DiscountCode; amount: number }> {
    const discount = await this.findValidByCode(params.code, params.manager);
    const now = new Date();

    if (discount.starts_at && now < discount.starts_at) {
      throw new BadRequestException('This discount code is not active yet');
    }
    if (discount.expires_at && now > discount.expires_at) {
      throw new BadRequestException('This discount code has expired');
    }

    const orderTotal = params.lines.reduce(
      (sum, line) => sum + line.lineTotal,
      0,
    );
    if (discount.min_order_amount && orderTotal < discount.min_order_amount) {
      throw new BadRequestException(
        `This code needs an order of at least ${discount.min_order_amount.toLocaleString('en-US')} Toman`,
      );
    }

    if (discount.per_user_limit) {
      const used = await this.ordersRepository.count({
        where: {
          discount: { id: discount.id },
          user: { id: params.userId },
          status: Not(OrderStatusEnum.Cancelled),
        },
      });
      if (used >= discount.per_user_limit) {
        throw new BadRequestException(
          'You have already used this discount code as many times as it allows',
        );
      }
    }

    const amount = this.computeAmount(discount, params.lines);
    if (amount <= 0) {
      throw new BadRequestException(
        'This code does not apply to anything in your basket',
      );
    }

    return { discount, amount };
  }

  // Separate from the checks above: editing an order re-prices the same
  // code without re-running "have you used this before" against the order
  // that is already holding a use.
  computeAmount(discount: DiscountCode, lines: DiscountLine[]): number {
    const eligible = this.eligibleTotal(discount, lines);
    if (eligible <= 0) return 0;

    if (discount.type === DiscountTypeEnum.Fixed) {
      return Math.min(discount.off_amount ?? 0, eligible);
    }

    const raw = Math.round((eligible * discount.off_percent) / 100);
    return discount.max_discount_amount
      ? Math.min(raw, discount.max_discount_amount)
      : raw;
  }

  private eligibleTotal(discount: DiscountCode, lines: DiscountLine[]): number {
    const productIds = new Set((discount.products ?? []).map((p) => p.id));
    const categoryIds = new Set((discount.categories ?? []).map((c) => c.id));
    if (productIds.size === 0 && categoryIds.size === 0) {
      return lines.reduce((sum, line) => sum + line.lineTotal, 0);
    }

    return lines.reduce((sum, line) => {
      const matches =
        productIds.has(line.productId) ||
        line.categoryIds.some((id) => categoryIds.has(id));
      return matches ? sum + line.lineTotal : sum;
    }, 0);
  }

  async consumeOne(
    discountCode: DiscountCode,
    manager?: EntityManager,
  ): Promise<void> {
    const result = await this.getRepo(manager)
      .createQueryBuilder()
      .update(DiscountCode)
      .set({ capacity: () => 'capacity - 1' })
      .where(
        'id = :id AND capacity > 0 AND status = :status AND deleted_at IS NULL',
        {
          id: discountCode.id,
          status: DiscountStatusEnum.Active,
        },
      )
      .execute();

    if (!result.affected) {
      throw new BadRequestException(
        'This discount code is no longer available',
      );
    }
    discountCode.capacity -= 1;
  }

  async releaseOne(
    discountCodeId: number,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getRepo(manager)
      .createQueryBuilder()
      .update(DiscountCode)
      .set({ capacity: () => 'capacity + 1' })
      .where('id = :id', { id: discountCodeId })
      .execute();
  }
}
