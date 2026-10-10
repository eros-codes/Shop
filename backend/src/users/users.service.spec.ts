import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { BasketItem } from './entities/basket-item.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import userRoleEnum from './enums/userRoleEnum';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ErrorCodes } from '../common/errors/error-codes';
import { AuditService } from '../audit/audit.service';

const mockUserRepository = () => ({
  findOneBy: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  existsBy: jest.fn(),
});

const mockBasketItemRepository = () => ({
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

const mockRefreshTokenRepository = () => ({
  delete: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: ReturnType<typeof mockUserRepository>;
  let refreshTokenRepository: ReturnType<typeof mockRefreshTokenRepository>;
  let manager: Record<string, jest.Mock>;
  let basketLines: Record<string, jest.Mock>;
  let basketQb: Record<string, jest.Mock>;
  let variantRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    basketQb = {};
    for (const method of ['select', 'where'])
      basketQb[method] = jest.fn(() => basketQb);
    basketQb.getOne = jest.fn().mockResolvedValue(null);
    basketQb.getMany = jest.fn().mockResolvedValue([]);
    basketQb.getCount = jest.fn().mockResolvedValue(0);
    basketLines = {
      createQueryBuilder: jest.fn(() => basketQb),
      update: jest.fn(),
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 11 }] }),
      delete: jest.fn(),
    };
    variantRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 21,
          title: 'Default',
          stock: 5,
          is_active: true,
          product: { id: 3 },
        },
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: 21,
        title: 'Default',
        stock: 5,
        is_active: true,
        product: { id: 3 },
      }),
    };
    manager = {
      findOne: jest.fn(async (entity) =>
        entity === Product
          ? { id: 3, title: 'Test', stock: 5, is_published: true }
          : { id: 7 },
      ),
      getRepository: jest.fn((entity) =>
        entity === ProductVariant ? variantRepo : basketLines,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AuditService, useValue: { record: jest.fn() } },
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepository },
        {
          provide: getRepositoryToken(BasketItem),
          useFactory: mockBasketItemRepository,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useFactory: mockRefreshTokenRepository,
        },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn((cb: any) => cb(manager)) },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    userRepository = module.get(getRepositoryToken(User));
    refreshTokenRepository = module.get(getRepositoryToken(RefreshToken));
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('hashes the password before saving - never stores it raw', async () => {
      userRepository.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 1, mobile: '09120000000' });
      userRepository.create.mockImplementation((data) => data);
      userRepository.save.mockResolvedValue({ id: 1 });

      await service.create({
        mobile: '09120000000',
        password: 'Password123',
        display_name: 'Test User',
        role: userRoleEnum.NormalUser,
      });

      const savedArg = userRepository.create.mock.calls[0][0];
      expect(savedArg.password).not.toBe('Password123');
      expect(await bcrypt.compare('Password123', savedArg.password)).toBe(true);
    });

    it('rejects a mobile number that is already registered', async () => {
      userRepository.findOneBy.mockResolvedValue({ id: 1 });

      await expect(
        service.create({
          mobile: '09120000000',
          password: 'Password123',
          display_name: 'Test User',
          role: userRoleEnum.NormalUser,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('never returns the password hash, even though save() would include it', async () => {
      userRepository.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 1,
          mobile: '09120000000',
          display_name: 'Test User',
        });
      userRepository.create.mockImplementation((data) => data);
      userRepository.save.mockResolvedValue({ id: 1, password: 'some-hash' });

      const result = await service.create({
        mobile: '09120000000',
        password: 'Password123',
        display_name: 'Test User',
        role: userRoleEnum.NormalUser,
      });

      expect(result).not.toHaveProperty('password');
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: 1 });
    });
  });

  describe('update', () => {
    it('updates display_name without ever touching role', async () => {
      userRepository.update.mockResolvedValue({ affected: 1 });
      userRepository.findOneBy.mockResolvedValue({
        id: 1,
        display_name: 'New Name',
      });

      await service.update(1, { display_name: 'New Name' });

      const updateArg = userRepository.update.mock.calls[0][1];
      expect(updateArg).not.toHaveProperty('role');
      expect(updateArg.display_name).toBe('New Name');
    });

    it('hashes a new password if one is provided, and revokes existing sessions', async () => {
      userRepository.update.mockResolvedValue({ affected: 1 });
      userRepository.findOneBy.mockResolvedValue({ id: 1 });

      await service.update(1, { password: 'NewPassword123' });

      const updateArg = userRepository.update.mock.calls[0][1];
      expect(updateArg.password).not.toBe('NewPassword123');
      expect(await bcrypt.compare('NewPassword123', updateArg.password)).toBe(
        true,
      );
      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        user: { id: 1 },
      });
    });

    it('does NOT revoke sessions when only display_name changes', async () => {
      userRepository.update.mockResolvedValue({ affected: 1 });
      userRepository.findOneBy.mockResolvedValue({ id: 1 });

      await service.update(1, { display_name: 'New Name' });

      expect(refreshTokenRepository.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a non-existent user', async () => {
      userRepository.update.mockResolvedValue({ affected: 0 });

      await expect(service.update(999, { display_name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateRole', () => {
    it("revokes the user's sessions so a demotion takes effect", async () => {
      userRepository.update.mockResolvedValue({ affected: 1 });
      userRepository.findOneBy.mockResolvedValue({ id: 5, role: 'user' });

      await service.updateRole(5, userRoleEnum.NormalUser);

      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        user: { id: 5 },
      });
    });
  });

  describe('remove', () => {
    it('anonymizes personal data then soft-deletes, instead of hard-deleting', async () => {
      userRepository.findOneBy.mockResolvedValue({
        id: 5,
        mobile: '09121234567',
      });
      userRepository.update.mockResolvedValue({ affected: 1 });
      userRepository.softDelete.mockResolvedValue({ affected: 1 });

      await service.remove(5);

      const updateArg = userRepository.update.mock.calls[0][1];
      expect(updateArg.mobile).toBe('deleted_5');
      expect(updateArg.display_name).toBe('Deleted User');
      expect(updateArg.password).toBeDefined();
      expect(userRepository.softDelete).toHaveBeenCalledWith(5);
    });

    it('deletes refresh tokens explicitly, since soft-delete never triggers CASCADE', async () => {
      userRepository.findOneBy.mockResolvedValue({
        id: 5,
        mobile: '09121234567',
      });
      userRepository.update.mockResolvedValue({ affected: 1 });
      userRepository.softDelete.mockResolvedValue({ affected: 1 });

      await service.remove(5);

      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        user: { id: 5 },
      });
    });

    it('throws NotFoundException for a non-existent user', async () => {
      userRepository.findOneBy.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
  describe('basket', () => {
    it('adds a new line with quantity 1 under the product and user locks', async () => {
      await service.addProductToBasket(7, 3);

      expect(manager.findOne).toHaveBeenCalledWith(
        Product,
        expect.objectContaining({ lock: { mode: 'pessimistic_read' } }),
      );
      expect(manager.findOne).toHaveBeenCalledWith(
        User,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(basketLines.insert).toHaveBeenCalledWith({
        user: { id: 7 },
        product: { id: 3 },
        variant: { id: 21 },
        quantity: 1,
      });
    });

    it('increments an existing line in place instead of loading the whole basket', async () => {
      basketQb.getOne.mockResolvedValue({ id: 11, quantity: 2 });

      await service.addProductToBasket(7, 3);

      expect(basketLines.update).toHaveBeenCalledWith(
        { id: 11 },
        { quantity: 3 },
      );
      expect(basketLines.insert).not.toHaveBeenCalled();
      expect(userRepository.findOne).not.toHaveBeenCalled();
    });

    it('never reserves stock, but refuses more than is in stock', async () => {
      basketQb.getOne.mockResolvedValue({ id: 11, quantity: 5 });

      await expect(service.addProductToBasket(7, 3)).rejects.toThrow(
        BadRequestException,
      );
      expect(basketLines.update).not.toHaveBeenCalled();
    });

    it('refuses a deleted product', async () => {
      manager.findOne.mockImplementation(async (entity) =>
        entity === Product ? null : { id: 7 },
      );

      await expect(service.addProductToBasket(7, 3)).rejects.toThrow(
        NotFoundException,
      );
      expect(basketLines.insert).not.toHaveBeenCalled();
    });

    it('refuses a product the shop has unpublished', async () => {
      manager.findOne.mockImplementation(async (entity) =>
        entity === Product
          ? { id: 3, title: 'Draft', stock: 5, is_published: false }
          : { id: 7 },
      );

      await expect(service.addProductToBasket(7, 3)).rejects.toMatchObject({
        code: ErrorCodes.VARIANT_NOT_FOR_SALE,
      });
      expect(basketLines.insert).not.toHaveBeenCalled();
    });

    it('caps the number of different products in a basket', async () => {
      basketQb.getCount.mockResolvedValue(100);

      await expect(service.addProductToBasket(7, 3)).rejects.toThrow(
        BadRequestException,
      );
      expect(basketLines.insert).not.toHaveBeenCalled();
    });

    it('decrements, then deletes the last unit', async () => {
      basketQb.getMany.mockResolvedValueOnce([{ id: 11, quantity: 2 }]);
      await service.removeProductFromBasket(7, 3);
      expect(basketLines.update).toHaveBeenCalledWith(
        { id: 11 },
        { quantity: 1 },
      );

      basketQb.getMany.mockResolvedValueOnce([{ id: 11, quantity: 1 }]);
      await service.removeProductFromBasket(7, 3);
      expect(basketLines.delete).toHaveBeenCalledWith({ id: 11 });
    });

    it('is a 404 when the product is not in the basket', async () => {
      await expect(service.removeProductFromBasket(7, 3)).rejects.toThrow(
        NotFoundException,
      );
    });

    // The shop switched the option off after it went into the basket. The
    // line still has to come out - checkout refuses it.
    it('removes a line whose option is no longer for sale', async () => {
      basketQb.getOne.mockResolvedValueOnce({ id: 11, quantity: 1 });

      await service.removeProductFromBasket(7, 3, 21);

      expect(basketLines.delete).toHaveBeenCalledWith({ id: 11 });
      expect(variantRepo.findOne).not.toHaveBeenCalled();
    });

    it('asks which option when the product has several lines', async () => {
      basketQb.getMany.mockResolvedValueOnce([
        { id: 11, quantity: 1 },
        { id: 12, quantity: 1 },
      ]);

      await expect(service.removeProductFromBasket(7, 3)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
