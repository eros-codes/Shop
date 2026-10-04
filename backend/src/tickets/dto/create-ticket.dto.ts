import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_INT32 } from '../../common/constants/limits';

export class CreateTicketDto {
  @IsString({ message: 'Title Should Be String' })
  @IsNotEmpty({ message: 'Title Can Not Be Empty' })
  @MaxLength(255, { message: 'Title Must Be At Most 255 Characters' })
  title!: string;

  @IsString({ message: 'Subject Should Be String' })
  @IsNotEmpty({ message: 'Subject Can Not Be Empty' })
  @MaxLength(255, { message: 'Subject Must Be At Most 255 Characters' })
  subject!: string;

  @IsString({ message: 'Description Should Be String' })
  @IsNotEmpty({ message: 'Description Can Not Be Empty' })
  @MaxLength(5000, { message: 'Description Must Be At Most 5000 Characters' })
  description!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'reply_to Must Be An Integer' })
  @Min(1)
  @Max(MAX_INT32)
  reply_to?: number;
}
