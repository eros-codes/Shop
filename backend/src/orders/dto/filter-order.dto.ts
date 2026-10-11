import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

import OrderStatusEnum from '../enums/order-status.enum';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FilterOrderDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatusEnum)
  status?: OrderStatusEnum;

  // An order number, an invoice number or (for staff) a customer's mobile.
  // The panel used to filter only the twenty rows on screen, so an order
  // on another page was "not found".
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(50)
  search?: string;
}
