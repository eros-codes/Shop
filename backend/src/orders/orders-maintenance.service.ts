import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Not, Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import OrderStatusEnum from './enums/order-status.enum';
import { OrdersService } from './orders.service';
import { ZarinpalService } from '../payments/zarinpal.service';
import {
  PaymentGatewayUnavailableError,
  PaymentVerificationFailedError,
} from '../payments/payment-errors';
import { PAYMENT_UNKNOWN_GRACE_HOURS } from '../common/constants/money';

const BATCH_SIZE = 50;

@Injectable()
export class OrdersMaintenanceService {
  private readonly logger = new Logger(OrdersMaintenanceService.name);

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly ordersService: OrdersService,
    private readonly zarinpalService: ZarinpalService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async closeExpiredPaymentSessions(): Promise<void> {
    const expired = await this.ordersRepository.find({
      select: {
        id: true,
        total_price: true,
        zarinpalAuthority: true,
        payment_expires_at: true,
      },
      where: {
        status: OrderStatusEnum.AwaitingPayment,
        payment_expires_at: LessThan(new Date()),
        deletedAt: IsNull(),
      },
      order: { payment_expires_at: 'ASC' },
      take: BATCH_SIZE,
    });

    for (const order of expired) {
      try {
        await this.settle(order);
      } catch (error) {
        this.logger.error(
          `Could not settle expired order ${order.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async settle(order: Order): Promise<void> {
    if (!order.zarinpalAuthority) {
      await this.ordersService.cancelUnpaidOrder(
        order.id,
        'payment session expired without a gateway session',
      );
      return;
    }

    try {
      const { refId } = await this.zarinpalService.verifyPayment(
        order.zarinpalAuthority,
        order.total_price,
      );
      const outcome = await this.ordersService.finalizePaidOrder(
        order.id,
        refId ? `zarinpal:${refId}` : 'zarinpal',
      );
      this.logger.log(
        `Expired order ${order.id} turned out to be paid (${outcome})`,
      );
    } catch (error) {
      if (error instanceof PaymentVerificationFailedError) {
        await this.ordersService.cancelUnpaidOrder(
          order.id,
          'payment session expired unpaid',
        );
        return;
      }
      if (error instanceof PaymentGatewayUnavailableError) {
        const expiredAt = order.payment_expires_at?.getTime() ?? Date.now();
        const graceMs = PAYMENT_UNKNOWN_GRACE_HOURS * 60 * 60 * 1000;
        if (Date.now() - expiredAt > graceMs) {
          this.logger.warn(
            `Order ${order.id} has been unverifiable for over ${PAYMENT_UNKNOWN_GRACE_HOURS}h - cancelling`,
          );
          await this.ordersService.cancelUnpaidOrder(
            order.id,
            'payment could not be verified within the grace period',
          );
          return;
        }
        this.logger.warn(
          `Gateway unreachable while settling order ${order.id} - will retry`,
        );
        return;
      }
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async adoptLegacyPendingSessions(): Promise<void> {
    const legacy = await this.ordersRepository.find({
      select: { id: true },
      where: {
        status: OrderStatusEnum.Pending,
        zarinpalAuthority: Not(IsNull()),
        payment_expires_at: IsNull(),
        deletedAt: IsNull(),
      },
      take: BATCH_SIZE,
    });
    if (legacy.length === 0) return;

    await this.ordersRepository.update(
      { id: In(legacy.map((order) => order.id)) },
      {
        status: OrderStatusEnum.AwaitingPayment,
        payment_expires_at: new Date(),
      },
    );
    this.logger.log(
      `Adopted ${legacy.length} legacy pending payment sessions for settlement`,
    );
  }
}
