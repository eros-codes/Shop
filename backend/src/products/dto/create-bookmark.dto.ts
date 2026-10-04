import { IsInt, IsNotEmpty, IsOptional, Max, Min } from 'class-validator';
import { MAX_INT32 } from '../../common/constants/limits';

export class CreateBookmarkDto {
  @IsNotEmpty({ message: 'Product id is required' })
  @IsInt({ message: 'Product id must be an integer' })
  @Min(1, { message: 'Product id must be positive' })
  @Max(MAX_INT32, { message: 'Product id is too large' })
  product_id!: number;

  @IsOptional()
  @IsInt({ message: 'variantId must be an integer' })
  @Min(1)
  @Max(MAX_INT32)
  variant_id?: number;
}
