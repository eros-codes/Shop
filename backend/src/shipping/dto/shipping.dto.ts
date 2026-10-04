import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_INT32, MAX_UNSIGNED_INT32 } from '../../common/constants/limits';
import { MAX_ORDER_LINES } from '../../orders/dto/create-order.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateShippingMethodDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Title cannot be empty' })
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
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  estimated_days_min?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  estimated_days_max?: number;

  @IsOptional()
  @IsBoolean()
  supports_cash_on_delivery?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sort_order?: number;
}

export class UpdateShippingMethodDto extends PartialType(
  CreateShippingMethodDto,
) {}

export class CreateShippingZoneDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  provinces?: string[];

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class UpdateShippingZoneDto extends PartialType(CreateShippingZoneDto) {}

export class UpsertShippingRateDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  zoneId!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  base_cost!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  per_kg_cost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  free_shipping_threshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  cash_on_delivery_fee?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class QuoteItemDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  productId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  variantId?: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
}

export class ShippingQuoteDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  addressId!: number;

  @IsArray()
  @ArrayMaxSize(MAX_ORDER_LINES)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items!: QuoteItemDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNSIGNED_INT32)
  goodsTotal?: number;
}
