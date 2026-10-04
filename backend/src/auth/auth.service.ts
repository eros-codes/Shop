import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  randomBytes,
  randomInt,
  randomUUID,
  createHash,
  createHmac,
} from 'crypto';
import { UsersService } from '../users/users.service';
import userRoleEnum from '../users/enums/userRoleEnum';
import OtpPurposeEnum from './enums/otp-purpose.enum';
import { User } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { OtpVerification } from './entities/otp-verification.entity';
import { SmsService } from '../sms/sms.service';
import { AppError } from '../common/errors/app-error';
import { ErrorCodes } from '../common/errors/error-codes';

const MAX_OTP_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_SENDS_PER_HOUR = 5;
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(OtpVerification)
    private readonly otpRepository: Repository<OtpVerification>,
    private readonly smsService: SmsService,
    private readonly dataSource: DataSource,
  ) {}

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashOtp(code: string): string {
    const secret = this.configService.get<string>('OTP_HASH_SECRET')!;
    return createHmac('sha256', secret).update(code).digest('hex');
  }

  private async issueTokens(
    user: User,
    options: { familyId?: string; manager?: EntityManager } = {},
  ) {
    const payload = {
      sub: user.id,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);

    const rawRefreshToken = randomBytes(64).toString('hex');
    const days = Number(
      this.configService.get('REFRESH_TOKEN_EXPIRATION_DAYS') ?? 30,
    );
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const repository = options.manager
      ? options.manager.getRepository(RefreshToken)
      : this.refreshTokenRepository;
    const refreshTokenRecord = repository.create({
      tokenHash: this.hashRefreshToken(rawRefreshToken),
      user,
      expiresAt,
      familyId: options.familyId ?? randomUUID(),
    });
    await repository.save(refreshTokenRecord);

    return { accessToken, refreshToken: rawRefreshToken };
  }

  async register(registerDto: RegisterDto): Promise<{ mobile: string }> {
    const { mobile, password, display_name } = registerDto;

    const existingUser = await this.userService.findOneByMobile(mobile);
    if (existingUser) {
      return { mobile };
    }

    const now = new Date();
    const existingOtp = await this.otpRepository.findOneBy({
      mobile,
      purpose: OtpPurposeEnum.Register,
    });
    let sendCount = 1;
    let windowStartedAt = now;

    if (existingOtp) {
      const lastSentAt = existingOtp.lastSentAt ?? existingOtp.createdAt;
      const secondsSinceLastSend =
        (now.getTime() - lastSentAt.getTime()) / 1000;
      if (secondsSinceLastSend < OTP_RESEND_COOLDOWN_SECONDS) {
        throw new HttpException(
          `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend)}s before requesting another code`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const windowStart = existingOtp.windowStartedAt ?? existingOtp.createdAt;
      const windowAge = now.getTime() - windowStart.getTime();
      if (windowAge < OTP_SEND_WINDOW_MS) {
        if (existingOtp.sendCount >= MAX_OTP_SENDS_PER_HOUR) {
          const minutes = Math.ceil((OTP_SEND_WINDOW_MS - windowAge) / 60000);
          throw new HttpException(
            `Too many verification codes have been requested for this number - please try again in ${minutes} minute(s)`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        sendCount = existingOtp.sendCount + 1;
        windowStartedAt = windowStart;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const code = randomInt(100000, 1000000).toString();
    const minutes = Number(
      this.configService.get('OTP_EXPIRATION_MINUTES') ?? 5,
    );
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

    const otp = this.otpRepository.create({
      ...(existingOtp ?? {}),
      mobile,
      purpose: OtpPurposeEnum.Register,
      codeHash: this.hashOtp(code),
      displayName: display_name,
      hashedPassword,
      expiresAt,
      attempts: 0,
      lastSentAt: now,
      sendCount,
      windowStartedAt,
    });
    await this.otpRepository.save(otp);

    await this.smsService.sendOtp(mobile, code);

    return { mobile };
  }

  // Resend cooldown and the hourly cap, counted per (number, purpose).
  // Extracted so password reset is throttled exactly as registration is
  // rather than quietly becoming a free SMS endpoint.
  private async assertCanSendOtp(
    mobile: string,
    purpose: OtpPurposeEnum,
    now: Date,
  ): Promise<{
    sendCount: number;
    windowStartedAt: Date;
    existing: OtpVerification | null;
  }> {
    const existing = await this.otpRepository.findOneBy({ mobile, purpose });
    let sendCount = 1;
    let windowStartedAt = now;

    if (existing) {
      const lastSentAt = existing.lastSentAt ?? existing.createdAt;
      const secondsSinceLastSend =
        (now.getTime() - lastSentAt.getTime()) / 1000;
      if (secondsSinceLastSend < OTP_RESEND_COOLDOWN_SECONDS) {
        throw new HttpException(
          `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend)}s before requesting another code`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const windowStart = existing.windowStartedAt ?? existing.createdAt;
      const windowAge = now.getTime() - windowStart.getTime();
      if (windowAge < OTP_SEND_WINDOW_MS) {
        if (existing.sendCount >= MAX_OTP_SENDS_PER_HOUR) {
          const minutes = Math.ceil((OTP_SEND_WINDOW_MS - windowAge) / 60000);
          throw new HttpException(
            `Too many verification codes have been requested for this number - please try again in ${minutes} minute(s)`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        sendCount = existing.sendCount + 1;
        windowStartedAt = windowStart;
      }
    }

    return { sendCount, windowStartedAt, existing };
  }

  // Step one of "I forgot my password": a code goes to the number.
  //
  // The answer is the same whether or not an account exists. Telling the
  // caller "no such user" would turn this into a way to find out which
  // numbers are registered.
  async forgotPassword(mobile: string): Promise<{ mobile: string }> {
    const user = await this.userService.findOneByMobile(mobile);
    if (!user) {
      return { mobile };
    }

    const now = new Date();
    const { sendCount, windowStartedAt, existing } =
      await this.assertCanSendOtp(mobile, OtpPurposeEnum.PasswordReset, now);

    const code = randomInt(100000, 1000000).toString();
    const minutes = Number(
      this.configService.get('OTP_EXPIRATION_MINUTES') ?? 5,
    );

    await this.otpRepository.save(
      this.otpRepository.create({
        ...(existing ?? {}),
        mobile,
        purpose: OtpPurposeEnum.PasswordReset,
        codeHash: this.hashOtp(code),
        displayName: null,
        hashedPassword: null,
        expiresAt: new Date(Date.now() + minutes * 60 * 1000),
        attempts: 0,
        lastSentAt: now,
        sendCount,
        windowStartedAt,
      }),
    );

    await this.smsService.sendOtp(mobile, code);
    return { mobile };
  }

  // Step two: the code proves the number, and the password is replaced.
  // Every existing session is thrown away - whoever locked them out may
  // still be holding a refresh token.
  async resetPassword(dto: {
    mobile: string;
    code: string;
    password: string;
  }): Promise<void> {
    const otp = await this.otpRepository.findOneBy({
      mobile: dto.mobile,
      purpose: OtpPurposeEnum.PasswordReset,
    });
    if (!otp) {
      throw new BadRequestException(
        'No password reset is in progress for this mobile number',
      );
    }
    if (otp.expiresAt < new Date()) {
      await this.otpRepository.remove(otp);
      throw AppError.badRequest(
        ErrorCodes.OTP_EXPIRED,
        'This code has expired - please request a new one',
      );
    }
    if (this.hashOtp(dto.code) !== otp.codeHash) {
      otp.attempts += 1;
      if (otp.attempts >= MAX_OTP_ATTEMPTS) {
        await this.otpRepository.remove(otp);
        throw new BadRequestException(
          'Too many incorrect attempts - please request a new code',
        );
      }
      await this.otpRepository.save(otp);
      throw AppError.badRequest(
        ErrorCodes.OTP_INCORRECT,
        'Incorrect verification code',
        { attemptsLeft: MAX_OTP_ATTEMPTS - otp.attempts },
      );
    }

    const user = await this.userService.findOneByMobile(dto.mobile);
    if (!user) {
      await this.otpRepository.remove(otp);
      throw new BadRequestException('No account exists for this number');
    }

    await this.userService.setPassword(
      user.id,
      await bcrypt.hash(dto.password, 10),
    );
    await this.otpRepository.remove(otp);
    await this.refreshTokenRepository.delete({ user: { id: user.id } });
  }

  // Changing a password while signed in: the current one has to be
  // given, and every session is re-authenticated afterwards.
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userService.findOneWithPassword(userId);
    if (!user) {
      throw new UnauthorizedException('Mobile or password is incorrect');
    }
    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      throw AppError.unauthorized(
        ErrorCodes.CURRENT_PASSWORD_INCORRECT,
        'The current password is incorrect',
      );
    }

    await this.userService.setPassword(
      userId,
      await bcrypt.hash(newPassword, 10),
    );
    await this.refreshTokenRepository.delete({ user: { id: userId } });
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { mobile, code } = verifyOtpDto;

    const otp = await this.otpRepository.findOneBy({
      mobile,
      purpose: OtpPurposeEnum.Register,
    });
    if (!otp) {
      throw new BadRequestException(
        'No pending registration for this mobile number',
      );
    }
    if (otp.expiresAt < new Date()) {
      await this.otpRepository.remove(otp);
      throw new BadRequestException(
        'Verification code has expired, please register again',
      );
    }

    if (this.hashOtp(code) !== otp.codeHash) {
      otp.attempts += 1;
      if (otp.attempts >= MAX_OTP_ATTEMPTS) {
        await this.otpRepository.remove(otp);
        throw new BadRequestException(
          'Too many incorrect attempts - please register again for a new code',
        );
      }
      await this.otpRepository.save(otp);
      throw new BadRequestException('Incorrect verification code');
    }

    const user = await this.userService.createWithHashedPassword({
      mobile: otp.mobile,
      display_name: otp.displayName ?? otp.mobile,
      hashedPassword: otp.hashedPassword ?? '',
      role: userRoleEnum.NormalUser,
    });

    await this.otpRepository.remove(otp);

    const tokens = await this.issueTokens(user);
    return { user, ...tokens };
  }

  async login(loginDto: LoginDto) {
    const { mobile, password } = loginDto;
    const user = await this.userService.findOneByMobileWithPassword(mobile);
    if (!user) {
      throw AppError.unauthorized(
        ErrorCodes.INVALID_CREDENTIALS,
        'Mobile or password is incorrect',
      );
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw AppError.unauthorized(
        ErrorCodes.INVALID_CREDENTIALS,
        'Mobile or password is incorrect',
      );
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);

    const outcome = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RefreshToken);
      const record = await repo.findOne({
        where: { tokenHash },
        relations: { user: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (!record) {
        return { kind: 'unknown' as const };
      }
      // Reuse detection: a consumed token being replayed means it leaked, so
      // the whole session family is thrown away rather than just this token.
      if (record.usedAt) {
        return {
          kind: 'reused' as const,
          familyId: record.familyId,
          userId: record.user?.id,
        };
      }
      if (record.expiresAt < new Date()) {
        return { kind: 'expired' as const, familyId: record.familyId };
      }

      const consumed = await repo
        .createQueryBuilder()
        .update(RefreshToken)
        .set({ usedAt: new Date() })
        // Conditional UPDATE: consumption has to be atomic, or two parallel
        // refreshes both rotate the same token.
        .where('id = :id AND usedAt IS NULL', { id: record.id })
        .execute();
      if (!consumed.affected) {
        return { kind: 'unknown' as const };
      }

      const tokens = await this.issueTokens(record.user, {
        familyId: record.familyId,
        manager,
      });
      return { kind: 'rotated' as const, tokens };
    });

    if (outcome.kind === 'rotated') {
      return outcome.tokens;
    }

    if (outcome.kind === 'reused') {
      await this.refreshTokenRepository.delete({ familyId: outcome.familyId });
      this.logger.warn(
        `Refresh token reuse detected for user ${outcome.userId ?? 'unknown'} - the whole session chain was revoked`,
      );
      throw new UnauthorizedException(
        'This refresh token has already been used - every session it belongs to has been revoked, please log in again',
      );
    }

    if (outcome.kind === 'expired') {
      await this.refreshTokenRepository.delete({ familyId: outcome.familyId });
      throw new UnauthorizedException(
        'Refresh token has expired, please log in again',
      );
    }

    throw new UnauthorizedException('Invalid refresh token');
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const record = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
      select: { id: true, familyId: true },
    });
    if (!record) {
      return;
    }
    await this.refreshTokenRepository.delete({ familyId: record.familyId });
  }
}
