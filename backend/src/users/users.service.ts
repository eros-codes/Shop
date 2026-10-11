import {
  BadRequestException,
  HttpStatus,
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
import {
  assertPublished,
  lockActiveProduct,
} from '../products/utils/product-locks';
import { lockUserRow } from './utils/lock-user-row';
import { isDemoMode, isLockedDemoAccount } from '../common/demo/demo-accounts';
import { AppError } from '../common/errors/app-error';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { escapeLikePattern } from '../products/utils/product-search';
import { toAsciiDigits } from '../common/validation/normalize';
import { ErrorCodes } from '../common/errors/error-codes';
import { isDuplicateEntryError } from '../common/database/mysql-errors';

const mobileTaken = () =>
  AppError.conflict(
    ErrorCodes.MOBILE_ALREADY_REGISTERED,
    'An account with this mobile number already exists',
  );

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

  // Staff creating an account from the panel. Recorded in the audit log -
  // above all when it is another admin, which is as much access as a role
  // change grants and that one was always logged.
  async create(createUserDto: CreateUserDto, actor?: AuditActor) {
    const alreadyUser = await this.findOneByMobile(createUserDto.mobile);
    if (alreadyUser) throw mobileTaken();
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const newUser = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });
    let saved: User;
    try {
      saved = await this.userRepository.save(newUser);
    } catch (error) {
      // Registered in the moment between the check and the insert.
      if (isDuplicateEntryError(error)) throw mobileTaken();
      throw error;
    }

    await this.auditService.record({
      action: 'user.created',
      entityType: 'user',
      entityId: saved.id,
      actor,
      changes: {
        role: saved.role ?? createUserDto.role ?? userRoleEnum.NormalUser,
      },
    });

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
  // On a public demo, refuse anything that would lock other visitors out of
  // a shared demo account. A no-op on a real shop, where DEMO_MODE is unset.
  private async assertNotLockedDemoAccount(id: number): Promise<void> {
    if (!isDemoMode()) return;
    const user = await this.userRepository.findOne({
      select: { id: true, mobile: true },
      where: { id },
    });
    if (user && isLockedDemoAccount(user.mobile)) {
      throw new AppError(
        ErrorCodes.DEMO_ACCOUNT_LOCKED,
        'This is a shared demo account - its password, role and existence cannot be changed on the demo',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async setPassword(id: number, hashedPassword: string): Promise<void> {
    // Every password write goes through here - the reset, the signed-in
    // change and an admin setting one - so this is the one place that has
    // to retire the tokens already issued.
    await this.assertNotLockedDemoAccount(id);
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

  // Paged with a total, like every other admin list. It used to return a
  // bare array, so the panel could never show past the first page, and its
  // search box sent a `search` the DTO rejected.
  async findAll(query: FilterUserDto): Promise<PaginatedResult<User>> {
    const { role, search, page, limit } = query;
    const userQuery = this.userRepository
      .createQueryBuilder('users')
      .orderBy('users.id', 'DESC');
    if (role) {
      userQuery.andWhere('users.role = :role', { role });
    }
    if (search) {
      userQuery.andWhere(
        '(users.mobile LIKE :term OR users.display_name LIKE :term)',
        { term: `%${escapeLikePattern(toAsciiDigits(search))}%` },
      );
    }
    const [items, total] = await userQuery
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
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

    if (Object.keys(safeUpdate).length) {
      const result = await this.userRepository.update({ id }, safeUpdate);
      if (result.affected === 0) {
        throw new NotFoundException(`Could not find user ${id}`);
      }
    }

    // This used to hash and write the password itself, which skipped
    // setPassword - so tokens issued before the change stayed valid. It now
    // goes through the same single path as every other password write.
    if (password) {
      await this.setPassword(id, await bcrypt.hash(password, 10));
      await this.refreshTokenRepository.delete({ user: { id } });
    }

    return await this.findOne(id);
  }

  async updateRole(id: number, role: userRoleEnum, actor?: AuditActor) {
    await this.assertNotLockedDemoAccount(id);
    // One click in the panel used to be enough to take an admin's rights
    // away from themselves - or from the only admin there was, leaving a
    // shop nobody could run without a shell on the server.
    if (actor?.userId === id) {
      throw new AppError(
        ErrorCodes.CANNOT_CHANGE_OWN_ROLE,
        'You cannot change your own role - ask another admin',
        HttpStatus.FORBIDDEN,
      );
    }
    const before = await this.userRepository.findOne({
      select: { id: true, role: true },
      where: { id },
    });
    if (
      before?.role === userRoleEnum.AdminUser &&
      role !== userRoleEnum.AdminUser
    ) {
      const admins = await this.userRepository.count({
        where: { role: userRoleEnum.AdminUser },
      });
      if (admins <= 1) {
        throw AppError.conflict(
          ErrorCodes.LAST_ADMIN,
          'This is the only admin - make someone else an admin first',
        );
      }
    }
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
    await this.assertNotLockedDemoAccount(id);
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
    quantity = 1,
  ): Promise<BasketItem> {
    const basketItemId = await this.dataSource.transaction(async (manager) => {
      const product = await lockActiveProduct(
        manager,
        productId,
        'pessimistic_read',
      );
      assertPublished(product);
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
      const nextQuantity = (existing?.quantity ?? 0) + quantity;

      // The same code and details as checkout's stock refusal, so the
      // storefront can say which option and how many are left - as a plain
      // 400 it read "invalid request".
      if (nextQuantity > variant.stock) {
        throw AppError.badRequest(
          ErrorCodes.INSUFFICIENT_STOCK,
          variant.stock > 0
            ? `Only ${variant.stock} of ${product.title} (${variant.title}) are in stock`
            : `${product.title} (${variant.title}) is out of stock`,
          {
            productId: product.id,
            variantId: variant.id,
            productTitle: product.title,
            variantTitle: variant.title,
            available: variant.stock,
            requested: nextQuantity,
          },
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
        quantity,
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
          assertPublished(
            await lockActiveProduct(
              manager,
              line.productId,
              'pessimistic_read',
            ),
          );
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

  // Takes `quantity` units off the line (one by default); a line that
  // reaches zero is removed, so sending its whole quantity removes it.
  async removeProductFromBasket(
    userId: number,
    productId: number,
    variantId?: number,
    quantity = 1,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await lockUserRow(manager, userId);

      // Found by what is in the basket, not by what is on sale. This used
      // to go through the "is this option for sale" check, so a line whose
      // option the shop had since switched off could never be removed - and
      // checkout refused it too, leaving the customer stuck.
      const basketItems = manager.getRepository(BasketItem);
      let existing: BasketItem | null;
      if (variantId) {
        existing = await this.findBasketLine(basketItems, userId, variantId);
      } else {
        const lines = await basketItems
          .createQueryBuilder('item')
          .select(['item.id', 'item.quantity'])
          .where('item.userId = :userId AND item.productId = :productId', {
            userId,
            productId,
          })
          .getMany();
        if (lines.length > 1) {
          throw new BadRequestException(
            `This product has ${lines.length} options in your basket - say which one (variantId)`,
          );
        }
        existing = lines[0] ?? null;
      }
      if (!existing) {
        throw new NotFoundException("Product doesn't exist in basket");
      }

      if (existing.quantity > quantity) {
        await basketItems.update(
          { id: existing.id },
          { quantity: existing.quantity - quantity },
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
      // The images come along so the basket can show what is in it - the
      // cart and checkout drew an empty frame for every line without them.
      relations: { product: { images: true }, variant: true },
      order: {
        created_at: 'ASC',
        id: 'ASC',
        product: { images: { order: 'ASC' } },
      },
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
