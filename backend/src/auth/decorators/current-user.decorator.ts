import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import userRoleEnum from '../../users/enums/userRoleEnum';

export interface CurrentUserPayload {
  userId: number;
  mobile: string;
  display_name: string;
  role: userRoleEnum;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: CurrentUserPayload }>();
    return request.user;
  },
);
