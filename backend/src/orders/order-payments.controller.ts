import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { ZarinpalService } from '../payments/zarinpal.service';
import {
  PaymentGatewayUnavailableError,
  PaymentVerificationFailedError,
} from '../payments/payment-errors';
import OrderStatusEnum from './enums/order-status.enum';
import { ApiTags } from '@nestjs/swagger';

@SkipThrottle()
@ApiTags('Payments')
@Controller('payments/zarinpal')
export class OrderPaymentsController {
  private readonly logger = new Logger(OrderPaymentsController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly zarinpalService: ZarinpalService,
    private readonly configService: ConfigService,
  ) {}

  @Get('callback/order')
  async orderCallback(
    @Query('Authority') authority: string,
    @Query('Status') status: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    if (typeof authority !== 'string' || authority.trim() === '') {
      return this.notFound(res, frontendUrl);
    }

    const order = await this.ordersService.findByAuthority(authority);
    if (!order) {
      return this.notFound(res, frontendUrl);
    }

    if (status !== 'OK') {
      await this.ordersService.cancelUnpaidOrder(
        order.id,
        'customer did not complete the payment',
      );
      return this.failure(res, frontendUrl, order.id, 'Payment was cancelled');
    }

    try {
      const { refId } = await this.zarinpalService.verifyPayment(
        authority,
        order.total_price,
      );
      const outcome = await this.ordersService.finalizePaidOrder(
        order.id,
        refId ? `zarinpal:${refId}` : 'zarinpal',
      );

      if (outcome === 'refunded') {
        return this.respond(res, frontendUrl, 'payment-refunded', 200, {
          orderId: order.id,
          refId,
          message:
            'This order had already been closed, so the payment was credited to your wallet',
        });
      }
      return this.respond(res, frontendUrl, 'payment-success', 200, {
        orderId: order.id,
        refId,
        message: 'Payment verified successfully',
      });
    } catch (error) {
      if (error instanceof PaymentVerificationFailedError) {
        await this.ordersService.cancelUnpaidOrder(
          order.id,
          'payment verification failed',
        );
        return this.failure(
          res,
          frontendUrl,
          order.id,
          'Payment verification failed',
          400,
        );
      }
      if (error instanceof PaymentGatewayUnavailableError) {
        this.logger.warn(
          `Gateway unreachable while verifying order ${order.id} - leaving it open`,
        );
        return this.respond(res, frontendUrl, 'payment-pending', 202, {
          orderId: order.id,
          status: OrderStatusEnum.AwaitingPayment,
          message:
            'We could not reach the payment gateway to confirm this payment yet - your order stays reserved and we will confirm it shortly',
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
    if (frontendUrl) {
      const query = new URLSearchParams(
        Object.entries(data)
          .filter(([key, value]) => key !== 'message' && value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      ).toString();
      return res.redirect(`${frontendUrl}/${frontendPath}?${query}`);
    }
    const { message, ...rest } = data;
    return res.status(statusCode).json({
      statusCode,
      data: rest,
      message: message ?? 'Payment processed',
    });
  }

  private failure(
    res: Response,
    frontendUrl: string | undefined,
    orderId: number,
    message: string,
    statusCode = 200,
  ) {
    return this.respond(res, frontendUrl, 'payment-failed', statusCode, {
      orderId,
      message,
    });
  }

  private notFound(res: Response, frontendUrl?: string) {
    if (frontendUrl) {
      return res.redirect(`${frontendUrl}/payment-failed?reason=unknown_order`);
    }
    return res.status(404).json({
      statusCode: 404,
      data: null,
      message: 'No order found for this payment',
    });
  }
}
