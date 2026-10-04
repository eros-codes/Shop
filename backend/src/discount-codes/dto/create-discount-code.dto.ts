import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import DiscountStatusEnum from '../enums/discount-status.enum';
import DiscountTypeEnum from '../enums/discount-type.enum';
import { MAX_INT32, MAX_UNSIGNED_INT32 } from '../../common/constants/limits';

export class CreateDiscountCodeDto {
  @IsNotEmpty({ message: 'Code cannot be empty' })
  @IsString({ message: 'Code must be a string' })
  @MaxLength(255, { message: 'Code must be at most 255 characters' })
  code!: string;

  @IsInt({ message: 'Capacity must be an integer' })
  @Min(1, { message: 'Capacity must be at least 1' })
  @Max(2147483647, { message: 'Capacity is too large' })
  capacity!: number;

  @IsOptional()
  @IsEnum(DiscountTypeEnum)
  type?: DiscountTypeEnum;

  @IsOptional()
  @IsInt({ message: 'Off percent must be an integer' })
  @Min(1, { message: 'Off percent must be at least 1' })
  @Max(100, { message: 'Off percent cannot be more than 100' })
  off_percent?: number;

  @IsOptional()
  @IsInt({ message: 'Off amount must be an integer' })
  @Min(1, { message: 'Off amount must be at least 1' })
  @Max(MAX_UNSIGNED_INT32)
  off_amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_UNSIGNED_INT32)
  max_discount_amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_UNSIGNED_INT32)
  min_order_amount?: number;

  @IsOptional()
  @IsDateString({}, { message: 'starts_at must be a date' })
  starts_at?: string;

  @IsOptional()
  @IsDateString({}, { message: 'expires_at must be a date' })
  expires_at?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  per_user_limit?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(MAX_INT32, { each: true })
  productIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(MAX_INT32, { each: true })
  categoryIds?: number[];

  @IsOptional()
  @IsEnum(DiscountStatusEnum)
  status?: DiscountStatusEnum;
}
