import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class SalesReportDto {
  @IsOptional()
  @IsDateString({}, { message: 'from must be a date' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'to must be a date' })
  to?: string;

  @IsOptional()
  @IsIn(['day', 'month'])
  granularity?: 'day' | 'month';
}

export class TopProductsDto extends SalesReportDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class LowStockDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  threshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
