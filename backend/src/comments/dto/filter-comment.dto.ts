import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import CommentStatusEnum from '../enums/comment-status.enum';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { MAX_INT32 } from '../../common/constants/limits';

export class FilterCommentDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  productId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_INT32)
  userId?: number;

  @IsOptional()
  @IsEnum(CommentStatusEnum)
  status?: CommentStatusEnum;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rate?: number;
}
