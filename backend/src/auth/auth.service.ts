import {
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
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
  timingSafeEqual,
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
import { isDuplicateEntryError } from '../common/database/mysql-errors';

const MAX_OTP_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_SENDS_PER_HOUR = 5;
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
// Every tab of the site shares one refresh cookie, so two tabs whose access
// tokens run out together both send the same refresh token. The first
// rotates it; the second, a moment later, would look like a stolen token
// being replayed. Within this window a used token gets a fresh pair in the
// same chain instead. Same idea as Okta's grace period and Supabase's reuse
// interval; long enough for a slow mobile network.
const REFRESH_REUSE_GRACE_MS = 30 * 1000;

// Compared against when the mobile number has no account, so a wrong
// number costs the same bcrypt round as a wrong password. Answering those
// instantly let anyone time the login form to learn who is registered.
const TIMING_DUMMY_HASH =
  '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.Lqk8V0P5x8nqE4p4rEtiUunbCVTS';

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

  private otpMatches(code: string, codeHash: string): boolean {
    const given = Buffer.from(this.hashOtp(code), 'hex');
    const stored = Buffer.from(codeHash, 'hex');
    return given.length === stored.length && timingSafeEqual(given, stored);
  }

  // The one place a code is checked, for signup and reset alike.
  //
  // The row is read FOR UPDATE, so guesses for the same number are judged
  // one at a time. Read without a lock, a burst of parallel requests all
  // saw attempts = 0, all got compared, and the five-try limit stopped
  // nothing - on the reset flow that is a way into someone's account.
  //
  // The outcome leaves the transaction as a value rather than an
  // exception: a thrown error would roll back the attempt it just counted.
  // A correct code is deleted in the same transaction, so it works once.
  private async consumeOtp(
    mobile: string,
    purpose: OtpPurposeEnum,
    code: string,
  ): Promise<OtpVerification> {
    type Outcome = { error: AppError } | { otp: OtpVerification };
    const outcome = await this.dataSource.transaction(
      async (manager): Promise<Outcome> => {
        const otps = manager.getRepository(OtpVerification);
        const otp = await otps.findOne({
          where: { mobile, purpose },
          lock: { mode: 'pessimistic_write' },
        });
        if (!otp) {
          return {
            error: AppError.badRequest(
              ErrorCodes.OTP_NOT_FOUND,
              'No verification code is pending for this mobile number - request a new one',
            ),
          };
        }
        if (otp.expiresAt < new Date()) {
          await otps.delete({ id: otp.id });
          return {
            error: AppError.badRequest(
              ErrorCodes.OTP_EXPIRED,
              'This code has expired - please request a new one',
            ),
          };
        }
        if (!this.otpMatches(code, otp.codeHash)) {
          otp.attempts += 1;
          if (otp.attempts >= MAX_OTP_ATTEMPTS) {
            await otps.delete({ id: otp.id });
            return {
              error: AppError.badRequest(
                ErrorCodes.OTP_ATTEMPTS_EXCEEDED,
                'Too many incorrect attempts - please request a new code',
              ),
            };
          }
          await otps.save(otp);
          return {
            error: AppError.badRequest(
              ErrorCodes.OTP_INCORRECT,
              'Incorrect verification code',
              { attemptsLeft: MAX_OTP_ATTEMPTS - otp.attempts },
            ),
          };
        }
        await otps.delete({ id: otp.id });
        return { otp };
      },
    );

    if ('error' in outcome) throw outcome.error;
    return outcome.otp;
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

  // Sign-up and "forgot password" both start by sending a code, and both
  // must answer the same whether or not the number has an account -
  // otherwise either form tells anyone who is registered. Same answer,
  // same time taken, same point at which it starts saying "wait":
  //
  // - the cooldown and hourly cap are counted for every number asked
  //   about, account or not (they used to be skipped on one side, so a
  //   second request in a row answered 200 or 429 depending on it);
  // - a number that cannot use a code still gets a row, holding a hash no
  //   code matches, so verifying fails exactly as a wrong guess does;
  // - the SMS leaves after the answer, so the round trip to sms.ir does
  //   not show in the response time.
  async register(registerDto: RegisterDto): Promise<{ mobile: string }> {
    const { mobile, password, display_name } = registerDto;
    this.assertSmsAvailable();

    // Hashed even when it will be thrown away: bcrypt is most of this
    // request's time, and skipping it for known numbers timed them apart.
    const hashedPassword = await bcrypt.hash(password, 10);
    const existingUser = await this.userService.findOneByMobile(mobile);

    const code = await this.storeCode(mobile, OtpPurposeEnum.Register, {
      usable: !existingUser,
      displayName: display_name,
      hashedPassword,
    });
    // The owner of a registered number is told so instead of getting a
    // code - someone else may be trying their number, or they forgot.
    this.sendInBackground(mobile, OtpPurposeEnum.Register, code);
    return { mobile };
  }

  // Step one of "I forgot my password": a code goes to the number, if it
  // has an account. See register() for why the answer never says which.
  async forgotPassword(mobile: string): Promise<{ mobile: string }> {
    this.assertSmsAvailable();
    const user = await this.userService.findOneByMobile(mobile);
    const code = await this.storeCode(mobile, OtpPurposeEnum.PasswordReset, {
      usable: !!user,
    });
    if (code) {
      this.sendInBackground(mobile, OtpPurposeEnum.PasswordReset, code);
    }
    return { mobile };
  }

  // Writes the pending code for (number, purpose) after checking the
  // resend cooldown and the hourly cap. Returns the code to send, or null
  // when the row is a decoy whose hash nothing matches.
  private async storeCode(
    mobile: string,
    purpose: OtpPurposeEnum,
    options: {
      usable: boolean;
      displayName?: string | null;
      hashedPassword?: string | null;
    },
  ): Promise<string | null> {
    const now = new Date();
    const existing = await this.otpRepository.findOneBy({ mobile, purpose });
    let sendCount = 1;
    let windowStartedAt = now;

    if (existing) {
      const lastSentAt = existing.lastSentAt ?? existing.createdAt;
      const secondsSinceLastSend =
        (now.getTime() - lastSentAt.getTime()) / 1000;
      if (secondsSinceLastSend < OTP_RESEND_COOLDOWN_SECONDS) {
        throw this.otpCooldown(
          Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend),
        );
      }

      const windowStart = existing.windowStartedAt ?? existing.createdAt;
      const windowAge = now.getTime() - windowStart.getTime();
      if (windowAge < OTP_SEND_WINDOW_MS) {
        if (existing.sendCount >= MAX_OTP_SENDS_PER_HOUR) {
          const retryAfter = Math.ceil((OTP_SEND_WINDOW_MS - windowAge) / 1000);
          throw new AppError(
            ErrorCodes.OTP_SEND_LIMIT,
            `Too many codes have been requested for this number - please try again in ${Math.ceil(retryAfter / 60)} minute(s)`,
            HttpStatus.TOO_MANY_REQUESTS,
            { retryAfter },
          );
        }
        sendCount = existing.sendCount + 1;
        windowStartedAt = windowStart;
      }
    }

    const code = randomInt(100000, 1000000).toString();
    const minutes = Number(
      this.configService.get('OTP_EXPIRATION_MINUTES') ?? 5,
    );
    try {
      await this.otpRepository.save(
        this.otpRepository.create({
          ...(existing ?? {}),
          mobile,
          purpose,
          codeHash: options.usable
            ? this.hashOtp(code)
            : randomBytes(32).toString('hex'),
          displayName: options.usable ? (options.displayName ?? null) : null,
          hashedPassword: options.usable
            ? (options.hashedPassword ?? null)
            : null,
          expiresAt: new Date(now.getTime() + minutes * 60 * 1000),
          attempts: 0,
          lastSentAt: now,
          sendCount,
          windowStartedAt,
        }),
      );
    } catch (error) {
      // Two requests for a new number at once: both found no row and the
      // second insert hit the unique key. The first one sent the code.
      if (isDuplicateEntryError(error)) {
        throw this.otpCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      }
      throw error;
    }
    return options.usable ? code : null;
  }

  // Codes are sent after the answer, so a shop with no SMS set up would
  // say "code sent" and send nothing. Refused up front instead - the same
  // for every number, so it gives nothing away.
  private assertSmsAvailable(): void {
    if (!this.smsService.canSendOtp) {
      throw new ServiceUnavailableException(
        'SMS delivery is not available right now, please try again shortly',
      );
    }
  }

  private otpCooldown(retryAfter: number): AppError {
    return new AppError(
      ErrorCodes.OTP_COOLDOWN,
      `Please wait ${retryAfter}s before requesting another code`,
      HttpStatus.TOO_MANY_REQUESTS,
      { retryAfter },
    );
  }

  // Nobody is waiting on the request any more, so a failed send cannot be
  // reported back. The cooldown is lifted instead, so "send again" works
  // straight away rather than after a minute of waiting for nothing.
  private sendInBackground(
    mobile: string,
    purpose: OtpPurposeEnum,
    code: string | null,
  ): void {
    const send = code
      ? this.smsService.sendOtp(mobile, code)
      : this.smsService.sendAccountExists(mobile);
    void send.catch(async (error: unknown) => {
      this.logger.error(
        `Could not send the ${purpose} SMS to ${mobile}: ${String(error)}`,
      );
      try {
        await this.otpRepository.update(
          { mobile, purpose },
          {
            lastSentAt: new Date(
              Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000,
            ),
          },
        );
      } catch (updateError) {
        this.logger.error(
          `Could not lift the resend cooldown for ${mobile}: ${String(updateError)}`,
        );
      }
    });
  }

  // Step two: the code proves the number, and the password is replaced.
  // Every existing session is thrown away - whoever locked them out may
  // still be holding a refresh token.
  async resetPassword(dto: {
    mobile: string;
    code: string;
    password: string;
  }): Promise<void> {
    await this.consumeOtp(dto.mobile, OtpPurposeEnum.PasswordReset, dto.code);

    const user = await this.userService.findOneByMobile(dto.mobile);
    if (!user) {
      throw AppError.badRequest(
        ErrorCodes.OTP_NOT_FOUND,
        'No account exists for this number',
      );
    }

    await this.userService.setPassword(
      user.id,
      await bcrypt.hash(dto.password, 10),
    );
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
    const otp = await this.consumeOtp(mobile, OtpPurposeEnum.Register, code);

    let user: User;
    try {
      user = await this.userService.createWithHashedPassword({
        mobile: otp.mobile,
        display_name: otp.displayName ?? otp.mobile,
        hashedPassword: otp.hashedPassword ?? '',
        role: userRoleEnum.NormalUser,
      });
    } catch (error) {
      // The number was registered meanwhile (a second tab, an admin
      // creating the account) - that is a conflict, not a server error.
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(
          'An account with this mobile number already exists - sign in instead',
        );
      }
      throw error;
    }

    const tokens = await this.issueTokens(user);
    return { user, ...tokens };
  }

  async login(loginDto: LoginDto) {
    const { mobile, password } = loginDto;
    const user = await this.userService.findOneByMobileWithPassword(mobile);
    if (!user) {
      await bcrypt.compare(password, TIMING_DUMMY_HASH);
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
      // Unless it was consumed moments ago - that is a second tab (see
      // REFRESH_REUSE_GRACE_MS). Math.abs: the column keeps whole seconds,
      // so a usedAt rounded up can sit a fraction of a second in the future.
      if (record.usedAt) {
        const sinceUse = Math.abs(Date.now() - record.usedAt.getTime());
        if (
          sinceUse < REFRESH_REUSE_GRACE_MS &&
          record.expiresAt > new Date()
        ) {
          const tokens = await this.issueTokens(record.user, {
            familyId: record.familyId,
            manager,
          });
          return { kind: 'rotated' as const, tokens };
        }
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
