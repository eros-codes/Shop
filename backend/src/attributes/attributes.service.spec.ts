import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AttributesService } from './attributes.service';
import { Attribute } from './entities/attribute.entity';
import { AttributeOption } from './entities/attribute-option.entity';
import { CategoryAttribute } from './entities/category-attribute.entity';
import { VariantAttributeValue } from './entities/variant-attribute-value.entity';
import { ProductAttributeValue } from './entities/product-attribute-value.entity';
import AttributeTypeEnum from './enums/attribute-type.enum';

const repo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((data) => data),
  save: jest.fn((data) =>
    Promise.resolve(Array.isArray(data) ? data : { id: 1, ...data }),
  ),
  softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
});

describe('AttributesService', () => {
  let service: AttributesService;
  let attributes: ReturnType<typeof repo>;
  let options: ReturnType<typeof repo>;
  let categoryAttributes: ReturnType<typeof repo>;
  let variantValues: ReturnType<typeof repo>;

  const colour = {
    id: 1,
    title: 'رنگ',
    code: 'rang',
    type: AttributeTypeEnum.Select,
    is_variant_axis: true,
  };
  const size = {
    id: 2,
    title: 'سایز',
    code: 'size',
    type: AttributeTypeEnum.Select,
    is_variant_axis: true,
  };
  const screen = {
    id: 3,
    title: 'اندازه صفحه',
    code: 'screen',
    type: AttributeTypeEnum.Number,
    is_variant_axis: false,
  };
  const black = { id: 11, value: 'مشکی', attribute: colour };
  const large = { id: 21, value: 'XL', attribute: size };

  beforeEach(async () => {
    attributes = repo();
    options = repo();
    categoryAttributes = repo();
    variantValues = repo();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttributesService,
        { provide: getRepositoryToken(Attribute), useValue: attributes },
        { provide: getRepositoryToken(AttributeOption), useValue: options },
        {
          provide: getRepositoryToken(CategoryAttribute),
          useValue: categoryAttributes,
        },
        {
          provide: getRepositoryToken(VariantAttributeValue),
          useValue: variantValues,
        },
        {
          provide: getRepositoryToken(ProductAttributeValue),
          useValue: repo(),
        },
      ],
    }).compile();

    service = moduleRef.get(AttributesService);
  });

  describe('defining attributes', () => {
    it('derives a code from the title when none is given', async () => {
      attributes.findOne.mockResolvedValue({ ...colour, options: [] });

      await service.create({ title: 'رنگ', is_variant_axis: true });

      expect(attributes.save).toHaveBeenCalledWith(
        expect.objectContaining({ code: expect.any(String) }),
      );
    });

    // An axis needs a fixed list of values to combine; a free-form
    // number cannot be one.
    it('refuses to make a number attribute a variant axis', async () => {
      await expect(
        service.create({
          title: 'وزن',
          type: AttributeTypeEnum.Number,
          is_variant_axis: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('will not change an axis that variants are already built on', async () => {
      attributes.findOne.mockResolvedValue({ ...colour, options: [] });
      variantValues.count.mockResolvedValue(4);

      await expect(
        service.update(1, { is_variant_axis: false }),
      ).rejects.toThrow(ConflictException);
    });

    it('will not delete one that variants are built on', async () => {
      variantValues.count.mockResolvedValue(2);

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
      expect(attributes.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('resolving what a variant is', () => {
    beforeEach(() => {
      attributes.find.mockResolvedValue([colour, size, screen]);
      options.find.mockResolvedValue([black, large]);
    });

    it('accepts an option that belongs to its attribute', async () => {
      const resolved = await service.resolveAxisValues([
        { attributeId: 1, optionId: 11 },
      ] as never);

      expect(resolved[0].option.value).toBe('مشکی');
    });

    // The most common way bad data gets in, and invisible once stored.
    it('refuses an option from a different attribute', async () => {
      await expect(
        service.resolveAxisValues([{ attributeId: 2, optionId: 11 }] as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses an attribute that is not an axis', async () => {
      await expect(
        service.resolveAxisValues([{ attributeId: 3, optionId: 11 }] as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses the same attribute answered twice', async () => {
      await expect(
        service.resolveAxisValues([
          { attributeId: 1, optionId: 11 },
          { attributeId: 1, optionId: 11 },
        ] as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a value that is not one of the defined ones', async () => {
      await expect(
        service.resolveAxisValues([{ attributeId: 1 }] as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('what a category requires', () => {
    it('refuses a variant that leaves a required axis unanswered', async () => {
      categoryAttributes.find.mockResolvedValue([
        { attribute: size, is_required: true },
      ]);

      await expect(
        service.assertRequiredAxesAnswered([7], [
          { attribute: colour, option: black },
        ] as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts one that answers it', async () => {
      categoryAttributes.find.mockResolvedValue([
        { attribute: size, is_required: true },
      ]);

      await expect(
        service.assertRequiredAxesAnswered([7], [
          { attribute: size, option: large },
        ] as never),
      ).resolves.toBeUndefined();
    });
  });

  describe('labels and the cached copy', () => {
    it('builds the variant label from its values', () => {
      expect(
        service.labelOf([
          { attribute: colour, option: black },
          { attribute: size, option: large },
        ] as never),
      ).toBe('مشکی / XL');
    });

    it('caches the values on the variant for join-free reads', () => {
      expect(
        service.optionsCacheOf([{ attribute: colour, option: black }] as never),
      ).toEqual({ رنگ: 'مشکی' });
    });
  });
});
