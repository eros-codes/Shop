import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_UNSIGNED_INT32 } from '../../common/constants/limits';
import { AttributeValueDto } from '../../attributes/dto/attribute.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProductVariantDto {
  // What this variant IS: colour = option 12, size = option 31. The
  // title and the options cache are built from these, so the shop never
  // types "مشکی" twice and spells it differently the second time.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  attributes?: AttributeValueDto[];

  @Transform(trim)
  // Optional when the variant carries attribute values: the label is
  // built from them ("مشکی / XL").
  @IsOptional()
  @IsString({ message: 'Variant title must be a string' })
  @IsNotEmpty({ message: 'Variant title cannot be empty' })
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9\u0600-\u06FF]+(?:-[A-Za-z0-9\u0600-\u06FF]+)*$/u, {
    message: 'SKU may only contain letters, digits and single dashes',
  })
  sku?: string;

  @IsOptional()
  @IsObject({ message: 'Options must be an object of name/value pairs' })
  options?: Record<string, string>;

  @IsInt({ message: 'Stock must be an integer' })
  @Min(0, { message: 'Stock cannot be negative' })
  @Max(MAX_UNSIGNED_INT32)
  @Type(() => Number)
  stock!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  sale_price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  weight_grams?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateProductVariantDto extends PartialType(
  CreateProductVariantDto,
) {
  // The stock the client last saw. Stock is an absolute value here, so
  // without this an editor opened before a sale would write the old number
  // back and resurrect units that were already sold.
  @IsOptional()
  @IsInt({ message: 'expected_stock must be an integer' })
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  expected_stock?: number;
}
