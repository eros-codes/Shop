import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FilterCategoryDto } from './dto/filter-category.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { slugify } from '../common/utils/slugify';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { softDeleteProducts } from '../products/utils/product-delete';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { isDuplicateEntryError } from '../common/database/mysql-errors';
import {
  CatalogCacheScope,
  CatalogCacheService,
} from '../common/cache/catalog-cache.service';

export interface CategoryNode {
  id: number;
  title: string;
  slug: string;
  children: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly dataSource: DataSource,
    private readonly catalogCache: CatalogCacheService,
  ) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const slug = this.buildSlug(
      createCategoryDto.slug,
      createCategoryDto.title,
    );
    const parent =
      createCategoryDto.parentId !== undefined
        ? await this.findOne(createCategoryDto.parentId)
        : null;

    let id: number;
    try {
      const result = await this.categoriesRepository.insert({
        title: createCategoryDto.title,
        slug,
        ...(parent ? { parent: { id: parent.id } } : {}),
      });
      id = Number(result.identifiers[0].id);
    } catch (error) {
      throw this.translateWriteError(error, createCategoryDto.title);
    }
    await this.catalogCache.invalidate(CatalogCacheScope.Categories);
    return this.findOne(id);
  }

  async findAll(query: FilterCategoryDto): Promise<PaginatedResult<Category>> {
    const { page, limit } = query;
    const [items, total] = await this.categoriesRepository.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoriesRepository.findOneBy({ id });
    if (!category)
      throw new NotFoundException(`Category with id ${id} not found`);
    return category;
  }

  async update(
    id: number,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    const { title, slug, parentId } = updateCategoryDto;
    const changes: Partial<Category> = {};
    if (title !== undefined) changes.title = title;
    if (slug !== undefined) changes.slug = this.buildSlug(slug, slug);
    if (parentId !== undefined) {
      if (parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      const descendants = await this.getDescendantIds(id);
      if (descendants.includes(parentId)) {
        throw new BadRequestException(
          'That parent sits under this category - moving it there would create a loop',
        );
      }
      await this.findOne(parentId);
      changes.parent = { id: parentId } as Category;
    }

    if (Object.keys(changes).length > 0) {
      let affected: number | undefined;
      try {
        ({ affected } = await this.categoriesRepository.update(
          { id, deleted_at: IsNull() },
          changes,
        ));
      } catch (error) {
        throw this.translateWriteError(error, title ?? slug ?? '');
      }
      if (!affected) {
        await this.findOne(id);
      }
      await this.catalogCache.invalidate(
        CatalogCacheScope.Categories,
        CatalogCacheScope.Products,
      );
    }
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const children = await this.categoriesRepository.count({
      where: { parent: { id }, deleted_at: IsNull() },
    });
    if (children > 0) {
      throw new ConflictException(
        `This category still has ${children} sub-categories - move or delete them first`,
      );
    }

    const { affected } = await this.categoriesRepository.softDelete({
      id,
      deleted_at: IsNull(),
    });
    if (!affected) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    await this.catalogCache.invalidate(
      CatalogCacheScope.Categories,
      CatalogCacheScope.Products,
    );
  }

  async removeWithProds(id: number): Promise<{ deletedProducts: number }> {
    const deletedProductIds = await this.dataSource.transaction(
      async (manager) => {
        const category = await manager.findOne(Category, {
          select: { id: true },
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!category) {
          throw new NotFoundException(`Category with id ${id} not found`);
        }

        const children = await manager.count(Category, {
          where: { parent: { id }, deleted_at: IsNull() },
        });
        if (children > 0) {
          throw new ConflictException(
            `This category still has ${children} sub-categories - move or delete them first`,
          );
        }

        const memberRows = await manager
          .createQueryBuilder(Product, 'product')
          .select('product.id', 'id')
          .innerJoin('product.categories', 'category', 'category.id = :id', {
            id,
          })
          .getRawMany<{ id: number | string }>();
        const memberIds = memberRows.map((row) => Number(row.id));
        if (memberIds.length === 0) {
          await manager.softDelete(Category, { id });
          return [];
        }

        await manager.find(Product, {
          select: { id: true },
          where: { id: In(memberIds) },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
        const sharedRows = await manager
          .createQueryBuilder(Product, 'product')
          .select('DISTINCT product.id', 'id')
          .innerJoin('product.categories', 'other', 'other.id <> :id', { id })
          .where('product.id IN (:...memberIds)', { memberIds })
          .getRawMany<{ id: number | string }>();
        const shared = new Set(sharedRows.map((row) => Number(row.id)));
        const exclusiveIds = memberIds.filter(
          (productId) => !shared.has(productId),
        );

        // Their variants go too, or their SKUs stay reserved for ever.
        await softDeleteProducts(manager, exclusiveIds);
        await manager.softDelete(Category, { id });
        return exclusiveIds;
      },
    );

    await this.catalogCache.invalidate(
      CatalogCacheScope.Categories,
      CatalogCacheScope.Products,
    );
    return { deletedProducts: deletedProductIds.length };
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.categoriesRepository.findOneBy({ slug });
    if (!category) {
      throw new NotFoundException(`Category "${slug}" not found`);
    }
    return category;
  }

  async findTree(): Promise<CategoryNode[]> {
    const categories = await this.categoriesRepository.find({
      select: { id: true, title: true, slug: true },
      relations: { parent: true },
      order: { title: 'ASC' },
    });

    const nodes = new Map<number, CategoryNode>(
      categories.map((category) => [
        category.id,
        {
          id: category.id,
          title: category.title,
          slug: category.slug,
          children: [],
        },
      ]),
    );
    const roots: CategoryNode[] = [];
    for (const category of categories) {
      const node = nodes.get(category.id)!;
      const parentNode = category.parent
        ? nodes.get(category.parent.id)
        : undefined;
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  // Filtering by a category means the whole subtree: asking for "digital"
  // has to return the phones filed under it.
  async getDescendantIds(id: number): Promise<number[]> {
    const rows = await this.categoriesRepository.find({
      select: { id: true },
      relations: { parent: true },
    });

    const childrenOf = new Map<number, number[]>();
    for (const row of rows) {
      const parentId = row.parent?.id;
      if (parentId === undefined || parentId === null) continue;
      const siblings = childrenOf.get(parentId) ?? [];
      siblings.push(row.id);
      childrenOf.set(parentId, siblings);
    }

    const collected: number[] = [];
    const queue = [id];
    const seen = new Set<number>([id]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      collected.push(current);
      for (const child of childrenOf.get(current) ?? []) {
        if (!seen.has(child)) {
          seen.add(child);
          queue.push(child);
        }
      }
    }
    return collected;
  }

  private buildSlug(explicit: string | undefined, fallback: string): string {
    const slug = slugify(explicit ?? fallback);
    if (!slug) {
      throw new BadRequestException(
        'This title cannot be turned into a URL slug - please provide one explicitly',
      );
    }
    return slug;
  }

  private translateWriteError(error: unknown, title: string): unknown {
    if (isDuplicateEntryError(error)) {
      return new ConflictException(
        `A category titled "${title}" already exists`,
      );
    }
    return error;
  }
}
