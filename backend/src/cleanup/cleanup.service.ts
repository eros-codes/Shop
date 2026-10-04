import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { OtpVerification } from '../auth/entities/otp-verification.entity';
import { RateLimit } from '../common/throttler/rate-limit.entity';

const USED_TOKEN_RETENTION_HOURS = 24;

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(OtpVerification)
    private readonly otpRepository: Repository<OtpVerification>,
    @InjectRepository(RateLimit)
    private readonly rateLimitRepository: Repository<RateLimit>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupRateLimits(): Promise<void> {
    const result = await this.rateLimitRepository.delete({
      expires_at: LessThan(new Date()),
    });
    if (result.affected) {
      this.logger.log(
        `Cleanup: removed ${result.affected} expired rate-limit buckets`,
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpired(): Promise<void> {
    const now = new Date();

    const refreshResult = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(now),
    });
    const otpResult = await this.otpRepository.delete({
      expiresAt: LessThan(now),
    });
    const usedResult = await this.refreshTokenRepository.delete({
      usedAt: LessThan(
        new Date(now.getTime() - USED_TOKEN_RETENTION_HOURS * 60 * 60 * 1000),
      ),
    });

    this.logger.log(
      `Cleanup: removed ${refreshResult.affected ?? 0} expired refresh tokens, ` +
        `${usedResult.affected ?? 0} consumed ones past the reuse-detection window, ` +
        `${otpResult.affected ?? 0} expired OTP requests`,
    );
  }
}
