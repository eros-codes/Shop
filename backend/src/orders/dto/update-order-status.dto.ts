import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import OrderStatusEnum from '../enums/order-status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatusEnum)
  status!: OrderStatusEnum;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Tracking code must be a string' })
  @MaxLength(100, { message: 'Tracking code must be at most 100 characters' })
  tracking_code?: string;
}
