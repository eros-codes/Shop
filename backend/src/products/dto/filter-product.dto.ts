import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { MAX_INT32, MAX_UNSIGNED_INT32 } from '../../common/constants/limits';

export class FilterProductDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  categoryId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  brandId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  maxPrice?: number;

  @IsOptional()
  @IsBooleanString({ message: 'inStock must be true or false' })
  inStock?: string;

  @IsOptional()
  @IsBooleanString({ message: 'onSale must be true or false' })
  onSale?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['price', 'created_at', 'title', 'rating', 'best_selling'])
  sortBy?: 'price' | 'created_at' | 'title' | 'rating' | 'best_selling';

  // Which attribute values to filter by, as option ids:
  // ?attributeOptions=12,31. Values of the SAME attribute are an OR
  // ("black or white"); different attributes are an AND
  // ("black AND size 42"), which is how every shop's filter panel
  // behaves.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((part) => Number(part.trim()))
          .filter((id) => Number.isInteger(id) && id > 0)
      : value,
  )
  @IsArray()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(MAX_INT32, { each: true })
  attributeOptions?: number[];

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
