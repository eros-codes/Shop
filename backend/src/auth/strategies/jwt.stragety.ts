import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

interface JwtPayload {
  sub: number;
  role: string;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configServis: ConfigService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configServis.getOrThrow<string>('JWT_SECRET_KEY'),
    });
  }

  // This used to trust the token outright and never look at the database.
  // A signed token is proof of who someone *was* when it was issued, not of
  // what they are now, so for the whole of its 15-minute life:
  //  - a password reset did not lock out a token someone else was holding,
  //  - an admin demoted to customer kept admin rights,
  //  - a deleted account kept working.
  // One primary-key lookup per request closes all three. The role is taken
  // from the row, not the token, for the same reason.
  async validate(payload: JwtPayload) {
    const user = await this.users.findOne({
      select: {
        id: true,
        role: true,
        mobile: true,
        display_name: true,
        tokens_valid_after: true,
      },
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('This account no longer exists');
    }

    // `iat` has whole-second resolution, so compare in seconds: a token
    // issued in the same second as the password change (the fresh one the
    // customer gets right after it) must still be accepted.
    if (user.tokens_valid_after && payload.iat !== undefined) {
      const cutoff = Math.floor(user.tokens_valid_after.getTime() / 1000);
      if (payload.iat < cutoff) {
        throw new UnauthorizedException(
          'Your password was changed - please sign in again',
        );
      }
    }

    return {
      userId: user.id,
      mobile: user.mobile,
      display_name: user.display_name,
      role: user.role,
    };
  }
}
