import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsService } from './wallets.service';
import { WalletsMaintenanceService } from './wallets-maintenance.service';
import { WalletsController } from './wallets.controller';
import { WalletPaymentsController } from './wallet-payments.controller';
import { Wallet } from './entities/wallet.entity';
import { WalletChargeRequest } from './entities/wallet-charge-request.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletChargeRequest, WalletTransaction]),
    UsersModule,
    PaymentsModule,
  ],
  controllers: [WalletsController, WalletPaymentsController],
  providers: [WalletsService, WalletsMaintenanceService],
  exports: [WalletsService],
})
export class WalletsModule {}
