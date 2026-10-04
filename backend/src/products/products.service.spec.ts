import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, IsNull } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { BookmarkProduct } from './entities/product-bookmark.entity';
import { Category } from '../categories/entities/category.entity';
import { UsersService } from '../users/users.service';
import { FileStorage } from '../common/storage/file-storage';
import {
  CatalogCacheScope,
  CatalogCacheService,
} from '../common/cache/catalog-cache.service';
import { CategoriesService } from '../categories/categories.service';
import { AuditService } from '../audit/audit.service';
import { AttributesService } from '../attributes/attributes.service';

function makeQueryBuilder() {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'delete',
    'from',
    'update',
    'set',
    'orderBy',
    'addOrderBy',
    'offset',
    'limit',
    'relation',
    'of',
    'leftJoinAndMapOne',
    'leftJoin',
    'innerJoin',
  ]) {
    qb[method] = jest.fn(() => qb);
  }
  qb.execute = jest.fn().mockResolvedValue({ affected: 1 });
  qb.getOne = jest.fn().mockResolvedValue(null);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  qb.loadMany = jest.fn().mockResolvedValue([]);
  qb.addAndRemove = jest.fn().mockResolvedValue(undefined);
  return qb;
}

describe('ProductsService', () => {
  let service: ProductsService;
  let productsRepo: Record<string, jest.Mock>;
  let manager: Record<string, jest.Mock>;
  let variantRepo: Record<string, jest.Mock>;
  let qb: Record<string, jest.Mock>;
  let fileStorage: Record<string, jest.Mock>;
  let catalogCache: { invalidate: jest.Mock };

  const png = {
    buffer: Buffer.from('png'),
    extension: 'png' as const,
    mimeType: 'image/png',
    size: 3,
  };
  const jpg = {
    buffer: Buffer.from('jpg'),
    extension: 'jpg' as const,
    mimeType: 'image/jpeg',
    size: 3,
  };

  beforeEach(async () => {
    qb = makeQueryBuilder();
    variantRepo = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 21, ...data })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(1),
      delete: jest.fn(),
    };
    manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn(() => variantRepo),
      create: jest.fn((_entity, data) => ({ ...data })),
      save: jest.fn(async (entity) => ({ id: 1, ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 1 }] }),
      maximum: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    productsRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 1, categories: [], images: [] }),
      find: jest.fn().mockResolvedValue([]),
      existsBy: jest.fn().mockResolvedValue(true),
      createQueryBuilder: jest.fn(() => qb),
    };
    fileStorage = {
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      getPublicUrl: jest.fn(
        (key: string) => `http://localhost:3000/uploads/${key}`,
      ),
    };
    catalogCache = { invalidate: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: AttributesService,
          useValue: {
            resolveAxisValues: jest.fn().mockResolvedValue([]),
            assertRequiredAxesAnswered: jest.fn(),
            replaceVariantValues: jest.fn(),
            replaceProductValues: jest.fn(),
            optionsCacheOf: jest.fn().mockReturnValue(null),
            labelOf: jest.fn().mockReturnValue(''),
          },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        { provide: UsersService, useValue: {} },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn((cb: any) => cb(manager)) },
        },
        { provide: FileStorage, useValue: fileStorage },
        { provide: CatalogCacheService, useValue: catalogCache },
        {
          provide: CategoriesService,
          useValue: {
            getDescendantIds: jest.fn(async (id: number) => [id]),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  describe('create', () => {
    it('rejects invalid category IDs without writing anything', async () => {
      manager.find.mockResolvedValue([{ id: 1 }]);

      await expect(
        service.create({
          title: 'x',
          description: 'y',
          price: 10,
          stock: 5,
          categoryIds: [1, 2],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
      expect(catalogCache.invalidate).not.toHaveBeenCalled();
    });

    it('locks the categories it links and invalidates the cache after saving', async () => {
      manager.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await service.create({
        title: 'x',
        description: 'y',
        price: 10,
        stock: 5,
        categoryIds: [1, 2],
      });

      expect(manager.find).toHaveBeenCalledWith(
        Category,
        expect.objectContaining({ lock: { mode: 'pessimistic_read' } }),
      );
      expect(catalogCache.invalidate).toHaveBeenCalledWith(
        CatalogCacheScope.Products,
      );
      expect(manager.save.mock.invocationCallOrder[0]).toBeLessThan(
        catalogCache.invalidate.mock.invocationCallOrder[0],
      );
    });
  });

  describe('findAll', () => {
    it('answers a search with no searchable characters with an empty page, without querying', async () => {
      const result = await service.findAll({
        search: '+-*"',
        page: 1,
        limit: 10,
      });

      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });
      expect(qb.getManyAndCount).not.toHaveBeenCalled();
    });

    it('uses the fulltext index for long words and LIKE only for short ones', async () => {
      await service.findAll({ search: 'iPhone 13', page: 1, limit: 10 });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'MATCH(product.title) AGAINST (:fullTextQuery IN BOOLEAN MODE)',
        { fullTextQuery: '+iphone*' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'product.title LIKE :titlePattern0',
        { titlePattern0: '%13%' },
      );
    });

    it('selects a cover image instead of every image', async () => {
      await service.findAll({ page: 1, limit: 10 });

      expect(qb.leftJoinAndMapOne).toHaveBeenCalledWith(
        'product.coverImage',
        'product.images',
        'cover',
        'cover.order = 0',
      );
      expect(qb.addOrderBy).toHaveBeenCalledWith('product.id', 'DESC');
    });
  });

  describe('update', () => {
    it('is a 404 - not a resurrection - when the product was deleted meanwhile', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.update(1, { price: 20 })).rejects.toThrow(
        NotFoundException,
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('updates only the given columns, and only on a live row', async () => {
      manager.findOne.mockResolvedValue({ id: 1 });

      await service.update(1, { price: 20 });

      expect(manager.update).toHaveBeenCalledWith(
        Product,
        { id: 1, deleted_at: IsNull() },
        { price: 20 },
      );
      expect(manager.save).not.toHaveBeenCalled();
      expect(catalogCache.invalidate).toHaveBeenCalledWith(
        CatalogCacheScope.Products,
      );
    });

    it('adds and removes only the category links that changed', async () => {
      manager.find.mockResolvedValue([{ id: 2 }, { id: 3 }]);
      manager.findOne.mockResolvedValue({ id: 1 });
      qb.loadMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await service.update(1, { categoryIds: [2, 3] });

      expect(qb.addAndRemove).toHaveBeenCalledWith([3], [1]);
    });
  });

  describe('remove', () => {
    it('soft-deletes, clears basket lines in the same transaction, keeps image files', async () => {
      manager.findOne.mockResolvedValue({ id: 5 });

      await service.remove(5);

      expect(manager.softDelete).toHaveBeenCalledWith(Product, { id: 5 });
      expect(qb.where).toHaveBeenCalledWith('productId = :id', { id: 5 });
      expect(qb.execute).toHaveBeenCalled();
      expect(fileStorage.delete).not.toHaveBeenCalled();
      expect(catalogCache.invalidate).toHaveBeenCalledWith(
        CatalogCacheScope.Products,
      );
    });

    it('throws NotFoundException for a product that does not exist', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(manager.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('addImages', () => {
    it('continues positions after the current highest one, under the product lock', async () => {
      manager.findOne.mockResolvedValue({ id: 1 });
      manager.maximum.mockResolvedValue(2);

      await service.addImages(1, [png, jpg]);

      expect(manager.findOne).toHaveBeenCalledWith(
        Product,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      const [entity, rows] = manager.insert.mock.calls[0];
      expect(entity).toBe(ProductImage);
      expect(rows.map((row: any) => row.order)).toEqual([3, 4]);
      expect(rows[0].filename).toMatch(/\.png$/);
      expect(rows[1].filename).toMatch(/\.jpg$/);
      expect(fileStorage.save).toHaveBeenCalledTimes(2);
    });

    it('starts at position 0 for a product without images', async () => {
      manager.findOne.mockResolvedValue({ id: 1 });
      manager.maximum.mockResolvedValue(null);

      await service.addImages(1, [png]);

      expect(manager.insert.mock.calls[0][1][0].order).toBe(0);
    });

    it('removes the files it wrote when the database part fails', async () => {
      manager.findOne.mockResolvedValue({ id: 1 });
      manager.maximum.mockResolvedValue(0);
      manager.insert.mockRejectedValue(new Error('db down'));

      await expect(service.addImages(1, [png, jpg])).rejects.toThrow('db down');

      const savedKeys = fileStorage.save.mock.calls.map((call) => call[0]);
      expect(fileStorage.delete.mock.calls.map((call) => call[0])).toEqual(
        savedKeys,
      );
      expect(catalogCache.invalidate).not.toHaveBeenCalled();
    });

    it('is a 404 before any file is written for a missing product', async () => {
      productsRepo.existsBy.mockResolvedValue(false);

      await expect(service.addImages(9, [png])).rejects.toThrow(
        NotFoundException,
      );
      expect(fileStorage.save).not.toHaveBeenCalled();
    });
  });

  describe('removeImage', () => {
    it('deletes the row, closes the gap, and only then deletes the file', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce({ id: 9, filename: 'a.png', order: 1 });

      await service.removeImage(1, 9);

      expect(manager.delete).toHaveBeenCalledWith(ProductImage, { id: 9 });
      expect(qb.where).toHaveBeenCalledWith(
        'productId = :productId AND `order` > :removedOrder',
        {
          productId: 1,
          removedOrder: 1,
        },
      );
      expect(qb.orderBy).toHaveBeenCalledWith('`order`', 'ASC');
      expect(fileStorage.delete).toHaveBeenCalledWith('products/a.png');
      expect(manager.delete.mock.invocationCallOrder[0]).toBeLessThan(
        fileStorage.delete.mock.invocationCallOrder[0],
      );
    });

    it('throws NotFoundException for an image not on that product, keeping every file', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(null);

      await expect(service.removeImage(1, 999)).rejects.toThrow(
        NotFoundException,
      );
      expect(fileStorage.delete).not.toHaveBeenCalled();
    });
  });

  describe('toggleBookmark', () => {
    it('creates a bookmark when none exists', async () => {
      manager.findOne.mockResolvedValue({ id: 1 });
      qb.getOne.mockResolvedValue(null);

      const result = await service.toggleBookmark(7, { product_id: 1 });

      expect(result.bookmarked).toBe(true);
      expect(manager.insert).toHaveBeenCalledWith(BookmarkProduct, {
        user: { id: 7 },
        product: { id: 1 },
      });
    });

    it('removes the bookmark when one already exists', async () => {
      manager.findOne.mockResolvedValue({ id: 1 });
      qb.getOne.mockResolvedValue({ id: 3 });

      const result = await service.toggleBookmark(7, { product_id: 1 });

      expect(result.bookmarked).toBe(false);
      expect(manager.delete).toHaveBeenCalledWith(BookmarkProduct, { id: 3 });
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('can not bookmark a deleted product', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.toggleBookmark(7, { product_id: 1 }),
      ).rejects.toThrow(NotFoundException);
      expect(manager.insert).not.toHaveBeenCalled();
    });
  });

  it('keeps In/IsNull imports meaningful for the category helpers', () => {
    expect(In([1]).type).toBe('in');
  });
});
