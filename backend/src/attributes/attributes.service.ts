import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Attribute } from './entities/attribute.entity';
import { AttributeOption } from './entities/attribute-option.entity';
import { CategoryAttribute } from './entities/category-attribute.entity';
import { VariantAttributeValue } from './entities/variant-attribute-value.entity';
import { ProductAttributeValue } from './entities/product-attribute-value.entity';
import AttributeTypeEnum from './enums/attribute-type.enum';
import {
  AttachAttributeToCategoryDto,
  AttributeValueDto,
  CreateAttributeDto,
  CreateAttributeOptionDto,
  UpdateAttributeDto,
  UpdateAttributeOptionDto,
} from './dto/attribute.dto';
import { slugify } from '../common/utils/slugify';
import { isDuplicateEntryError } from '../common/database/mysql-errors';
import { Category } from '../categories/entities/category.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { Product } from '../products/entities/product.entity';

// Attributes that can split a product into separately priced, separately
// counted variants. The other types describe a product but never divide
// its stock.
const AXIS_TYPES = [AttributeTypeEnum.Select, AttributeTypeEnum.Color];

export interface ResolvedValue {
  attribute: Attribute;
  option: AttributeOption;
}

@Injectable()
export class AttributesService {
  constructor(
    @InjectRepository(Attribute)
    private readonly attributes: Repository<Attribute>,
    @InjectRepository(AttributeOption)
    private readonly options: Repository<AttributeOption>,
    @InjectRepository(CategoryAttribute)
    private readonly categoryAttributes: Repository<CategoryAttribute>,
    @InjectRepository(VariantAttributeValue)
    private readonly variantValues: Repository<VariantAttributeValue>,
    @InjectRepository(ProductAttributeValue)
    private readonly productValues: Repository<ProductAttributeValue>,
  ) {}

  // ---- attributes -------------------------------------------------

  async create(dto: CreateAttributeDto): Promise<Attribute> {
    const type = dto.type ?? AttributeTypeEnum.Select;
    this.assertAxisHasFixedValues(type, dto.is_variant_axis ?? false);

    const code = slugify(dto.code ?? dto.title);
    if (!code) {
      throw new BadRequestException(
        'This title cannot be turned into a code - please provide one explicitly',
      );
    }

    try {
      const attribute = await this.attributes.save(
        this.attributes.create({
          title: dto.title,
          code,
          type,
          unit: dto.unit ?? null,
          is_variant_axis: dto.is_variant_axis ?? false,
          is_filterable: dto.is_filterable ?? true,
          sort_order: dto.sort_order ?? 0,
        }),
      );

      for (const option of dto.options ?? []) {
        await this.addOption(attribute.id, option);
      }
      return this.findOne(attribute.id);
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(`An attribute "${code}" already exists`);
      }
      throw error;
    }
  }

  async findAll(includeUnfilterable = true): Promise<Attribute[]> {
    return this.attributes.find({
      where: includeUnfilterable ? {} : { is_filterable: true },
      relations: { options: true },
      order: {
        sort_order: 'ASC',
        id: 'ASC',
        options: { sort_order: 'ASC', id: 'ASC' },
      },
    });
  }

  async findOne(id: number): Promise<Attribute> {
    const attribute = await this.attributes.findOne({
      where: { id },
      relations: { options: true },
      order: { options: { sort_order: 'ASC', id: 'ASC' } },
    });
    if (!attribute) {
      throw new NotFoundException(`Attribute ${id} not found`);
    }
    return attribute;
  }

  async update(id: number, dto: UpdateAttributeDto): Promise<Attribute> {
    const attribute = await this.findOne(id);
    const type = dto.type ?? attribute.type;
    const isAxis = dto.is_variant_axis ?? attribute.is_variant_axis;
    this.assertAxisHasFixedValues(type, isAxis);

    // Turning an axis off (or changing its type) while variants are
    // built on it would leave those variants describing nothing.
    if (attribute.is_variant_axis && (!isAxis || type !== attribute.type)) {
      const inUse = await this.variantValues.count({
        where: { attribute: { id } },
      });
      if (inUse > 0) {
        throw new ConflictException(
          `${inUse} variants are built on this attribute - it cannot change while they exist`,
        );
      }
    }

    Object.assign(attribute, {
      ...dto,
      type,
      is_variant_axis: isAxis,
      ...(dto.code ? { code: slugify(dto.code) } : {}),
    });
    delete (attribute as unknown as { options?: unknown }).options;

    try {
      await this.attributes.save(attribute);
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Another attribute uses that code');
      }
      throw error;
    }
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const inUse = await this.variantValues.count({
      where: { attribute: { id } },
    });
    if (inUse > 0) {
      throw new ConflictException(
        `${inUse} variants are built on this attribute - it cannot be deleted while they exist`,
      );
    }
    const result = await this.attributes.softDelete({ id });
    if (!result.affected) {
      throw new NotFoundException(`Attribute ${id} not found`);
    }
  }

  // ---- options ----------------------------------------------------

  async addOption(
    attributeId: number,
    dto: CreateAttributeOptionDto,
  ): Promise<AttributeOption> {
    const attribute = await this.findOne(attributeId);
    const slug = slugify(dto.slug ?? dto.value) || `option-${Date.now()}`;

    const clash = await this.options.findOne({
      where: { attribute: { id: attributeId }, slug },
    });
    if (clash) {
      throw new ConflictException(
        `"${attribute.title}" already has an option with the code "${slug}"`,
      );
    }

    return this.options.save(
      this.options.create({
        attribute: { id: attributeId } as Attribute,
        value: dto.value,
        slug,
        hex: dto.hex ?? null,
        sort_order: dto.sort_order ?? 0,
        numeric_value:
          dto.numeric_value === undefined ? null : String(dto.numeric_value),
      }),
    );
  }

  async updateOption(
    attributeId: number,
    optionId: number,
    dto: UpdateAttributeOptionDto,
  ): Promise<AttributeOption> {
    const option = await this.options.findOne({
      where: { id: optionId },
      relations: { attribute: true },
    });
    if (!option || option.attribute.id !== attributeId) {
      throw new NotFoundException(
        `Option ${optionId} not found on attribute ${attributeId}`,
      );
    }

    Object.assign(option, {
      ...dto,
      ...(dto.slug ? { slug: slugify(dto.slug) } : {}),
      ...(dto.numeric_value !== undefined
        ? { numeric_value: String(dto.numeric_value) }
        : {}),
    });
    return this.options.save(option);
  }

  // Soft delete: variants sold with this value keep pointing at it, and
  // the order history still reads correctly.
  async removeOption(attributeId: number, optionId: number): Promise<void> {
    const option = await this.options.findOne({
      where: { id: optionId },
      relations: { attribute: true },
    });
    if (!option || option.attribute.id !== attributeId) {
      throw new NotFoundException(
        `Option ${optionId} not found on attribute ${attributeId}`,
      );
    }

    const inUse = await this.variantValues.count({
      where: { option: { id: optionId } },
    });
    if (inUse > 0) {
      throw new ConflictException(
        `${inUse} variants use this value - remove them first`,
      );
    }
    await this.options.softDelete({ id: optionId });
  }

  // ---- categories -------------------------------------------------

  async attachToCategory(
    categoryId: number,
    dto: AttachAttributeToCategoryDto,
  ): Promise<CategoryAttribute[]> {
    await this.findOne(dto.attributeId);

    const existing = await this.categoryAttributes.findOne({
      where: {
        category: { id: categoryId },
        attribute: { id: dto.attributeId },
      },
    });
    if (existing) {
      existing.is_required = dto.is_required ?? existing.is_required;
      existing.sort_order = dto.sort_order ?? existing.sort_order;
      await this.categoryAttributes.save(existing);
    } else {
      await this.categoryAttributes.save(
        this.categoryAttributes.create({
          category: { id: categoryId } as Category,
          attribute: { id: dto.attributeId } as Attribute,
          is_required: dto.is_required ?? false,
          sort_order: dto.sort_order ?? 0,
        }),
      );
    }
    return this.forCategory(categoryId);
  }

  async detachFromCategory(
    categoryId: number,
    attributeId: number,
  ): Promise<void> {
    const result = await this.categoryAttributes.delete({
      category: { id: categoryId },
      attribute: { id: attributeId },
    });
    if (!result.affected) {
      throw new NotFoundException(
        `Attribute ${attributeId} is not attached to category ${categoryId}`,
      );
    }
  }

  // What the admin form for a product in these categories should ask
  // for. Categories are passed as the whole set a product belongs to.
  async forCategory(...categoryIds: number[]): Promise<CategoryAttribute[]> {
    const ids = categoryIds.flat().filter((id) => !!id);
    if (ids.length === 0) return [];

    return this.categoryAttributes.find({
      where: { category: { id: In(ids) } },
      relations: { attribute: { options: true }, category: true },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  // ---- values on variants and products ----------------------------

  // Turns "attribute 3 = option 12" into checked rows: the attribute has
  // to exist, be an axis, and the option has to belong to it. Wrong
  // pairs are the most common way bad data gets in, and they are
  // impossible to spot once stored.
  async resolveAxisValues(
    inputs: AttributeValueDto[],
    manager?: EntityManager,
  ): Promise<ResolvedValue[]> {
    if (inputs.length === 0) return [];

    const attributesRepo = manager
      ? manager.getRepository(Attribute)
      : this.attributes;
    const optionsRepo = manager
      ? manager.getRepository(AttributeOption)
      : this.options;

    const attributeIds = [...new Set(inputs.map((i) => i.attributeId))];
    if (attributeIds.length !== inputs.length) {
      throw new BadRequestException(
        'A variant can only answer each attribute once',
      );
    }

    const attributes = await attributesRepo.find({
      where: { id: In(attributeIds) },
    });
    const byId = new Map(attributes.map((a) => [a.id, a]));

    const optionIds = inputs
      .map((i) => i.optionId)
      .filter((id): id is number => !!id);
    const options = optionIds.length
      ? await optionsRepo.find({
          where: { id: In(optionIds) },
          relations: { attribute: true },
        })
      : [];
    const optionById = new Map(options.map((o) => [o.id, o]));

    return inputs.map((input) => {
      const attribute = byId.get(input.attributeId);
      if (!attribute) {
        throw new BadRequestException(
          `Attribute ${input.attributeId} not found`,
        );
      }
      if (!attribute.is_variant_axis) {
        throw new BadRequestException(
          `"${attribute.title}" is not a variant axis - put it on the product instead`,
        );
      }
      if (!input.optionId) {
        throw new BadRequestException(
          `"${attribute.title}" needs one of its defined values`,
        );
      }
      const option = optionById.get(input.optionId);
      if (!option) {
        throw new BadRequestException(`Option ${input.optionId} not found`);
      }
      if (option.attribute.id !== attribute.id) {
        throw new BadRequestException(
          `"${option.value}" is not a value of "${attribute.title}"`,
        );
      }
      return { attribute, option };
    });
  }

  // Every axis the product's categories mark as required has to be
  // answered, or the shop ends up with a shoe that has no size.
  async assertRequiredAxesAnswered(
    categoryIds: number[],
    values: ResolvedValue[],
  ): Promise<void> {
    const required = (await this.forCategory(...categoryIds)).filter(
      (link) => link.is_required && link.attribute.is_variant_axis,
    );
    const answered = new Set(values.map((value) => value.attribute.id));
    const missing = required
      .filter((link) => !answered.has(link.attribute.id))
      .map((link) => link.attribute.title);

    if (missing.length > 0) {
      throw new BadRequestException(
        `These options are required for this category: ${missing.join(', ')}`,
      );
    }
  }

  async replaceVariantValues(
    manager: EntityManager,
    variantId: number,
    values: ResolvedValue[],
  ): Promise<void> {
    const repo = manager.getRepository(VariantAttributeValue);
    await repo.delete({ variant: { id: variantId } });
    if (values.length === 0) return;

    await repo.save(
      values.map((value) =>
        repo.create({
          variant: { id: variantId } as ProductVariant,
          attribute: { id: value.attribute.id } as Attribute,
          option: { id: value.option.id } as AttributeOption,
        }),
      ),
    );
  }

  // The denormalised copy kept on the variant, so listing a basket or a
  // product card needs no joins.
  optionsCacheOf(values: ResolvedValue[]): Record<string, string> | null {
    if (values.length === 0) return null;
    return Object.fromEntries(
      values.map((value) => [value.attribute.title, value.option.value]),
    );
  }

  labelOf(values: ResolvedValue[]): string {
    return values.map((value) => value.option.value).join(' / ');
  }

  // Product-level values: descriptive attributes, which may be options
  // or plain values depending on the attribute's type.
  async replaceProductValues(
    manager: EntityManager,
    productId: number,
    inputs: AttributeValueDto[],
  ): Promise<void> {
    const repo = manager.getRepository(ProductAttributeValue);
    await repo.delete({ product: { id: productId } });
    if (inputs.length === 0) return;

    const attributesRepo = manager.getRepository(Attribute);
    const optionsRepo = manager.getRepository(AttributeOption);
    const attributes = await attributesRepo.find({
      where: { id: In(inputs.map((i) => i.attributeId)) },
    });
    const byId = new Map(attributes.map((a) => [a.id, a]));

    const rows: ProductAttributeValue[] = [];
    for (const input of inputs) {
      const attribute = byId.get(input.attributeId);
      if (!attribute) {
        throw new BadRequestException(
          `Attribute ${input.attributeId} not found`,
        );
      }

      const row = repo.create({
        product: { id: productId } as Product,
        attribute: { id: attribute.id } as Attribute,
      });

      if (AXIS_TYPES.includes(attribute.type)) {
        if (!input.optionId) {
          throw new BadRequestException(
            `"${attribute.title}" needs one of its defined values`,
          );
        }
        const option = await optionsRepo.findOne({
          where: { id: input.optionId },
          relations: { attribute: true },
        });
        if (!option || option.attribute.id !== attribute.id) {
          throw new BadRequestException(
            `Option ${input.optionId} is not a value of "${attribute.title}"`,
          );
        }
        row.option = { id: option.id } as AttributeOption;
      } else if (attribute.type === AttributeTypeEnum.Number) {
        if (input.value_number === undefined) {
          throw new BadRequestException(`"${attribute.title}" needs a number`);
        }
        row.value_number = String(input.value_number);
      } else if (attribute.type === AttributeTypeEnum.Boolean) {
        if (input.value_boolean === undefined) {
          throw new BadRequestException(
            `"${attribute.title}" needs true or false`,
          );
        }
        row.value_boolean = input.value_boolean;
      } else {
        if (!input.value_text) {
          throw new BadRequestException(`"${attribute.title}" needs a value`);
        }
        row.value_text = input.value_text;
      }
      rows.push(row);
    }

    await repo.save(rows);
  }

  private assertAxisHasFixedValues(
    type: AttributeTypeEnum,
    isAxis: boolean,
  ): void {
    if (isAxis && !AXIS_TYPES.includes(type)) {
      throw new BadRequestException(
        'Only select and colour attributes can be variant axes - an axis needs a fixed list of values',
      );
    }
  }
}
