import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { WalletChargeRequest } from './entities/wallet-charge-request.entity';
import { WalletsService } from './wallets.service';
import {
  PaymentGatewayUnavailableError,
  PaymentVerificationFailedError,
} from '../payments/payment-errors';

const BATCH_SIZE = 50;
const SETTLE_AFTER_MS = 2 * 60 * 1000;
const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class WalletsMaintenanceService {
  private readonly logger = new Logger(WalletsMaintenanceService.name);

  constructor(
    @InjectRepository(WalletChargeRequest)
    private readonly chargeRequestRepository: Repository<WalletChargeRequest>,
    private readonly walletsService: WalletsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async settlePendingCharges(): Promise<void> {
    const pending = await this.chargeRequestRepository.find({
      select: { id: true, authority: true, createdAt: true },
      where: {
        status: 'pending',
        createdAt: LessThan(new Date(Date.now() - SETTLE_AFTER_MS)),
      },
      order: { createdAt: 'ASC' },
      take: BATCH_SIZE,
    });

    for (const chargeRequest of pending) {
      try {
        await this.walletsService.confirmCharge(chargeRequest.authority);
        this.logger.log(
          `Top-up ${chargeRequest.authority} confirmed by the maintenance job`,
        );
      } catch (error) {
        if (error instanceof PaymentVerificationFailedError) {
          await this.walletsService.failCharge(chargeRequest.authority);
          continue;
        }
        if (error instanceof PaymentGatewayUnavailableError) {
          const age = Date.now() - chargeRequest.createdAt.getTime();
          if (age > ABANDON_AFTER_MS) {
            this.logger.warn(
              `Top-up ${chargeRequest.authority} unverifiable for over 24h - marking it failed`,
            );
            await this.walletsService.failCharge(chargeRequest.authority);
          }
          continue;
        }
        this.logger.error(
          `Could not settle top-up ${chargeRequest.authority}: ${(error as Error).message}`,
        );
      }
    }
  }
}
