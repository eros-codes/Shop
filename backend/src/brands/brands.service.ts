import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Brand } from './entities/brand.entity';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { FilterBrandDto } from './dto/filter-brand.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { isDuplicateEntryError } from '../common/database/mysql-errors';
import { slugify } from '../common/utils/slugify';
import {
  CatalogCacheScope,
  CatalogCacheService,
} from '../common/cache/catalog-cache.service';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly brandsRepository: Repository<Brand>,
    private readonly catalogCache: CatalogCacheService,
  ) {}

  async create(createBrandDto: CreateBrandDto): Promise<Brand> {
    const slug = slugify(createBrandDto.slug ?? createBrandDto.title);
    if (!slug) {
      throw new ConflictException(
        'This title cannot be turned into a URL slug - please provide one explicitly',
      );
    }

    try {
      const brand = this.brandsRepository.create({ ...createBrandDto, slug });
      const saved = await this.brandsRepository.save(brand);
      await this.invalidateCaches();
      return saved;
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(
          `A brand with the slug "${slug}" already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(query: FilterBrandDto): Promise<PaginatedResult<Brand>> {
    const { page, limit, search } = query;
    const [items, total] = await this.brandsRepository.findAndCount({
      where: search ? { title: Like(`%${search}%`) } : {},
      order: { title: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number): Promise<Brand> {
    const brand = await this.brandsRepository.findOneBy({ id });
    if (!brand) {
      throw new NotFoundException(`Brand with id ${id} not found`);
    }
    return brand;
  }

  async findBySlug(slug: string): Promise<Brand> {
    const brand = await this.brandsRepository.findOneBy({ slug });
    if (!brand) {
      throw new NotFoundException(`Brand "${slug}" not found`);
    }
    return brand;
  }

  async update(id: number, updateBrandDto: UpdateBrandDto): Promise<Brand> {
    const brand = await this.findOne(id);
    const nextSlug =
      updateBrandDto.slug !== undefined
        ? slugify(updateBrandDto.slug)
        : updateBrandDto.title !== undefined && !updateBrandDto.slug
          ? brand.slug
          : brand.slug;

    Object.assign(brand, updateBrandDto, { slug: nextSlug });
    try {
      const saved = await this.brandsRepository.save(brand);
      await this.invalidateCaches();
      return saved;
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(
          `A brand with the slug "${nextSlug}" already exists`,
        );
      }
      throw error;
    }
  }

  // The brand endpoints are cached under the Categories scope (with the
  // rest of the navigation) and products embed their brand, so a change
  // has to drop both. Only Products was dropped, and a new brand stayed
  // missing from the panel's own brand picker for up to a minute.
  private invalidateCaches(): Promise<void> {
    return this.catalogCache.invalidate(
      CatalogCacheScope.Categories,
      CatalogCacheScope.Products,
    );
  }

  async remove(id: number): Promise<void> {
    const result = await this.brandsRepository.softDelete({ id });
    if (!result.affected) {
      throw new NotFoundException(`Brand with id ${id} not found`);
    }
    await this.invalidateCaches();
  }
}
