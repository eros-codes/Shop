import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_INT32 } from '../../common/constants/limits';
import { MAX_ORDER_LINES, OrderItemDto } from './create-order.dto';

export class UpdateOrderDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  addressId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'An order needs at least one item' })
  @ArrayMaxSize(MAX_ORDER_LINES)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];
}
