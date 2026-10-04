import { IsEnum } from 'class-validator';
import userRoleEnum from '../enums/userRoleEnum';

export class UpdateUserRoleDto {
  @IsEnum(userRoleEnum)
  role!: userRoleEnum;
}
