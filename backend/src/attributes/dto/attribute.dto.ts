import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import AttributeTypeEnum from '../enums/attribute-type.enum';
import { MAX_INT32 } from '../../common/constants/limits';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAttributeOptionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'An option needs a value' })
  @MaxLength(100)
  value!: string;

  // Derived from the value when left out.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  slug?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: 'hex must look like #1a2b3c',
  })
  hex?: string;

  // Sizes are not alphabetical: S, M, L, XL only sort correctly if the
  // shop says so.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sort_order?: number;

  // "256" behind "256 GB", for range filters and numeric sorting.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  numeric_value?: number;
}

export class UpdateAttributeOptionDto extends PartialType(
  CreateAttributeOptionDto,
) {}

export class CreateAttributeDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'An attribute needs a title' })
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  @Matches(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, {
    message: 'Code may only contain letters, digits and single dashes',
  })
  code?: string;

  @IsOptional()
  @IsEnum(AttributeTypeEnum)
  type?: AttributeTypeEnum;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  unit?: string;

  // Only select and colour attributes can be axes: a variant axis needs
  // a fixed list of values to combine.
  @IsOptional()
  @IsBoolean()
  is_variant_axis?: boolean;

  @IsOptional()
  @IsBoolean()
  is_filterable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sort_order?: number;

  // The allowed values, created along with the attribute.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateAttributeOptionDto)
  options?: CreateAttributeOptionDto[];
}

export class UpdateAttributeDto extends PartialType(CreateAttributeDto) {}

export class AttachAttributeToCategoryDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  attributeId!: number;

  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sort_order?: number;
}

// One answer: either an option of a select/colour attribute, or a plain
// value for the free-form types.
export class AttributeValueDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  attributeId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  optionId?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  value_text?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  value_number?: number;

  @IsOptional()
  @IsBoolean()
  value_boolean?: boolean;
}
