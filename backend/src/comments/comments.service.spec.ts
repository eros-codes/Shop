import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { Comment } from './entities/comment.entity';
import CommentStatusEnum from './enums/comment-status.enum';
import { Product } from '../products/entities/product.entity';
import { CatalogCacheService } from '../common/cache/catalog-cache.service';

function makeQueryBuilder() {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'withDeleted',
    'select',
    'addSelect',
    'innerJoin',
    'leftJoin',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'offset',
    'limit',
    'setLock',
  ]) {
    qb[method] = jest.fn(() => qb);
  }
  qb.getMany = jest.fn().mockResolvedValue([]);
  qb.getOne = jest.fn().mockResolvedValue({ id: 1 });
  qb.getRawOne = jest.fn();
  qb.getExists = jest.fn().mockResolvedValue(false);
  return qb;
}

describe('CommentsService', () => {
  let service: CommentsService;
  let commentsRepo: Record<string, jest.Mock>;
  let manager: Record<string, jest.Mock>;
  let readQb: Record<string, jest.Mock>;
  let txQb: Record<string, jest.Mock>;
  let transaction: jest.Mock;
  let productsRepo: Record<string, jest.Mock>;
  let catalogCache: { invalidate: jest.Mock };

  beforeEach(async () => {
    readQb = makeQueryBuilder();
    txQb = makeQueryBuilder();
    commentsRepo = {
      createQueryBuilder: jest.fn(() => readQb),
      exists: jest.fn().mockResolvedValue(true),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    manager = {
      findOne: jest.fn().mockResolvedValue({ id: 1 }),
      createQueryBuilder: jest.fn(() => txQb),
      insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 1 }] }),
      update: jest.fn(),
    };
    transaction = jest.fn((cb: any) => cb(manager));
    productsRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    catalogCache = { invalidate: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentsRepo },
        { provide: DataSource, useValue: { transaction } },
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        { provide: CatalogCacheService, useValue: catalogCache },
      ],
    }).compile();

    service = moduleRef.get(CommentsService);
  });

  describe('create - reviews', () => {
    it('takes the user from userId, not from the DTO', async () => {
      await service.create(7, {
        productId: 1,
        comment: 'Nice product',
        rate: 5,
      });

      expect(manager.insert).toHaveBeenCalledWith(Comment, {
        comment: 'Nice product',
        rate: 5,
        user: { id: 7 },
        product: { id: 1 },
      });
    });

    it('rejects a second review of the same product by the same user', async () => {
      txQb.getExists.mockResolvedValue(true);

      await expect(
        service.create(7, { productId: 1, comment: 'Again!', rate: 4 }),
      ).rejects.toThrow(ConflictException);
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('rejects a review of a product that does not exist or was deleted', async () => {
      manager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.create(7, { productId: 999, comment: 'Hello there', rate: 5 }),
      ).rejects.toThrow(NotFoundException);
      expect(manager.insert).not.toHaveBeenCalled();
    });
  });

  describe('create - replies', () => {
    const reply = { productId: 1, comment: 'I agree with this', parentId: 5 };

    it('rejects a rate on a reply before opening a transaction', async () => {
      await expect(service.create(7, { ...reply, rate: 5 })).rejects.toThrow(
        BadRequestException,
      );
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects a reply to a non-existent parent comment', async () => {
      txQb.getRawOne.mockResolvedValue(undefined);
      await expect(service.create(7, reply)).rejects.toThrow(NotFoundException);
    });

    it('rejects a reply that points at a comment of another product', async () => {
      txQb.getRawOne.mockResolvedValue({
        id: 5,
        status: CommentStatusEnum.Approved,
        productId: '2',
      });

      await expect(service.create(7, reply)).rejects.toThrow(
        BadRequestException,
      );
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('rejects a reply to a comment that is not approved', async () => {
      txQb.getRawOne.mockResolvedValue({
        id: 5,
        status: CommentStatusEnum.Pending,
        productId: 1,
      });

      await expect(service.create(7, reply)).rejects.toThrow(
        BadRequestException,
      );
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('links the parent and stores no rate', async () => {
      txQb.getRawOne.mockResolvedValue({
        id: 5,
        status: CommentStatusEnum.Approved,
        productId: 1,
      });

      await service.create(7, reply);

      expect(manager.insert).toHaveBeenCalledWith(
        Comment,
        expect.objectContaining({ parent: { id: 5 }, rate: null }),
      );
    });
  });

  describe('visibility', () => {
    it('shows anonymous visitors approved comments only, with public fields only', async () => {
      await service.findAll(
        { page: 1, limit: 10 },
        { userId: null, isAdmin: false },
      );

      expect(readQb.andWhere).toHaveBeenCalledWith(
        'comment.status = :approved',
        { approved: CommentStatusEnum.Approved },
      );
      expect(readQb.addSelect).toHaveBeenCalledWith([
        'user.id',
        'user.display_name',
      ]);
    });

    it('also shows a logged-in user their own pending comments', async () => {
      await service.findAll(
        { page: 1, limit: 10 },
        { userId: 7, isAdmin: false },
      );

      expect(readQb.andWhere).toHaveBeenCalledWith(
        '(comment.status = :approved OR user.id = :viewerId)',
        {
          approved: CommentStatusEnum.Approved,
          viewerId: 7,
        },
      );
    });

    it('lets admins see every status', async () => {
      await service.findAll(
        { page: 1, limit: 10 },
        { userId: 1, isAdmin: true },
      );

      const conditions = readQb.andWhere.mock.calls.map((call) => call[0]);
      expect(
        conditions.some((condition: string) => condition.includes(':approved')),
      ).toBe(false);
    });
  });

  describe('findReplies', () => {
    it('throws NotFoundException for an unknown parent', async () => {
      commentsRepo.exists.mockResolvedValue(false);
      await expect(
        service.findReplies(
          9,
          { page: 1, limit: 10 },
          { userId: null, isAdmin: false },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('pages the replies of a parent', async () => {
      await service.findReplies(
        9,
        { page: 2, limit: 5 },
        { userId: null, isAdmin: false },
      );

      expect(readQb.andWhere).toHaveBeenCalledWith('parent.id = :parentId', {
        parentId: 9,
      });
      expect(readQb.offset).toHaveBeenCalledWith(5);
      expect(readQb.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('update', () => {
    it("forbids editing someone else's comment", async () => {
      txQb.getRawOne.mockResolvedValue({
        id: 1,
        userId: 99,
        productId: 1,
        parentId: null,
      });

      await expect(
        service.update(1, 7, { comment: 'Hijacked text' }),
      ).rejects.toThrow(ForbiddenException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('sends an edited comment back to moderation', async () => {
      txQb.getRawOne.mockResolvedValue({
        id: 1,
        userId: 7,
        productId: 1,
        parentId: null,
      });

      await service.update(1, 7, { comment: 'Edited text' });

      expect(manager.update).toHaveBeenCalledWith(
        Comment,
        { id: 1 },
        { comment: 'Edited text', status: CommentStatusEnum.Pending },
      );
    });

    it('rejects a rate on a reply', async () => {
      txQb.getRawOne.mockResolvedValue({
        id: 1,
        userId: 7,
        productId: 1,
        parentId: 3,
      });
      await expect(service.update(1, 7, { rate: 2 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it("forbids deleting someone else's comment", async () => {
      readQb.getRawOne.mockResolvedValue({ userId: 99 });

      await expect(
        service.remove(1, { userId: 7, isAdmin: false }),
      ).rejects.toThrow(ForbiddenException);
      expect(commentsRepo.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes, so replies by other users survive', async () => {
      readQb.getRawOne.mockResolvedValue({ userId: 99 });

      await service.remove(1, { userId: 1, isAdmin: true });

      expect(commentsRepo.softDelete).toHaveBeenCalledWith({
        id: 1,
        deleted_at: IsNull(),
      });
    });

    it('throws NotFoundException for a comment that does not exist', async () => {
      readQb.getRawOne.mockResolvedValue(undefined);
      await expect(
        service.remove(999, { userId: 7, isAdmin: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('changes only the status of a live comment', async () => {
      await service.updateStatus(1, { status: CommentStatusEnum.Approved });

      expect(commentsRepo.update).toHaveBeenCalledWith(
        { id: 1, deleted_at: IsNull() },
        { status: CommentStatusEnum.Approved },
      );
    });

    it('throws NotFoundException for a missing comment', async () => {
      commentsRepo.update.mockResolvedValue({ affected: 0 });
      await expect(
        service.updateStatus(1, { status: CommentStatusEnum.Approved }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
