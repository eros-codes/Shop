import { SetMetadata } from '@nestjs/common';
import userRoleEnum from '../../users/enums/userRoleEnum';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: userRoleEnum[]) =>
  SetMetadata(ROLES_KEY, roles);
