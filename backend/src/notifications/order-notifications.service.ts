import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import NotificationEventEnum from './enums/notification-event.enum';
import { SmsService } from '../sms/sms.service';
import { Order } from '../orders/entities/order.entity';
import { isDuplicateEntryError } from '../common/database/mysql-errors';

const TEMPLATE_KEYS: Record<NotificationEventEnum, string> = {
  [NotificationEventEnum.OrderPlaced]: 'SMSIR_ORDER_PLACED_TEMPLATE_ID',
  [NotificationEventEnum.OrderPaid]: 'SMSIR_ORDER_PAID_TEMPLATE_ID',
  [NotificationEventEnum.OrderSent]: 'SMSIR_ORDER_SENT_TEMPLATE_ID',
  [NotificationEventEnum.OrderDelivered]: 'SMSIR_ORDER_DELIVERED_TEMPLATE_ID',
  [NotificationEventEnum.OrderCancelled]: 'SMSIR_ORDER_CANCELLED_TEMPLATE_ID',
};

export const MAX_NOTIFICATION_ATTEMPTS = 3;

@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
  ) {}

  // Called after the order's transaction commits, and never throws: an SMS
  // gateway being down must not roll back a paid order.
  async notify(order: Order, event: NotificationEventEnum): Promise<void> {
    try {
      const mobile =
        order.shippingAddressSnapshot?.receiver_mobile ?? order.user?.mobile;
      if (!mobile) {
        this.logger.warn(`Order ${order.id}: no mobile number to notify`);
        return;
      }

      const record = await this.record(order, event, mobile);
      if (!record) return;
      await this.deliver(record, order);
    } catch (error) {
      this.logger.error(
        `Could not notify about order ${order.id} (${event}): ${(error as Error).message}`,
      );
    }
  }

  // The unique (order, event) row is what makes this idempotent - a
  // replayed callback cannot tell someone twice that their order shipped.
  private async record(
    order: Order,
    event: NotificationEventEnum,
    mobile: string,
  ): Promise<Notification | null> {
    const parameters = this.buildParameters(order, event);
    try {
      return await this.notifications.save(
        this.notifications.create({
          order: { id: order.id } as Order,
          event,
          mobile,
          status: 'pending',
          parameters,
        }),
      );
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async deliver(record: Notification, order: Order): Promise<void> {
    const templateId = this.configService.get<string>(
      TEMPLATE_KEYS[record.event],
    );
    if (!templateId || !this.smsService.isConfigured) {
      await this.notifications.update(
        { id: record.id },
        { status: 'skipped', error: 'No template configured for this event' },
      );
      if (this.configService.get('NODE_ENV') !== 'production') {
        this.logger.log(
          `[SMS skipped] ${record.event} for order ${order.id} -> ${record.mobile} ${JSON.stringify(record.parameters)}`,
        );
      }
      return;
    }

    const result = await this.smsService.sendTemplate(
      record.mobile,
      templateId,
      record.parameters ?? {},
    );

    await this.notifications.update(
      { id: record.id },
      {
        status: result.delivered ? 'sent' : 'failed',
        attempts: record.attempts + 1,
        provider_message_id: result.messageId ?? null,
        error: result.error?.slice(0, 500) ?? null,
      },
    );
    if (!result.delivered) {
      this.logger.warn(
        `SMS for order ${order.id} (${record.event}) failed: ${result.error}`,
      );
    }
  }

  private buildParameters(
    order: Order,
    event: NotificationEventEnum,
  ): Record<string, string> {
    const base: Record<string, string> = {
      ORDER: order.invoice_number ?? String(order.id),
      AMOUNT: Number(order.total_price ?? 0).toLocaleString('en-US'),
    };
    if (event === NotificationEventEnum.OrderSent) {
      base.TRACKING = order.tracking_code ?? '-';
      base.CARRIER = order.shipping_method_title ?? '-';
    }
    return base;
  }

  async retryFailed(olderThanMs = 5 * 60 * 1000): Promise<number> {
    const stale = await this.notifications.find({
      where: {
        status: 'failed',
        attempts: LessThan(MAX_NOTIFICATION_ATTEMPTS),
        updated_at: LessThan(new Date(Date.now() - olderThanMs)),
      },
      relations: { order: true },
      take: 50,
    });

    let sent = 0;
    for (const record of stale) {
      if (!record.order) continue;
      await this.deliver(record, record.order);
      sent += 1;
    }
    return sent;
  }
}
