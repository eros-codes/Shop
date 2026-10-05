import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { FilterUserDto } from './dto/filter-users.dto';
import userRoleEnum from './enums/userRoleEnum';
import { BasketItem } from './entities/basket-item.entity';
import { AuditActor, AuditService } from '../audit/audit.service';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { lockActiveProduct } from '../products/utils/product-locks';
import { lockUserRow } from './utils/lock-user-row';

export const MAX_BASKET_LINES = 100;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(BasketItem)
    private readonly basketItemRepository: Repository<BasketItem>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const alreadyUser = await this.findOneByMobile(createUserDto.mobile);
    if (alreadyUser)
      throw new BadRequestException(
        'User with this mobile number already exists',
      );
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const newUser = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });
    const saved = await this.userRepository.save(newUser);
    return this.findOne(saved.id);
  }

  async findOneWithPassword(id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      select: { id: true, mobile: true, password: true },
    });
  }

  // Used by the password flows. Sessions are revoked by the caller,
  // which is the part that actually locks an attacker out.
  async setPassword(id: number, hashedPassword: string): Promise<void> {
    // Both the reset and the signed-in change come through here, so this is
    // the one place that has to retire the tokens already issued.
    const result = await this.userRepository.update(
      { id },
      { password: hashedPassword, tokens_valid_after: new Date() },
    );
    if (!result.affected) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
  }

  async createWithHashedPassword(data: {
    mobile: string;
    display_name: string;
    hashedPassword: string;
    role: userRoleEnum;
  }) {
    const newUser = this.userRepository.create({
      mobile: data.mobile,
      display_name: data.display_name,
      password: data.hashedPassword,
      role: data.role,
    });
    const saved = await this.userRepository.save(newUser);
    return this.findOne(saved.id);
  }

  async findAll(query: FilterUserDto): Promise<User[]> {
    const { role, page, limit } = query;
    const userQuery = this.userRepository.createQueryBuilder('users');
    if (role) {
      userQuery.where('users.role = :role', { role });
    }
    userQuery.skip((page - 1) * limit).take(limit);
    return userQuery.getMany();
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) throw new NotFoundException(`Could not find user ${id}`);
    return user;
  }

  async findOneByMobile(mobile: string): Promise<User | null> {
    return this.userRepository.findOneBy({ mobile });
  }

  async findOneByMobileWithPassword(mobile: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { mobile },
      select: {
        id: true,
        mobile: true,
        display_name: true,
        password: true,
        role: true,
      },
    });
  }

  async findOneByMobileOrFail(mobile: string): Promise<User> {
    const user = await this.findOneByMobile(mobile);

    if (!user) {
      throw new NotFoundException(
        `Could not find any user with ${mobile} mobile number`,
      );
    }
    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const { password, ...safeUpdate } = updateUserDto;
    const updateData: Partial<User> = { ...safeUpdate };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    const result = await this.userRepository.update({ id }, updateData);
    if (result.affected === 0) {
      throw new NotFoundException(`Could not find user ${id}`);
    }

    if (password) {
      await this.refreshTokenRepository.delete({ user: { id } });
    }

    return await this.findOne(id);
  }

  async updateRole(id: number, role: userRoleEnum, actor?: AuditActor) {
    const before = await this.userRepository.findOne({
      select: { id: true, role: true },
      where: { id },
    });
    const result = await this.userRepository.update({ id }, { role });
    if (result.affected === 0) {
      throw new NotFoundException(`Could not find user ${id}`);
    }

    await this.refreshTokenRepository.delete({ user: { id } });

    await this.auditService.record({
      action: 'user.role_changed',
      entityType: 'user',
      entityId: id,
      actor,
      changes: { role: { from: before?.role ?? null, to: role } },
    });

    return await this.findOne(id);
  }

  async remove(id: number) {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`Could not find user ${id}`);
    }

    const anonymizedPassword = await bcrypt.hash(randomUUID(), 10);
    await this.userRepository.update(id, {
      mobile: `deleted_${id}`,
      display_name: 'Deleted User',
      password: anonymizedPassword,
    });
    await this.userRepository.softDelete(id);

    await this.refreshTokenRepository.delete({ user: { id } });
  }

  async addProductToBasket(
    userId: number,
    productId: number,
    variantId?: number,
  ): Promise<BasketItem> {
    const basketItemId = await this.dataSource.transaction(async (manager) => {
      const product = await lockActiveProduct(
        manager,
        productId,
        'pessimistic_read',
      );
      const variant = await this.resolveBasketVariant(
        manager,
        productId,
        variantId,
      );
      await lockUserRow(manager, userId);

      const basketItems = manager.getRepository(BasketItem);
      const existing = await this.findBasketLine(
        basketItems,
        userId,
        variant.id,
      );
      const nextQuantity = (existing?.quantity ?? 0) + 1;

      if (nextQuantity > variant.stock) {
        throw new BadRequestException(
          variant.stock > 0
            ? `Only ${variant.stock} of ${product.title} (${variant.title}) are in stock`
            : `${product.title} (${variant.title}) is out of stock`,
        );
      }

      if (existing) {
        await basketItems.update(
          { id: existing.id },
          { quantity: nextQuantity },
        );
        return existing.id;
      }

      const lines = await basketItems
        .createQueryBuilder('item')
        .where('item.userId = :userId', { userId })
        .getCount();
      if (lines >= MAX_BASKET_LINES) {
        throw new BadRequestException(
          `A basket can hold at most ${MAX_BASKET_LINES} different products`,
        );
      }

      const { identifiers } = await basketItems.insert({
        user: { id: userId },
        product: { id: productId },
        variant: { id: variant.id },
        quantity: 1,
      });
      return Number(identifiers[0].id);
    });

    return this.basketItemRepository.findOneOrFail({
      where: { id: basketItemId },
      relations: { product: true, variant: true },
    });
  }

  // What a guest collected before signing in. The local basket is sent
  // once, at login, and folded into the account's basket: quantities add
  // up, and anything beyond what is in stock is trimmed rather than
  // rejected - losing the whole basket because one line went out of
  // stock is how a shop loses the sale.
  async mergeBasket(
    userId: number,
    lines: Array<{ productId: number; variantId?: number; quantity: number }>,
  ): Promise<{ merged: number; skipped: number }> {
    let merged = 0;
    let skipped = 0;

    for (const line of lines) {
      try {
        await this.dataSource.transaction(async (manager) => {
          await lockActiveProduct(manager, line.productId, 'pessimistic_read');
          const variant = await this.resolveBasketVariant(
            manager,
            line.productId,
            line.variantId,
          );
          await lockUserRow(manager, userId);

          const basketItems = manager.getRepository(BasketItem);
          const existing = await this.findBasketLine(
            basketItems,
            userId,
            variant.id,
          );
          const wanted = (existing?.quantity ?? 0) + line.quantity;
          const quantity = Math.min(wanted, variant.stock);
          if (quantity <= 0) {
            skipped += 1;
            return;
          }

          if (existing) {
            await basketItems.update({ id: existing.id }, { quantity });
          } else {
            await basketItems.insert({
              user: { id: userId },
              product: { id: line.productId },
              variant: { id: variant.id },
              quantity,
            });
          }
          merged += 1;
        });
      } catch {
        // A product that has since been deleted, or an option that is no
        // longer for sale: that line is dropped, the rest still arrives.
        skipped += 1;
      }
    }

    return { merged, skipped };
  }

  async removeProductFromBasket(
    userId: number,
    productId: number,
    variantId?: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await lockUserRow(manager, userId);

      const variant = await this.resolveBasketVariant(
        manager,
        productId,
        variantId,
      );
      const basketItems = manager.getRepository(BasketItem);
      const existing = await this.findBasketLine(
        basketItems,
        userId,
        variant.id,
      );
      if (!existing) {
        throw new NotFoundException("Product doesn't exist in basket");
      }

      if (existing.quantity > 1) {
        await basketItems.update(
          { id: existing.id },
          { quantity: existing.quantity - 1 },
        );
      } else {
        await basketItems.delete({ id: existing.id });
      }
    });
  }

  async getUserBasket(user_id: number): Promise<BasketItem[]> {
    const exists = await this.userRepository.existsBy({ id: user_id });
    if (!exists) throw new NotFoundException(`Could not find user ${user_id}`);

    return this.basketItemRepository.find({
      where: { user: { id: user_id } },
      relations: { product: true, variant: true },
      order: { created_at: 'ASC', id: 'ASC' },
    });
  }

  // A basket line is one per (user, variant): two colours of the same
  // phone are two lines, and a product with several options cannot be
  // added without saying which.
  private async resolveBasketVariant(
    manager: EntityManager,
    productId: number,
    variantId?: number,
  ): Promise<ProductVariant> {
    const variants = manager.getRepository(ProductVariant);

    if (variantId) {
      const variant = await variants.findOne({
        where: { id: variantId },
        relations: { product: true },
      });
      if (!variant || variant.product.id !== productId) {
        throw new NotFoundException(
          `Variant ${variantId} not found on product ${productId}`,
        );
      }
      if (!variant.is_active) {
        throw new BadRequestException('That option is not for sale');
      }
      return variant;
    }

    const options = await variants.find({
      where: { product: { id: productId }, is_active: true },
      order: { id: 'ASC' },
    });
    if (options.length === 0) {
      throw new BadRequestException('This product is not for sale');
    }
    if (options.length > 1) {
      throw new BadRequestException(
        `This product has ${options.length} options - say which one (variantId)`,
      );
    }
    return options[0];
  }

  private findBasketLine(
    basketItems: Repository<BasketItem>,
    userId: number,
    variantId: number,
  ): Promise<BasketItem | null> {
    return basketItems
      .createQueryBuilder('item')
      .select(['item.id', 'item.quantity'])
      .where('item.userId = :userId AND item.variant_id = :variantId', {
        userId,
        variantId,
      })
      .getOne();
  }
}
