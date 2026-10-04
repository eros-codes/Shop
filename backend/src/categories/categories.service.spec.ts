import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, IsNull, QueryFailedError } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { Product } from '../products/entities/product.entity';
import {
  CatalogCacheScope,
  CatalogCacheService,
} from '../common/cache/catalog-cache.service';

const duplicateEntry = () =>
  new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('Duplicate entry'), {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
    }),
  );

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoriesRepo: Record<string, jest.Mock>;
  let catalogCache: { invalidate: jest.Mock };
  let manager: Record<string, jest.Mock>;
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    categoriesRepo = {
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 4 }] }),
      findOneBy: jest.fn().mockResolvedValue({ id: 4, title: 'Phones' }),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
    };
    catalogCache = { invalidate: jest.fn() };
    qb = {};
    for (const method of ['select', 'innerJoin', 'where', 'delete', 'from'])
      qb[method] = jest.fn(() => qb);
    qb.getRawMany = jest.fn();
    qb.execute = jest.fn();
    manager = {
      findOne: jest.fn(),
      find: jest.fn(),
      softDelete: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(() => qb),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: categoriesRepo },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn((cb: any) => cb(manager)) },
        },
        { provide: CatalogCacheService, useValue: catalogCache },
      ],
    }).compile();

    service = moduleRef.get(CategoriesService);
  });

  describe('create', () => {
    it('turns the unique-index violation into a 409', async () => {
      categoriesRepo.insert.mockRejectedValue(duplicateEntry());

      await expect(service.create({ title: 'Phones' })).rejects.toThrow(
        ConflictException,
      );
      expect(catalogCache.invalidate).not.toHaveBeenCalled();
    });

    it('creates and invalidates the category cache', async () => {
      const result = await service.create({ title: 'Phones' });

      expect(result).toEqual({ id: 4, title: 'Phones' });
      expect(catalogCache.invalidate).toHaveBeenCalledWith(
        CatalogCacheScope.Categories,
      );
    });
  });

  describe('findAll / findOne', () => {
    it('never loads the products of a category', async () => {
      await service.findAll({ page: 1, limit: 10 });
      expect(
        categoriesRepo.findAndCount.mock.calls[0][0].relations,
      ).toBeUndefined();
    });

    it('throws NotFoundException for a category that does not exist', async () => {
      categoriesRepo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('only updates a live row and invalidates both scopes', async () => {
      await service.update(4, { title: 'Mobiles' });

      expect(categoriesRepo.update).toHaveBeenCalledWith(
        { id: 4, deleted_at: IsNull() },
        { title: 'Mobiles' },
      );
      expect(catalogCache.invalidate).toHaveBeenCalledWith(
        CatalogCacheScope.Categories,
        CatalogCacheScope.Products,
      );
    });

    it('is a 404 when nothing live matched', async () => {
      categoriesRepo.update.mockResolvedValue({ affected: 0 });
      categoriesRepo.findOneBy.mockResolvedValue(null);

      await expect(service.update(4, { title: 'Mobiles' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('is a 409 for a title another live category has', async () => {
      categoriesRepo.update.mockRejectedValue(duplicateEntry());
      await expect(service.update(4, { title: 'Phones' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove - only the category', () => {
    it('is a single soft delete of a live row', async () => {
      await service.remove(4);

      expect(categoriesRepo.softDelete).toHaveBeenCalledWith({
        id: 4,
        deleted_at: IsNull(),
      });
      expect(catalogCache.invalidate).toHaveBeenCalledWith(
        CatalogCacheScope.Categories,
        CatalogCacheScope.Products,
      );
    });

    it('is a 404 for a missing or already deleted category', async () => {
      categoriesRepo.softDelete.mockResolvedValue({ affected: 0 });
      await expect(service.remove(4)).rejects.toThrow(NotFoundException);
    });
  });

  describe('the category tree', () => {
    it('nests children under their parent and leaves roots at the top', async () => {
      categoriesRepo.find.mockResolvedValue([
        { id: 1, title: 'Digital', slug: 'digital', parent: null },
        { id: 2, title: 'Mobile', slug: 'mobile', parent: { id: 1 } },
        { id: 3, title: 'Samsung', slug: 'samsung', parent: { id: 2 } },
        { id: 4, title: 'Books', slug: 'books', parent: null },
      ]);

      const tree = await service.findTree();

      expect(tree.map((node) => node.id).sort()).toEqual([1, 4]);
      expect(tree.find((n) => n.id === 1)!.children[0].children[0].id).toBe(3);
    });

    it('collects a category with everything under it', async () => {
      categoriesRepo.find.mockResolvedValue([
        { id: 1, parent: null },
        { id: 2, parent: { id: 1 } },
        { id: 3, parent: { id: 2 } },
        { id: 4, parent: null },
      ]);

      expect((await service.getDescendantIds(1)).sort()).toEqual([1, 2, 3]);
    });

    it('survives a loop in the data instead of hanging', async () => {
      categoriesRepo.find.mockResolvedValue([
        { id: 1, parent: { id: 2 } },
        { id: 2, parent: { id: 1 } },
      ]);

      expect((await service.getDescendantIds(1)).sort()).toEqual([1, 2]);
    });

    it('refuses to move a category under its own descendant', async () => {
      categoriesRepo.find.mockResolvedValue([
        { id: 1, parent: null },
        { id: 2, parent: { id: 1 } },
      ]);

      await expect(service.update(1, { parentId: 2 })).rejects.toThrow(
        BadRequestException,
      );
      expect(categoriesRepo.update).not.toHaveBeenCalled();
    });

    it('refuses to delete a category that still has children', async () => {
      categoriesRepo.count.mockResolvedValue(2);

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
      expect(categoriesRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('removeWithProds', () => {
    it('soft-deletes only the products that belong to no other live category', async () => {
      manager.findOne.mockResolvedValue({ id: 4 });
      qb.getRawMany
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
        .mockResolvedValueOnce([{ id: 2 }]);

      const result = await service.removeWithProds(4);

      expect(manager.find).toHaveBeenCalledWith(
        Product,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(manager.softDelete).toHaveBeenCalledWith(Product, { id: In([1]) });
      expect(manager.softDelete).toHaveBeenCalledWith(Category, { id: 4 });
      expect(qb.where).toHaveBeenCalledWith('productId IN (:...exclusiveIds)', {
        exclusiveIds: [1],
      });
      expect(result).toEqual({ deletedProducts: 1 });
    });

    it('throws NotFoundException inside the transaction for a missing category', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.removeWithProds(999)).rejects.toThrow(
        NotFoundException,
      );
      expect(manager.softDelete).not.toHaveBeenCalled();
    });
  });
});
