import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_INT32 } from '../../common/constants/limits';

export const MAX_ORDER_LINES = 50;

export class OrderItemDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  productId!: number;

  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(MAX_INT32)
  quantity!: number;

  @IsOptional()
  @IsInt({ message: 'variantId must be an integer' })
  @Min(1)
  @Max(MAX_INT32)
  variantId?: number;
}

export class CreateOrderDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  addressId!: number;

  @IsOptional()
  @IsString()
  discountCode?: string;

  @IsOptional()
  @IsBoolean()
  payWithWallet?: boolean;

  @IsOptional()
  @IsBoolean()
  payWithZarinpal?: boolean;

  @IsArray()
  @ArrayMinSize(1, { message: 'An order needs at least one item' })
  @ArrayMaxSize(MAX_ORDER_LINES)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @IsOptional()
  @IsInt({ message: 'shippingMethodId must be an integer' })
  @Min(1)
  @Max(MAX_INT32)
  shippingMethodId?: number;

  @IsOptional()
  @IsBoolean()
  payOnDelivery?: boolean;
}
