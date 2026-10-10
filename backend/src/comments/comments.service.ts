import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository, SelectQueryBuilder } from 'typeorm';

import { Comment } from './entities/comment.entity';
import CommentStatusEnum from './enums/comment-status.enum';

import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { UpdateCommentStatusDto } from './dto/update-comment-status.dto';
import { FilterCommentDto } from './dto/filter-comment.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { lockActiveProduct } from '../products/utils/product-locks';
import { lockUserRow } from '../users/utils/lock-user-row';
import { Product } from '../products/entities/product.entity';
import {
  CatalogCacheScope,
  CatalogCacheService,
} from '../common/cache/catalog-cache.service';

export interface CommentViewer {
  userId: number | null;
  isAdmin: boolean;
}

export const ANONYMOUS_VIEWER: CommentViewer = { userId: null, isAdmin: false };

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly catalogCache: CatalogCacheService,
  ) {}

  async create(
    userId: number,
    createCommentDto: CreateCommentDto,
  ): Promise<Comment> {
    const { productId, parentId, comment, rate } = createCommentDto;
    const isReply = parentId !== undefined && parentId !== null;

    if (isReply && rate !== undefined && rate !== null) {
      throw new BadRequestException(
        'Replies cannot have a rate - only reviews are rated',
      );
    }
    if (!isReply && (rate === undefined || rate === null)) {
      throw new BadRequestException('Rate is required for a review');
    }

    const commentId = await this.dataSource.transaction(async (manager) => {
      await lockActiveProduct(manager, productId, 'pessimistic_read');
      await lockUserRow(manager, userId);

      if (isReply) {
        const parent = await manager
          .createQueryBuilder(Comment, 'parent')
          .select('parent.id', 'id')
          .addSelect('parent.status', 'status')
          .addSelect('parent.product_id', 'productId')
          .where('parent.id = :parentId', { parentId })
          .setLock('pessimistic_read')
          .getRawOne<{
            id: number;
            status: CommentStatusEnum;
            productId: number | string;
          }>();

        if (!parent) {
          throw new NotFoundException(`Comment ${parentId} not found`);
        }
        if (Number(parent.productId) !== productId) {
          throw new BadRequestException(
            'A reply must belong to the same product as the comment it answers',
          );
        }
        if (parent.status !== CommentStatusEnum.Approved) {
          throw new BadRequestException(
            'You can only reply to an approved comment',
          );
        }
      } else {
        const alreadyReviewed = await manager
          .createQueryBuilder(Comment, 'review')
          .where(
            'review.user_id = :userId AND review.product_id = :productId AND review.parent_id IS NULL',
            { userId, productId },
          )
          .getExists();
        if (alreadyReviewed) {
          throw new ConflictException(
            'You have already reviewed this product - edit your existing review instead',
          );
        }
      }

      const result = await manager.insert(Comment, {
        comment,
        rate: isReply ? null : rate,
        user: { id: userId },
        product: { id: productId },
        ...(isReply ? { parent: { id: parentId } } : {}),
      });
      return Number(result.identifiers[0].id);
    });

    return this.findOne(commentId, { userId, isAdmin: false });
  }

  async findAll(
    query: FilterCommentDto,
    viewer: CommentViewer,
  ): Promise<Comment[]> {
    const { page, limit, productId, userId, status, rate } = query;
    const commentQuery = this.visibleComments(viewer);

    if (productId) {
      commentQuery.andWhere('product.id = :productId', { productId });
    }
    if (userId) {
      commentQuery.andWhere('user.id = :userId', { userId });
    }
    if (status) {
      commentQuery.andWhere('comment.status = :status', { status });
    }
    if (rate) {
      commentQuery.andWhere('comment.rate = :rate', { rate });
    }

    return commentQuery
      .orderBy('comment.created_at', 'DESC')
      .addOrderBy('comment.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getMany();
  }

  async findReplies(
    parentId: number,
    query: PaginationQueryDto,
    viewer: CommentViewer,
  ): Promise<Comment[]> {
    const parentExists = await this.commentsRepository.exists({
      where: { id: parentId },
      withDeleted: true,
    });
    if (!parentExists) {
      throw new NotFoundException(`Comment ${parentId} not found`);
    }

    const { page, limit } = query;
    return this.visibleComments(viewer)
      .andWhere('parent.id = :parentId', { parentId })
      .orderBy('comment.created_at', 'ASC')
      .addOrderBy('comment.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getMany();
  }

  async findOne(id: number, viewer: CommentViewer): Promise<Comment> {
    const comment = await this.visibleComments(viewer)
      .andWhere('comment.id = :id', { id })
      .getOne();
    if (!comment) throw new NotFoundException(`Comment ${id} not found`);
    return comment;
  }

  async update(
    id: number,
    userId: number,
    updateCommentDto: UpdateCommentDto,
  ): Promise<Comment> {
    const { comment, rate } = updateCommentDto;

    const productId = await this.dataSource.transaction(async (manager) => {
      const existing = await manager
        .createQueryBuilder(Comment, 'comment')
        .select('comment.id', 'id')
        .addSelect('comment.user_id', 'userId')
        .addSelect('comment.product_id', 'productId')
        .addSelect('comment.parent_id', 'parentId')
        .where('comment.id = :id', { id })
        .setLock('pessimistic_write')
        .getRawOne<{
          id: number;
          userId: number | string | null;
          productId: number | string;
          parentId: number | string | null;
        }>();

      if (!existing) throw new NotFoundException(`Comment ${id} not found`);
      if (Number(existing.userId) !== userId) {
        throw new ForbiddenException('You can only edit your own comment');
      }
      if (existing.parentId !== null && rate !== undefined) {
        throw new BadRequestException(
          'Replies cannot have a rate - only reviews are rated',
        );
      }
      await lockActiveProduct(
        manager,
        Number(existing.productId),
        'pessimistic_read',
      );
      if (comment === undefined && rate === undefined) {
        return null;
      }

      await manager.update(
        Comment,
        { id },
        {
          ...(comment !== undefined ? { comment } : {}),
          ...(rate !== undefined ? { rate } : {}),
          status: CommentStatusEnum.Pending,
        },
      );
      return Number(existing.productId);
    });

    // An edit sends the review back to moderation, so its score leaves the
    // product's average until it is approved again - it used to stay in.
    if (productId) {
      await this.refreshProductRating(productId);
    }
    return this.findOne(id, { userId, isAdmin: false });
  }

  async remove(id: number, viewer: CommentViewer): Promise<void> {
    const existing = await this.commentsRepository
      .createQueryBuilder('comment')
      .select('comment.user_id', 'userId')
      .addSelect('comment.product_id', 'productId')
      .where('comment.id = :id', { id })
      .getRawOne<{
        userId: number | string | null;
        productId: number | string | null;
      }>();

    if (!existing) throw new NotFoundException(`Comment ${id} not found`);
    if (!viewer.isAdmin && Number(existing.userId) !== viewer.userId) {
      throw new ForbiddenException('You can only delete your own comment');
    }

    const { affected } = await this.commentsRepository.softDelete({
      id,
      deleted_at: IsNull(),
    });
    if (!affected) throw new NotFoundException(`Comment ${id} not found`);

    if (existing.productId) {
      await this.refreshProductRating(Number(existing.productId));
    }
  }

  async updateStatus(
    id: number,
    updateStatusDto: UpdateCommentStatusDto,
  ): Promise<Comment> {
    const { affected } = await this.commentsRepository.update(
      { id, deleted_at: IsNull() },
      { status: updateStatusDto.status },
    );
    if (!affected) throw new NotFoundException(`Comment ${id} not found`);

    const comment = await this.findOne(id, { userId: null, isAdmin: true });
    if (comment.product?.id) {
      await this.refreshProductRating(comment.product.id);
    }
    return comment;
  }

  // Recomputed from the approved comments rather than adjusted by one, so
  // the stored average can never drift away from them.
  private async refreshProductRating(productId: number): Promise<void> {
    const stats = await this.commentsRepository
      .createQueryBuilder('comment')
      .select('COALESCE(AVG(comment.rate), 0)', 'average')
      .addSelect('COUNT(comment.rate)', 'count')
      .where('comment.product_id = :productId', { productId })
      .andWhere('comment.status = :approved', {
        approved: CommentStatusEnum.Approved,
      })
      .andWhere('comment.rate IS NOT NULL')
      .andWhere('comment.deleted_at IS NULL')
      .getRawOne<{ average: string; count: string }>();

    await this.productsRepository.update(
      { id: productId },
      {
        rating_avg: Number(Number(stats?.average ?? 0).toFixed(2)),
        rating_count: Number(stats?.count ?? 0),
      },
    );
    await this.catalogCache.invalidate(CatalogCacheScope.Products);
  }

  private visibleComments(viewer: CommentViewer): SelectQueryBuilder<Comment> {
    const commentQuery = this.commentsRepository
      .createQueryBuilder('comment')
      .withDeleted()
      .select([
        'comment.id',
        'comment.comment',
        'comment.rate',
        'comment.status',
        'comment.created_at',
        'comment.updated_at',
      ])
      .innerJoin('comment.product', 'product', 'product.deleted_at IS NULL')
      .addSelect(['product.id', 'product.title'])
      .leftJoin('comment.user', 'user')
      .addSelect(['user.id', 'user.display_name'])
      .leftJoin('comment.parent', 'parent')
      .addSelect('parent.id')
      .where('comment.deleted_at IS NULL');

    if (!viewer.isAdmin) {
      if (viewer.userId) {
        commentQuery.andWhere(
          '(comment.status = :approved OR user.id = :viewerId)',
          { approved: CommentStatusEnum.Approved, viewerId: viewer.userId },
        );
      } else {
        commentQuery.andWhere('comment.status = :approved', {
          approved: CommentStatusEnum.Approved,
        });
      }
    }
    return commentQuery;
  }
}
