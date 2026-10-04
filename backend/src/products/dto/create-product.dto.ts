import { Transform, Type } from 'class-transformer';
import { CreateProductVariantDto } from './product-variant.dto';
import { AttributeValueDto } from '../../attributes/dto/attribute.dto';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_INT32, MAX_UNSIGNED_INT32 } from '../../common/constants/limits';

export const MAX_CATEGORIES_PER_PRODUCT = 20;
export const MAX_VARIANTS_PER_PRODUCT = 50;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProductDto {
  @Transform(trim)
  @IsString({ message: 'Title must be a string' })
  @IsNotEmpty({ message: 'Title cannot be empty' })
  @MaxLength(255, { message: 'Title must be at most 255 characters' })
  title!: string;

  @Transform(trim)
  @IsString({ message: 'Description must be a string' })
  @IsNotEmpty({ message: 'Description cannot be empty' })
  @MaxLength(255, { message: 'Description must be at most 255 characters' })
  description!: string;

  @IsInt({ message: 'Price must be an integer' })
  @Min(0, { message: 'Price cannot be negative' })
  @Max(MAX_UNSIGNED_INT32, { message: 'Price is too large' })
  price!: number;

  @IsInt({ message: 'Stock must be an integer' })
  @Min(0, { message: 'Stock cannot be negative' })
  @Max(MAX_UNSIGNED_INT32, { message: 'Stock is too large' })
  stock!: number;

  @IsOptional()
  @IsArray({ message: 'Category IDs must be an array' })
  @ArrayMaxSize(MAX_CATEGORIES_PER_PRODUCT, {
    message: `A product can have at most ${MAX_CATEGORIES_PER_PRODUCT} categories`,
  })
  @ArrayUnique({ message: 'Category IDs must not contain duplicates' })
  @IsInt({ each: true, message: 'Each category ID must be an integer' })
  @Min(1, { each: true, message: 'Each category ID must be positive' })
  @Max(MAX_INT32, { each: true, message: 'Category ID is too large' })
  categoryIds?: number[];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(180)
  @Matches(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, {
    message: 'Slug may only contain letters, digits and single dashes',
  })
  slug?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  brandId?: number;

  @IsOptional()
  @IsInt({ message: 'Sale price must be an integer' })
  @Min(0, { message: 'Sale price cannot be negative' })
  @Max(MAX_UNSIGNED_INT32, { message: 'Sale price is too large' })
  sale_price?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Sale start must be a date' })
  sale_starts_at?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Sale end must be a date' })
  sale_ends_at?: string;

  @IsOptional()
  @IsInt({ message: 'Weight must be an integer number of grams' })
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  weight_grams?: number;

  @IsOptional()
  @IsBoolean()
  is_published?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_VARIANTS_PER_PRODUCT)
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];

  // Descriptive properties of the product as a whole: screen size,
  // fabric, SPF. These filter and display; they never split stock.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  attributes?: AttributeValueDto[];
}
