import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { DiscountCodesService } from './discount-codes.service';
import { DiscountCode } from './entities/discount-code.entity';
import DiscountStatusEnum from './enums/discount-status.enum';
import { AuditService } from '../audit/audit.service';
import { Order } from '../orders/entities/order.entity';

describe('DiscountCodesService', () => {
  let service: DiscountCodesService;
  let repo: {
    findOneBy: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
    softDelete: jest.Mock;
    findAndCount: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let qb: Record<string, jest.Mock>;
  let ordersRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    repo = {
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve({ id: 1, ...d })),
      find: jest.fn(),
      delete: jest.fn(),
      softDelete: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      createQueryBuilder: jest.fn(() => qb),
    };
    ordersRepo = { count: jest.fn().mockResolvedValue(0) };
    qb = {};
    for (const method of ['update', 'set', 'where'])
      qb[method] = jest.fn(() => qb);
    qb.execute = jest.fn().mockResolvedValue({ affected: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AuditService, useValue: { record: jest.fn() } },
        DiscountCodesService,
        { provide: getRepositoryToken(DiscountCode), useValue: repo },
        { provide: getRepositoryToken(Order), useValue: ordersRepo },
      ],
    }).compile();

    service = module.get(DiscountCodesService);
  });

  describe('create', () => {
    it('turns the unique-index violation into a 409', async () => {
      repo.save.mockRejectedValue(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('dup'), {
            code: 'ER_DUP_ENTRY',
            errno: 1062,
          }),
        ),
      );

      await expect(
        service.create({ code: 'SAVE10', capacity: 10, off_percent: 10 }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a new code when it does not already exist', async () => {
      repo.findOneBy.mockResolvedValue(null);

      const result = await service.create({
        code: 'SAVE20',
        capacity: 5,
        off_percent: 20,
      });

      expect(result.code).toBe('SAVE20');
    });
  });

  describe('findValidByCode', () => {
    it('rejects a code that does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findValidByCode('NOPE')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an inactive code', async () => {
      repo.findOne.mockResolvedValue({
        code: 'OLD',
        status: DiscountStatusEnum.Inactive,
        capacity: 5,
      });
      await expect(service.findValidByCode('OLD')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a code with zero capacity left', async () => {
      repo.findOne.mockResolvedValue({
        code: 'USED',
        status: DiscountStatusEnum.Active,
        capacity: 0,
      });
      await expect(service.findValidByCode('USED')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts an active code with capacity remaining', async () => {
      const code = {
        code: 'GOOD',
        status: DiscountStatusEnum.Active,
        capacity: 3,
      };
      repo.findOne.mockResolvedValue(code);
      await expect(service.findValidByCode('GOOD')).resolves.toEqual(code);
    });
  });

  describe('consumeOne', () => {
    it('takes a use with one conditional UPDATE that re-checks capacity', async () => {
      const code = { id: 4, capacity: 3, status: DiscountStatusEnum.Active };

      await service.consumeOne(code as any);

      expect(qb.where).toHaveBeenCalledWith(
        'id = :id AND capacity > 0 AND status = :status AND deleted_at IS NULL',
        { id: 4, status: DiscountStatusEnum.Active },
      );
      expect(code.capacity).toBe(2);
    });

    it('refuses when the row no longer qualifies, instead of going negative', async () => {
      qb.execute.mockResolvedValue({ affected: 0 });
      const code = { id: 4, capacity: 1, status: DiscountStatusEnum.Active };

      await expect(service.consumeOne(code as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('releaseOne', () => {
    it('gives the use back when the order that held it is gone', async () => {
      await service.releaseOne(4);

      expect(qb.set).toHaveBeenCalledWith({ capacity: expect.any(Function) });
      expect(qb.where).toHaveBeenCalledWith('id = :id', { id: 4 });
    });
  });

  describe('remove', () => {
    it('soft-deletes so orders can still resolve the code they used', async () => {
      repo.softDelete.mockResolvedValue({ affected: 1 });

      await service.remove(4);

      expect(repo.softDelete).toHaveBeenCalledWith({ id: 4 });
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a code that does not exist', async () => {
      repo.softDelete.mockResolvedValue({ affected: 0 });
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('the rules a code carries', () => {
    const code = (overrides: Record<string, unknown> = {}) => ({
      id: 1,
      code: 'SAVE20',
      capacity: 10,
      status: DiscountStatusEnum.Active,
      type: 'percent',
      off_percent: 20,
      products: [],
      categories: [],
      ...overrides,
    });
    const basket = [
      { productId: 1, categoryIds: [5], lineTotal: 300_000 },
      { productId: 2, categoryIds: [9], lineTotal: 200_000 },
    ];
    const quote = (overrides: Record<string, unknown> = {}) => {
      repo.findOne.mockResolvedValue(code(overrides));
      return service.quoteForOrder({
        code: 'SAVE20',
        userId: 7,
        lines: basket,
      });
    };

    it('takes a percentage of the whole basket when nothing limits it', async () => {
      expect((await quote()).amount).toBe(100_000);
    });

    it('stops at the ceiling the campaign set', async () => {
      expect((await quote({ max_discount_amount: 50_000 })).amount).toBe(
        50_000,
      );
    });

    it('takes a fixed amount off, in Toman', async () => {
      expect(
        (await quote({ type: 'fixed', off_amount: 80_000, off_percent: 0 }))
          .amount,
      ).toBe(80_000);
    });

    it('never takes off more than the goods are worth', async () => {
      const amount = (
        await quote({ type: 'fixed', off_amount: 900_000, off_percent: 0 })
      ).amount;
      expect(amount).toBe(500_000);
    });

    it('only touches the lines it is scoped to', async () => {
      expect((await quote({ products: [{ id: 2 }] })).amount).toBe(40_000);
    });

    it('matches by category as well', async () => {
      expect((await quote({ categories: [{ id: 5 }] })).amount).toBe(60_000);
    });

    it('refuses a basket it does not apply to at all', async () => {
      await expect(quote({ products: [{ id: 99 }] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses an order below the minimum', async () => {
      await expect(quote({ min_order_amount: 1_000_000 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a campaign that has not started', async () => {
      await expect(
        quote({ starts_at: new Date(Date.now() + 86_400_000) }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses one that has ended', async () => {
      await expect(
        quote({ expires_at: new Date(Date.now() - 86_400_000) }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a customer who has had their share already', async () => {
      ordersRepo.count.mockResolvedValue(2);

      await expect(quote({ per_user_limit: 2 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows one more while the customer is under the limit', async () => {
      ordersRepo.count.mockResolvedValue(1);

      expect((await quote({ per_user_limit: 2 })).amount).toBe(100_000);
    });
  });

  describe('creating a code with rules', () => {
    it('refuses a fixed code with no amount', async () => {
      await expect(
        service.create({ code: 'X', capacity: 1, type: 'fixed' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a percentage code with no percentage', async () => {
      await expect(service.create({ code: 'X', capacity: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a window that ends before it starts', async () => {
      await expect(
        service.create({
          code: 'X',
          capacity: 1,
          off_percent: 10,
          starts_at: '2026-05-01T00:00:00Z',
          expires_at: '2026-04-01T00:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
