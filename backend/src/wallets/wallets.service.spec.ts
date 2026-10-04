import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import WalletTransactionTypeEnum from './enums/wallet-transaction-type.enum';
import { WalletsService } from './wallets.service';
import { Wallet } from './entities/wallet.entity';
import { WalletChargeRequest } from './entities/wallet-charge-request.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { UsersService } from '../users/users.service';
import { ZarinpalService } from '../payments/zarinpal.service';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { ErrorCodes } from '../common/errors/error-codes';

const mockRepo = () => ({
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  create: jest.fn((d) => d),
  save: jest.fn((d) => Promise.resolve(d)),
  delete: jest.fn(),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  count: jest.fn().mockResolvedValue(0),
});

describe('WalletsService', () => {
  let service: WalletsService;
  let walletRepo: ReturnType<typeof mockRepo>;
  let chargeRequestRepo: ReturnType<typeof mockRepo>;
  let zarinpalService: { requestPayment: jest.Mock; verifyPayment: jest.Mock };

  const walletTransactionRepo = mockRepo();
  const mockManager = {
    getRepository: jest.fn((entity) => {
      if (entity === Wallet) return walletRepoForManager;
      if (entity === WalletChargeRequest) return chargeRequestRepoForManager;
      if (entity === WalletTransaction) return walletTransactionRepo;
      throw new Error(`No mock repo configured for ${entity}`);
    }),
  };
  let walletRepoForManager: ReturnType<typeof mockRepo>;
  let chargeRequestRepoForManager: ReturnType<typeof mockRepo>;

  afterEach(() => jest.clearAllMocks());

  beforeEach(async () => {
    walletRepo = mockRepo();
    chargeRequestRepo = mockRepo();
    walletRepoForManager = walletRepo;
    chargeRequestRepoForManager = chargeRequestRepo;
    zarinpalService = { requestPayment: jest.fn(), verifyPayment: jest.fn() };

    const mockDataSource = {
      transaction: jest.fn((cb: any) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AuditService, useValue: { record: jest.fn() } },
        WalletsService,
        { provide: getRepositoryToken(Wallet), useValue: walletRepo },
        {
          provide: getRepositoryToken(WalletChargeRequest),
          useValue: chargeRequestRepo,
        },
        {
          provide: getRepositoryToken(WalletTransaction),
          useValue: walletTransactionRepo,
        },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        { provide: ZarinpalService, useValue: zarinpalService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  describe('adminCharge', () => {
    it('adds the amount to the existing balance and records a ledger entry', async () => {
      walletRepo.findOne.mockResolvedValue({
        is_active: true,
        id: 1,
        amount: 500,
      });

      const result = await service.adminCharge(1, { amount: 250 });

      expect(result.amount).toBe(750);
      expect(walletTransactionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 250, balanceAfter: 750 }),
      );
    });

    it('throws NotFoundException for a wallet that does not exist', async () => {
      walletRepo.findOne.mockResolvedValue(null);

      await expect(service.adminCharge(999, { amount: 100 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('requestCharge', () => {
    it('starts a ZarinPal payment and stores a pending charge request, without touching the balance yet', async () => {
      walletRepo.findOne.mockResolvedValue({
        id: 1,
        amount: 500,
        is_active: true,
        user: { mobile: '09120000000' },
      });
      zarinpalService.requestPayment.mockResolvedValue({
        authority: 'A00000000000000000000000000000000AB',
        paymentUrl: 'https://sandbox.zarinpal.com/pg/StartPay/A0...',
      });

      const result = await service.requestCharge(1, { amount: 1000 });

      expect(result.paymentUrl).toContain('zarinpal.com');
      expect(chargeRequestRepo.save).toHaveBeenCalled();
    });
  });

  describe('confirmCharge', () => {
    it('credits the wallet, records a ledger entry, and marks the request completed', async () => {
      chargeRequestRepo.findOne.mockResolvedValue({
        id: 1,
        authority: 'AUTH123',
        amount: 1000,
        status: 'pending',
        wallet: { id: 1 },
      });
      walletRepo.findOne.mockResolvedValue({
        is_active: true,
        id: 1,
        amount: 500,
        user: { id: 1 },
      });
      zarinpalService.verifyPayment.mockResolvedValue({ refId: '123456' });

      const result = await service.confirmCharge('AUTH123');

      expect(result.amount).toBe(1500);
      expect(walletTransactionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1000, balanceAfter: 1500 }),
      );
      expect(chargeRequestRepo.update).toHaveBeenCalledWith(
        { id: expect.anything(), status: 'pending' },
        { status: 'completed' },
      );
    });

    it('does not double-credit a request that was already completed (idempotency)', async () => {
      chargeRequestRepo.findOne.mockResolvedValue({
        id: 1,
        authority: 'AUTH123',
        amount: 1000,
        status: 'completed',
        wallet: { id: 1 },
      });
      walletRepo.findOneOrFail.mockResolvedValue({ id: 1, amount: 1500 });

      await service.confirmCharge('AUTH123');

      expect(zarinpalService.verifyPayment).not.toHaveBeenCalled();
      expect(walletTransactionRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown authority', async () => {
      chargeRequestRepo.findOne.mockResolvedValue(null);

      await expect(service.confirmCharge('UNKNOWN')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('withdraw', () => {
    it('subtracts the amount when the balance is sufficient', async () => {
      walletRepo.findOne.mockResolvedValue({
        is_active: true,
        id: 1,
        amount: 500,
      });

      const result = await service.withdraw(1, { amount: 200 });

      expect(result.amount).toBe(300);
    });

    it('throws BadRequestException when the balance is insufficient, without saving', async () => {
      walletRepo.findOne.mockResolvedValue({
        is_active: true,
        id: 1,
        amount: 100,
      });

      await expect(service.withdraw(1, { amount: 200 })).rejects.toMatchObject({
        code: ErrorCodes.INSUFFICIENT_WALLET_BALANCE,
      });
      expect(walletTransactionRepo.save).not.toHaveBeenCalled();
    });

    it('allows withdrawing the exact full balance down to zero', async () => {
      walletRepo.findOne.mockResolvedValue({
        is_active: true,
        id: 1,
        amount: 500,
      });

      const result = await service.withdraw(1, { amount: 500 });

      expect(result.amount).toBe(0);
    });
  });

  describe('withdrawByUserId', () => {
    it('throws BadRequestException on insufficient balance without saving', async () => {
      walletRepo.findOne.mockResolvedValue({
        is_active: true,
        id: 1,
        amount: 100,
        user: { id: 1 },
      });

      await expect(service.withdrawByUserId(1, 500)).rejects.toMatchObject({
        code: ErrorCodes.INSUFFICIENT_WALLET_BALANCE,
      });
      expect(walletTransactionRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user has no wallet', async () => {
      walletRepo.findOne.mockResolvedValue(null);

      await expect(service.withdrawByUserId(1, 100)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deactivate', () => {
    it('refuses while the balance is not zero', async () => {
      walletRepo.findOne.mockResolvedValue({
        id: 1,
        amount: 500,
        is_active: true,
      });

      await expect(service.deactivate(1)).rejects.toThrow(BadRequestException);
      expect(walletRepo.delete).not.toHaveBeenCalled();
    });

    it('refuses while a top-up is still in flight', async () => {
      walletRepo.findOne.mockResolvedValue({
        id: 1,
        amount: 0,
        is_active: true,
      });
      chargeRequestRepo.count.mockResolvedValue(1);

      await expect(service.deactivate(1)).rejects.toThrow(BadRequestException);
    });

    it('switches the wallet off instead of deleting the row and its ledger', async () => {
      walletRepo.findOne.mockResolvedValue({
        id: 1,
        amount: 0,
        is_active: true,
      });
      chargeRequestRepo.count.mockResolvedValue(0);

      const result = await service.deactivate(1);

      expect(result.is_active).toBe(false);
      expect(walletRepo.delete).not.toHaveBeenCalled();
      expect(walletRepo.save).toHaveBeenCalled();
    });
  });

  describe('deactivated wallets are read-only', () => {
    it('refuses a withdrawal', async () => {
      walletRepo.findOne.mockResolvedValue({
        id: 1,
        amount: 500,
        is_active: false,
      });

      await expect(service.withdraw(1, { amount: 100 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses an admin top-up', async () => {
      walletRepo.findOne.mockResolvedValue({
        id: 1,
        amount: 0,
        is_active: false,
      });

      await expect(service.adminCharge(1, { amount: 100 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('charge callbacks - replay protection', () => {
    it('only a pending top-up can be marked failed', async () => {
      await service.failCharge('AUTH-1');

      expect(chargeRequestRepo.update).toHaveBeenCalledWith(
        { authority: 'AUTH-1', status: 'pending' },
        { status: 'failed' },
      );
    });

    it('never re-verifies a top-up that is already closed', async () => {
      chargeRequestRepo.findOne.mockResolvedValue({
        id: 3,
        authority: 'AUTH-1',
        amount: 1000,
        status: 'failed',
        wallet: { id: 1 },
      });

      await expect(service.confirmCharge('AUTH-1')).rejects.toThrow(
        ConflictException,
      );
      expect(zarinpalService.verifyPayment).not.toHaveBeenCalled();
      expect(walletTransactionRepo.save).not.toHaveBeenCalled();
    });

    it('is a no-op for an already completed top-up', async () => {
      chargeRequestRepo.findOne.mockResolvedValue({
        id: 3,
        authority: 'AUTH-1',
        amount: 1000,
        status: 'completed',
        wallet: { id: 1 },
      });
      walletRepo.findOneOrFail.mockResolvedValue({ id: 1, amount: 1000 });

      await service.confirmCharge('AUTH-1');

      expect(zarinpalService.verifyPayment).not.toHaveBeenCalled();
      expect(walletTransactionRepo.save).not.toHaveBeenCalled();
    });

    it('credits exactly once for a pending top-up', async () => {
      chargeRequestRepo.findOne.mockResolvedValue({
        id: 3,
        authority: 'AUTH-1',
        amount: 1000,
        status: 'pending',
        wallet: { id: 1 },
      });
      walletRepo.findOne.mockResolvedValue({
        id: 1,
        amount: 500,
        is_active: true,
      });
      chargeRequestRepo.update.mockResolvedValue({ affected: 1 });
      zarinpalService.verifyPayment.mockResolvedValue({ refId: '99' });

      const result = await service.confirmCharge('AUTH-1');

      expect(result.amount).toBe(1500);
      expect(chargeRequestRepo.update).toHaveBeenCalledWith(
        { id: 3, status: 'pending' },
        { status: 'completed' },
      );
    });
  });

  describe('refund', () => {
    it('credits the wallet and records it as a refund', async () => {
      walletRepo.findOne.mockResolvedValue({
        id: 1,
        amount: 200,
        is_active: true,
      });

      const result = await service.refund(
        7,
        500,
        'Refund for cancelled order #3',
      );

      expect(result.amount).toBe(700);
      expect(walletTransactionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          type: WalletTransactionTypeEnum.Refund,
        }),
      );
    });

    it('creates a wallet for a user who has none, so the money is never lost', async () => {
      walletRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 9, amount: 0, is_active: true });
      walletRepo.save.mockImplementation((w: any) =>
        Promise.resolve({ id: 9, ...w }),
      );

      const result = await service.refund(7, 250, 'Refund');

      expect(result.amount).toBe(250);
    });
  });
});
