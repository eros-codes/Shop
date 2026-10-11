import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import OrderStatusEnum from '../enums/order-status.enum';
import { toAsciiDigits } from '../../common/validation/normalize';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatusEnum)
  status!: OrderStatusEnum;

  // Typed in the panel, often on a Persian keyboard. The customer pastes it
  // into the carrier's tracking page, which wants ASCII digits.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? toAsciiDigits(value.trim()) : value,
  )
  @IsString({ message: 'Tracking code must be a string' })
  @MaxLength(100, { message: 'Tracking code must be at most 100 characters' })
  tracking_code?: string;
}
