import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { OrderNotificationsService } from './order-notifications.service';
import { NotificationsMaintenanceService } from './notifications-maintenance.service';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), SmsModule],
  providers: [OrderNotificationsService, NotificationsMaintenanceService],
  exports: [OrderNotificationsService],
})
export class NotificationsModule {}
