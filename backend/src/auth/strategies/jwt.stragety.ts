import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import userRoleEnum from '../../users/enums/userRoleEnum';

interface JwtPayload {
  sub: number;
  mobile: string;
  display_name?: string;
  role: userRoleEnum;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configServis: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configServis.getOrThrow<string>('JWT_SECRET_KEY'),
    });
  }

  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      mobile: payload.mobile,
      display_name: payload.display_name,
      role: payload.role,
    };
  }
}
