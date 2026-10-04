import { IsEnum, IsOptional } from 'class-validator';
import userRoleEnum from '../enums/userRoleEnum';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FilterUserDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(userRoleEnum)
  role?: userRoleEnum;
}
