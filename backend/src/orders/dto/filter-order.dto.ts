import { IsEnum, IsOptional } from 'class-validator';

import OrderStatusEnum from '../enums/order-status.enum';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FilterOrderDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatusEnum)
  status?: OrderStatusEnum;
}
