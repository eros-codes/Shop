import { IsEnum } from 'class-validator';
import CommentStatusEnum from '../enums/comment-status.enum';

export class UpdateCommentStatusDto {
  @IsEnum(CommentStatusEnum)
  status!: CommentStatusEnum;
}
