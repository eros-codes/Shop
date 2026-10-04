import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { WalletsService } from './wallets.service';
import {
  PaymentGatewayUnavailableError,
  PaymentVerificationFailedError,
} from '../payments/payment-errors';
import { ApiTags } from '@nestjs/swagger';

@SkipThrottle()
@ApiTags('Payments')
@Controller('payments/zarinpal')
export class WalletPaymentsController {
  private readonly logger = new Logger(WalletPaymentsController.name);

  constructor(
    private readonly walletsService: WalletsService,
    private readonly configService: ConfigService,
  ) {}

  @Get('callback/wallet-charge')
  async walletChargeCallback(
    @Query('Authority') authority: string,
    @Query('Status') status: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    if (typeof authority !== 'string' || authority.trim() === '') {
      return this.respond(res, frontendUrl, 'wallet-charge-failed', 404, {
        message: 'No top-up found for this payment',
      });
    }

    if (status !== 'OK') {
      await this.walletsService.failCharge(authority);
      return this.respond(res, frontendUrl, 'wallet-charge-failed', 200, {
        message: 'Wallet top-up was cancelled',
      });
    }

    try {
      const wallet = await this.walletsService.confirmCharge(authority);
      return this.respond(res, frontendUrl, 'wallet-charge-success', 200, {
        walletId: wallet.id,
        message: 'Wallet charged successfully',
      });
    } catch (error) {
      if (error instanceof PaymentVerificationFailedError) {
        await this.walletsService.failCharge(authority);
        return this.respond(res, frontendUrl, 'wallet-charge-failed', 400, {
          message: 'Wallet top-up verification failed',
        });
      }
      if (error instanceof PaymentGatewayUnavailableError) {
        this.logger.warn(
          `Gateway unreachable while confirming top-up ${authority} - leaving it pending`,
        );
        return this.respond(res, frontendUrl, 'wallet-charge-pending', 202, {
          message:
            'We could not reach the payment gateway yet - if the payment went through, your wallet will be credited shortly',
        });
      }
      throw error;
    }
  }

  private respond(
    res: Response,
    frontendUrl: string | undefined,
    frontendPath: string,
    statusCode: number,
    data: Record<string, unknown>,
  ) {
    const { message, ...rest } = data;
    if (frontendUrl) {
      const query = new URLSearchParams(
        Object.entries(rest).map(([key, value]) => [key, String(value)]),
      ).toString();
      return res.redirect(
        `${frontendUrl}/${frontendPath}${query ? `?${query}` : ''}`,
      );
    }
    return res.status(statusCode).json({
      statusCode,
      data: Object.keys(rest).length ? rest : null,
      message,
    });
  }
}
