import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import userRoleEnum from '../enums/userRoleEnum';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FilterUserDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(userRoleEnum)
  role?: userRoleEnum;

  // Part of a mobile number or a name.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;
}
