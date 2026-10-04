import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { BrandsService } from './brands.service';
import { Brand } from './entities/brand.entity';
import { CatalogCacheService } from '../common/cache/catalog-cache.service';

const duplicateEntry = () =>
  new QueryFailedError(
    'INSERT',
    [],
    Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY', errno: 1062 }),
  );

describe('BrandsService', () => {
  let service: BrandsService;
  let repo: Record<string, jest.Mock>;
  let catalogCache: { invalidate: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 1, ...data })),
      findOneBy: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    catalogCache = { invalidate: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BrandsService,
        { provide: getRepositoryToken(Brand), useValue: repo },
        { provide: CatalogCacheService, useValue: catalogCache },
      ],
    }).compile();

    service = moduleRef.get(BrandsService);
  });

  describe('create', () => {
    it('derives the slug from the title', async () => {
      await service.create({ title: 'Samsung Electronics' });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'samsung-electronics' }),
      );
    });

    it('keeps an explicitly given slug', async () => {
      await service.create({ title: 'Samsung', slug: 'samsung-ir' });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'samsung-ir' }),
      );
    });

    it('turns a duplicate slug into a 409', async () => {
      repo.save.mockRejectedValue(duplicateEntry());

      await expect(service.create({ title: 'Samsung' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses a title that produces no slug at all', async () => {
      await expect(service.create({ title: '!!!' })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('drops cached catalogue pages, which embed brand names', async () => {
      await service.create({ title: 'Apple' });
      expect(catalogCache.invalidate).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('keeps the existing slug when only the title changes', async () => {
      repo.findOneBy.mockResolvedValue({
        id: 1,
        title: 'Samsung',
        slug: 'samsung',
      });

      await service.update(1, { title: 'Samsung Iran' });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'samsung', title: 'Samsung Iran' }),
      );
    });

    it('changes the slug when one is sent explicitly', async () => {
      repo.findOneBy.mockResolvedValue({
        id: 1,
        title: 'Samsung',
        slug: 'samsung',
      });

      await service.update(1, { slug: 'samsung-iran' });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'samsung-iran' }),
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes so products keep resolving their brand', async () => {
      await service.remove(1);

      expect(repo.softDelete).toHaveBeenCalledWith({ id: 1 });
    });

    it('404s for a brand that is not there', async () => {
      repo.softDelete.mockResolvedValue({ affected: 0 });

      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });
  });
});
