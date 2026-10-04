import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_INT32 } from '../../common/constants/limits';
import { MAX_ORDER_LINES } from '../../orders/dto/create-order.dto';
import ReturnReasonEnum from '../enums/return-reason.enum';
import ReturnStatusEnum from '../enums/return-status.enum';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ReturnItemDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  orderItemId!: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
}

export class CreateReturnRequestDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  orderId!: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Say which items you are sending back' })
  @ArrayMaxSize(MAX_ORDER_LINES)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];

  @IsEnum(ReturnReasonEnum, { message: 'Choose a reason for the return' })
  reason!: ReturnReasonEnum;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateReturnStatusDto {
  @IsEnum(ReturnStatusEnum)
  status!: ReturnStatusEnum;

  @IsOptional()
  @IsBoolean()
  restock?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  admin_note?: string;
}

export class FilterReturnRequestDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ReturnStatusEnum)
  status?: ReturnStatusEnum;
}
