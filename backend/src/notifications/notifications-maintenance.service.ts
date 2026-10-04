import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderNotificationsService } from './order-notifications.service';

@Injectable()
export class NotificationsMaintenanceService {
  private readonly logger = new Logger(NotificationsMaintenanceService.name);

  constructor(private readonly notifications: OrderNotificationsService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryFailedNotifications(): Promise<void> {
    try {
      const retried = await this.notifications.retryFailed();
      if (retried > 0) {
        this.logger.log(`Retried ${retried} failed notifications`);
      }
    } catch (error) {
      this.logger.error(
        `Notification retry pass failed: ${(error as Error).message}`,
      );
    }
  }
}
