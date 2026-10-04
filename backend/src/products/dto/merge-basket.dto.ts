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

export class MergeBasketLineDto {
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  product_id!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  variant_id?: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
}

// The basket a visitor built before signing in.
export class MergeBasketDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Send at least one line' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MergeBasketLineDto)
  items!: MergeBasketLineDto[];
}
