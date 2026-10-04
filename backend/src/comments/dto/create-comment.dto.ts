import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_INT32 } from '../../common/constants/limits';

export class CreateCommentDto {
  @IsNotEmpty({ message: 'Product id is required' })
  @IsInt({ message: 'Product id must be an integer' })
  @Min(1, { message: 'Product id must be positive' })
  @Max(MAX_INT32, { message: 'Product id is too large' })
  productId!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty({ message: 'Comment is required' })
  @IsString({ message: 'Comment must be a string' })
  @Length(5, 1000, {
    message: 'Comment must be between 5 and 1000 characters',
  })
  comment!: string;

  @ValidateIf(
    (dto: CreateCommentDto) =>
      dto.parentId === undefined || dto.parentId === null,
  )
  @IsNotEmpty({ message: 'Rate is required for a review' })
  @IsInt({ message: 'Rate must be an integer' })
  @Min(1, { message: 'Rate must be at least 1' })
  @Max(5, { message: 'Rate must not be greater than 5' })
  rate?: number;

  @IsOptional()
  @IsInt({ message: 'Parent id must be an integer' })
  @Min(1, { message: 'Parent id must be positive' })
  @Max(MAX_INT32, { message: 'Parent id is too large' })
  parentId?: number;
}
