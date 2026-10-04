import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateBrandDto {
  @IsString({ message: 'Title should be a string' })
  @IsNotEmpty({ message: "Title can't be empty" })
  @MaxLength(100, { message: 'Title must be at most 100 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  @Matches(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, {
    message: 'Slug may only contain letters, digits and single dashes',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Logo URL must be a valid URL' })
  @MaxLength(500)
  logo_url?: string;
}
