import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Wallet } from './entities/wallet.entity';
import { WalletChargeRequest } from './entities/wallet-charge-request.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import WalletTransactionTypeEnum from './enums/wallet-transaction-type.enum';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';
import { UsersService } from '../users/users.service';
import { ZarinpalService } from '../payments/zarinpal.service';
import { MAX_MONEY_AMOUNT } from '../common/constants/money';
import { AuditActor, AuditService } from '../audit/audit.service';
import { AppError } from '../common/errors/app-error';
import { ErrorCodes } from '../common/errors/error-codes';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletChargeRequest)
    private readonly chargeRequestRepository: Repository<WalletChargeRequest>,
    private readonly usersService: UsersService,
    private readonly zarinpalService: ZarinpalService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  private getRepo(manager?: EntityManager): Repository<Wallet> {
    return manager ? manager.getRepository(Wallet) : this.walletRepository;
  }

  // Every balance change goes through here: the row is locked for the
  // whole transaction, so two withdrawals cannot both read the same
  // balance and both succeed.
  private async withLockedWallet<T>(
    walletId: number,
    manager: EntityManager | undefined,
    fn: (wallet: Wallet, manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const run = async (txManager: EntityManager) => {
      const wallet = await txManager.getRepository(Wallet).findOne({
        where: { id: walletId },
        relations: { user: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        throw new NotFoundException(`Wallet with id ${walletId} not found`);
      }
      return fn(wallet, txManager);
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  private assertActive(wallet: Wallet): void {
    if (!wallet.is_active) {
      throw AppError.badRequest(
        ErrorCodes.WALLET_INACTIVE,
        'This wallet is deactivated - reactivate it (POST /wallets) before using it',
      );
    }
  }

  private assertWithinLimit(balance: number, credit: number): void {
    if (balance + credit > MAX_MONEY_AMOUNT) {
      throw new BadRequestException(
        'This would take the wallet balance over the allowed maximum',
      );
    }
  }

  private async recordTransaction(
    manager: EntityManager,
    wallet: Wallet,
    amount: number,
    type: WalletTransactionTypeEnum,
    description?: string,
  ): Promise<WalletTransaction> {
    const entry = manager.getRepository(WalletTransaction).create({
      wallet,
      amount,
      balanceAfter: wallet.amount,
      type,
      description,
    });
    return manager.getRepository(WalletTransaction).save(entry);
  }

  async create(userId: number): Promise<Wallet> {
    const user = await this.usersService.findOne(userId);

    const existing = await this.walletRepository.findOne({
      where: { user: { id: userId } },
      relations: { user: true },
    });
    if (existing) {
      if (existing.is_active) {
        throw new BadRequestException('This user already has a wallet');
      }
      existing.is_active = true;
      return this.walletRepository.save(existing);
    }

    const wallet = this.walletRepository.create({
      user,
      amount: 0,
      is_active: true,
    });
    return await this.walletRepository.save(wallet);
  }

  async findAll(): Promise<Wallet[]> {
    return await this.walletRepository.find({ relations: { user: true } });
  }

  async findOne(id: number): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet with id ${id} not found`);
    }
    return wallet;
  }

  async findByUserId(userId: number, manager?: EntityManager): Promise<Wallet> {
    const wallet = await this.getRepo(manager).findOne({
      where: { user: { id: userId } },
      relations: { user: true },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet for user ${userId} not found`);
    }
    return wallet;
  }

  async adminCharge(
    id: number,
    dto: AdjustWalletDto,
    actor?: AuditActor,
  ): Promise<Wallet> {
    const wallet = await this.withLockedWallet(
      id,
      undefined,
      async (wallet, manager) => {
        this.assertActive(wallet);
        this.assertWithinLimit(wallet.amount, dto.amount);
        wallet.amount = wallet.amount + dto.amount;
        const saved = await manager.getRepository(Wallet).save(wallet);
        await this.recordTransaction(
          manager,
          saved,
          dto.amount,
          WalletTransactionTypeEnum.AdminCharge,
          'Manual admin adjustment',
        );
        return saved;
      },
    );

    await this.auditService.record({
      action: 'wallet.admin_charged',
      entityType: 'wallet',
      entityId: id,
      actor,
      changes: { amount: dto.amount, balance_after: wallet.amount },
    });
    return wallet;
  }

  async requestCharge(
    walletId: number,
    dto: AdjustWalletDto,
  ): Promise<{ paymentUrl: string }> {
    const wallet = await this.findOne(walletId);
    this.assertActive(wallet);
    this.assertWithinLimit(wallet.amount, dto.amount);
    const backendUrl = this.configService.get<string>('BACKEND_URL');
    const callbackUrl = `${backendUrl}/payments/zarinpal/callback/wallet-charge`;

    const { authority, paymentUrl } = await this.zarinpalService.requestPayment(
      dto.amount,
      `Wallet top-up for wallet #${wallet.id}`,
      callbackUrl,
      wallet.user.mobile,
    );

    const chargeRequest = this.chargeRequestRepository.create({
      authority,
      amount: dto.amount,
      wallet,
      status: 'pending',
    });
    await this.chargeRequestRepository.save(chargeRequest);

    return { paymentUrl };
  }

  async confirmCharge(authority: string): Promise<Wallet> {
    return this.dataSource.transaction(async (manager) => {
      const chargeRequests = manager.getRepository(WalletChargeRequest);
      const chargeRequest = await chargeRequests.findOne({
        where: { authority },
        relations: { wallet: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!chargeRequest) {
        throw new NotFoundException('No charge request found for this payment');
      }
      if (chargeRequest.status === 'completed') {
        return manager.getRepository(Wallet).findOneOrFail({
          where: { id: chargeRequest.wallet.id },
          relations: { user: true },
        });
      }
      if (chargeRequest.status !== 'pending') {
        throw new ConflictException(
          'This top-up is already closed and cannot be verified again',
        );
      }

      await this.zarinpalService.verifyPayment(authority, chargeRequest.amount);

      return this.withLockedWallet(
        chargeRequest.wallet.id,
        manager,
        async (wallet, txManager) => {
          this.assertWithinLimit(wallet.amount, chargeRequest.amount);
          wallet.amount = wallet.amount + chargeRequest.amount;
          const saved = await txManager.getRepository(Wallet).save(wallet);

          await this.recordTransaction(
            txManager,
            saved,
            chargeRequest.amount,
            WalletTransactionTypeEnum.ZarinpalCharge,
            `ZarinPal top-up (authority ${authority})`,
          );

          const transition = await txManager
            .getRepository(WalletChargeRequest)
            .update(
              { id: chargeRequest.id, status: 'pending' },
              { status: 'completed' },
            );
          if (!transition.affected) {
            throw new ConflictException('This top-up was already processed');
          }

          return saved;
        },
      );
    });
  }

  async failCharge(authority: string): Promise<void> {
    await this.chargeRequestRepository.update(
      { authority, status: 'pending' },
      { status: 'failed' },
    );
  }

  async withdraw(id: number, dto: AdjustWalletDto): Promise<Wallet> {
    return this.withLockedWallet(id, undefined, async (wallet, manager) => {
      this.assertActive(wallet);
      if (wallet.amount < dto.amount) {
        throw AppError.badRequest(
          ErrorCodes.INSUFFICIENT_WALLET_BALANCE,
          'Insufficient wallet balance',
          { balance: wallet.amount, required: dto.amount },
        );
      }
      wallet.amount = wallet.amount - dto.amount;
      const saved = await manager.getRepository(Wallet).save(wallet);
      await this.recordTransaction(
        manager,
        saved,
        -dto.amount,
        WalletTransactionTypeEnum.Withdrawal,
      );
      return saved;
    });
  }

  async withdrawByUserId(
    userId: number,
    amount: number,
    manager?: EntityManager,
    description?: string,
  ): Promise<{ wallet: Wallet; transactionId: number }> {
    const lookupRepo = manager
      ? manager.getRepository(Wallet)
      : this.walletRepository;
    const walletRef = await lookupRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!walletRef) {
      throw new NotFoundException(`Wallet for user ${userId} not found`);
    }

    return this.withLockedWallet(
      walletRef.id,
      manager,
      async (wallet, txManager) => {
        this.assertActive(wallet);
        if (wallet.amount < amount) {
          throw AppError.badRequest(
            ErrorCodes.INSUFFICIENT_WALLET_BALANCE,
            'Insufficient wallet balance',
            { balance: wallet.amount, required: amount },
          );
        }
        wallet.amount = wallet.amount - amount;
        const saved = await txManager.getRepository(Wallet).save(wallet);
        const entry = await this.recordTransaction(
          txManager,
          saved,
          -amount,
          WalletTransactionTypeEnum.OrderPayment,
          description,
        );
        return { wallet: saved, transactionId: entry.id };
      },
    );
  }

  async refund(
    userId: number,
    amount: number,
    description: string,
    manager?: EntityManager,
  ): Promise<Wallet> {
    const run = async (txManager: EntityManager) => {
      const wallets = txManager.getRepository(Wallet);
      let walletRef = await wallets.findOne({
        where: { user: { id: userId } },
      });
      if (!walletRef) {
        walletRef = await wallets.save(
          wallets.create({ user: { id: userId }, amount: 0, is_active: true }),
        );
      }

      return this.withLockedWallet(
        walletRef.id,
        txManager,
        async (wallet, inner) => {
          this.assertWithinLimit(wallet.amount, amount);
          wallet.is_active = true;
          wallet.amount = wallet.amount + amount;
          const saved = await inner.getRepository(Wallet).save(wallet);
          await this.recordTransaction(
            inner,
            saved,
            amount,
            WalletTransactionTypeEnum.Refund,
            description,
          );
          return saved;
        },
      );
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  async deactivate(id: number): Promise<Wallet> {
    return this.withLockedWallet(id, undefined, async (wallet, manager) => {
      if (wallet.amount !== 0) {
        throw new BadRequestException(
          'Cannot deactivate a wallet with a non-zero balance - withdraw the funds first',
        );
      }
      const pendingCharges = await manager
        .getRepository(WalletChargeRequest)
        .count({ where: { wallet: { id }, status: 'pending' } });
      if (pendingCharges > 0) {
        throw new BadRequestException(
          'This wallet has a top-up in progress - wait for it to finish first',
        );
      }
      if (!wallet.is_active) {
        return wallet;
      }
      wallet.is_active = false;
      return manager.getRepository(Wallet).save(wallet);
    });
  }
}
