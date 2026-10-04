import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateCommentDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Comment must be a string' })
  @Length(5, 1000, {
    message: 'Comment must be between 5 and 1000 characters',
  })
  comment?: string;

  @IsOptional()
  @IsInt({ message: 'Rate must be an integer' })
  @Min(1, { message: 'Rate must be at least 1' })
  @Max(5, { message: 'Rate must not be greater than 5' })
  rate?: number;
}
