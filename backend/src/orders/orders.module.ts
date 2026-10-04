import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderPaymentsController } from './order-payments.controller';
import { OrdersMaintenanceService } from './orders-maintenance.service';
import { InvoiceService } from './invoice.service';
import { InvoiceSequence } from './entities/invoice-sequence.entity';
import { Order } from './entities/order.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from './entities/order-item.entity';
import { User } from '../users/entities/user.entity';
import { Address } from '../address/entities/address.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { DiscountCodesModule } from '../discount-codes/discount-codes.module';
import { WalletsModule } from '../wallets/wallets.module';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../shipping/shipping.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      InvoiceSequence,
      User,
      Address,
      Product,
      ProductVariant,
    ]),
    DiscountCodesModule,
    WalletsModule,
    PaymentsModule,
    ShippingModule,
    NotificationsModule,
  ],
  controllers: [OrdersController, OrderPaymentsController],
  providers: [OrdersService, OrdersMaintenanceService, InvoiceService],
})
export class OrdersModule {}
