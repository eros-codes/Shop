import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_INT32 } from '../../common/constants/limits';

export class CreateCategoryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString({ message: 'Title must be a string' })
  @IsNotEmpty({ message: 'Title cannot be empty' })
  @MaxLength(255, { message: 'Title must be at most 255 characters' })
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  parentId?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(180)
  @Matches(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, {
    message: 'Slug may only contain letters, digits and single dashes',
  })
  slug?: string;
}
