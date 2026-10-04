import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHmac } from 'crypto';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { SmsService } from '../sms/sms.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { OtpVerification } from './entities/otp-verification.entity';
import { ErrorCodes } from '../common/errors/error-codes';
import OtpPurposeEnum from './enums/otp-purpose.enum';

const OTP_SECRET = 'test-otp-secret-at-least-32-characters-long';
const hashOtpForTest = (code: string) =>
  createHmac('sha256', OTP_SECRET).update(code).digest('hex');

const mockUsersService = () => ({
  findOneByMobile: jest.fn(),
  findOneByMobileWithPassword: jest.fn(),
  createWithHashedPassword: jest.fn(),
  setPassword: jest.fn(),
  findOneWithPassword: jest.fn(),
});

const mockRepo = () => ({
  findOneBy: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((data) => data),
  save: jest.fn((data) => Promise.resolve({ id: 1, ...data })),
  remove: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(() => refreshQueryBuilder),
});

let refreshQueryBuilder: Record<string, jest.Mock>;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: ReturnType<typeof mockUsersService>;
  let otpRepository: ReturnType<typeof mockRepo>;
  let refreshTokenRepository: ReturnType<typeof mockRepo>;
  let mockManager: { getRepository: jest.Mock };
  let smsService: { sendOtp: jest.Mock };

  beforeEach(async () => {
    refreshQueryBuilder = {};
    for (const method of ['update', 'set', 'where']) {
      refreshQueryBuilder[method] = jest.fn(() => refreshQueryBuilder);
    }
    refreshQueryBuilder.execute = jest.fn().mockResolvedValue({ affected: 1 });
    refreshTokenRepository = mockRepo();
    smsService = { sendOtp: jest.fn() };
    otpRepository = mockRepo();

    mockManager = {
      getRepository: jest.fn((entity) => {
        if (entity === RefreshToken) return refreshTokenRepository;
        if (entity === OtpVerification) return otpRepository;
        throw new Error(`No mock repo configured for ${entity}`);
      }),
    };
    const mockDataSource = {
      transaction: jest.fn((cb: any) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useFactory: mockUsersService },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(() => 'signed.jwt.token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'OTP_HASH_SECRET') return OTP_SECRET;
              return undefined;
            }),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepository,
        },
        {
          provide: getRepositoryToken(OtpVerification),
          useValue: otpRepository,
        },
        { provide: SmsService, useValue: smsService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register (step 1 - send OTP)', () => {
    it('returns the same shape for an existing account WITHOUT creating an OTP or sending anything', async () => {
      usersService.findOneByMobile.mockResolvedValue({ id: 1 });

      const result = await service.register({
        mobile: '09120000000',
        password: 'Password123',
        display_name: 'Test',
      });

      expect(result).toEqual({ mobile: '09120000000' });
      expect(otpRepository.save).not.toHaveBeenCalled();
    });

    it('creates a pending OTP record with a hashed password, not the account itself', async () => {
      usersService.findOneByMobile.mockResolvedValue(null);
      otpRepository.findOneBy.mockResolvedValue(null);

      const result = await service.register({
        mobile: '09120000000',
        password: 'Password123',
        display_name: 'Test',
      });

      expect(result).toEqual({ mobile: '09120000000' });
      expect(usersService.createWithHashedPassword).not.toHaveBeenCalled();
      const savedOtp = otpRepository.save.mock.calls[0][0];
      expect(savedOtp.hashedPassword).not.toBe('Password123');
      expect(await bcrypt.compare('Password123', savedOtp.hashedPassword)).toBe(
        true,
      );
    });

    it('reuses the pending row (new code, same budget) once the cooldown has passed', async () => {
      usersService.findOneByMobile.mockResolvedValue(null);
      const existingOtp = {
        id: 1,
        mobile: '09120000000',
        sendCount: 2,
        createdAt: new Date(Date.now() - 61_000),
        lastSentAt: new Date(Date.now() - 61_000),
        windowStartedAt: new Date(Date.now() - 61_000),
      };
      otpRepository.findOneBy.mockResolvedValue(existingOtp);

      await service.register({
        mobile: '09120000000',
        password: 'Password123',
        display_name: 'Test',
      });

      expect(otpRepository.remove).not.toHaveBeenCalled();
      expect(otpRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, sendCount: 3, attempts: 0 }),
      );
    });

    it('refuses more than five codes an hour for the same number', async () => {
      usersService.findOneByMobile.mockResolvedValue(null);
      otpRepository.findOneBy.mockResolvedValue({
        id: 1,
        mobile: '09120000000',
        sendCount: 5,
        createdAt: new Date(Date.now() - 10 * 60_000),
        lastSentAt: new Date(Date.now() - 5 * 60_000),
        windowStartedAt: new Date(Date.now() - 10 * 60_000),
      });

      await expect(
        service.register({
          mobile: '09120000000',
          password: 'Password123',
          display_name: 'Test',
        }),
      ).rejects.toMatchObject({ status: 429 });
      expect(otpRepository.save).not.toHaveBeenCalled();
    });

    it('starts a fresh budget once the hour has passed', async () => {
      usersService.findOneByMobile.mockResolvedValue(null);
      otpRepository.findOneBy.mockResolvedValue({
        id: 1,
        mobile: '09120000000',
        sendCount: 5,
        createdAt: new Date(Date.now() - 2 * 60 * 60_000),
        lastSentAt: new Date(Date.now() - 2 * 60 * 60_000),
        windowStartedAt: new Date(Date.now() - 2 * 60 * 60_000),
      });

      await service.register({
        mobile: '09120000000',
        password: 'Password123',
        display_name: 'Test',
      });

      expect(otpRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ sendCount: 1 }),
      );
    });

    it('rejects a resend within the cooldown window, without touching the existing OTP', async () => {
      usersService.findOneByMobile.mockResolvedValue(null);
      const existingOtp = {
        id: 1,
        mobile: '09120000000',
        createdAt: new Date(),
      };
      otpRepository.findOneBy.mockResolvedValue(existingOtp);

      await expect(
        service.register({
          mobile: '09120000000',
          password: 'Password123',
          display_name: 'Test',
        }),
      ).rejects.toMatchObject({ status: 429 });
      expect(otpRepository.remove).not.toHaveBeenCalled();
      expect(otpRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp (step 2 - confirm code, create account)', () => {
    it('creates the account and returns tokens when the code matches', async () => {
      otpRepository.findOneBy.mockResolvedValue({
        mobile: '09120000000',
        codeHash: hashOtpForTest('123456'),
        displayName: 'Test',
        hashedPassword: 'already-hashed',
        expiresAt: new Date(Date.now() + 60000),
        attempts: 0,
      });
      usersService.createWithHashedPassword.mockResolvedValue({
        id: 1,
        mobile: '09120000000',
      });

      const result = await service.verifyOtp({
        mobile: '09120000000',
        code: '123456',
      });

      expect(usersService.createWithHashedPassword).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
    });

    it('rejects an incorrect code, increments attempts, without creating an account', async () => {
      const otp = {
        mobile: '09120000000',
        codeHash: hashOtpForTest('654321'),
        expiresAt: new Date(Date.now() + 60000),
        attempts: 0,
      };
      otpRepository.findOneBy.mockResolvedValue(otp);

      await expect(
        service.verifyOtp({ mobile: '09120000000', code: '000000' }),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.createWithHashedPassword).not.toHaveBeenCalled();
      expect(otpRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ attempts: 1 }),
      );
    });

    it('invalidates the code entirely after too many wrong attempts', async () => {
      const otp = {
        mobile: '09120000000',
        codeHash: hashOtpForTest('654321'),
        expiresAt: new Date(Date.now() + 60000),
        attempts: 4,
      };
      otpRepository.findOneBy.mockResolvedValue(otp);

      await expect(
        service.verifyOtp({ mobile: '09120000000', code: '000000' }),
      ).rejects.toThrow(BadRequestException);
      expect(otpRepository.remove).toHaveBeenCalledWith(otp);
    });

    it('rejects an expired code', async () => {
      otpRepository.findOneBy.mockResolvedValue({
        mobile: '09120000000',
        codeHash: 'irrelevant',
        expiresAt: new Date(Date.now() - 60000),
        attempts: 0,
      });

      await expect(
        service.verifyOtp({ mobile: '09120000000', code: '123456' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('rejects a mobile number with no account', async () => {
      usersService.findOneByMobileWithPassword.mockResolvedValue(null);

      await expect(
        service.login({ mobile: '09120000000', password: 'x' }),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_CREDENTIALS });
    });

    it('rejects an incorrect password', async () => {
      const hash = await bcrypt.hash('CorrectPassword1', 10);
      usersService.findOneByMobileWithPassword.mockResolvedValue({
        id: 1,
        mobile: '09120000000',
        password: hash,
      });

      await expect(
        service.login({ mobile: '09120000000', password: 'WrongPassword' }),
      ).rejects.toMatchObject({ code: ErrorCodes.INVALID_CREDENTIALS });
    });

    it('returns access and refresh tokens for correct credentials', async () => {
      const hash = await bcrypt.hash('CorrectPassword1', 10);
      usersService.findOneByMobileWithPassword.mockResolvedValue({
        id: 1,
        mobile: '09120000000',
        role: 'user',
        password: hash,
      });

      const result = await service.login({
        mobile: '09120000000',
        password: 'CorrectPassword1',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(typeof result.refreshToken).toBe('string');
      expect(refreshTokenRepository.save).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rejects a refresh token that does not exist', async () => {
      refreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(service.refresh('unknown-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired refresh token and drops its whole chain', async () => {
      refreshTokenRepository.findOne.mockResolvedValue({
        id: 1,
        familyId: 'family-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: { id: 1 },
      });

      await expect(service.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        familyId: 'family-1',
      });
    });

    it('rotates the token: marks the old one used and issues a new pair in the same family', async () => {
      refreshTokenRepository.findOne.mockResolvedValue({
        id: 1,
        familyId: 'family-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        user: { id: 1, role: 'user' },
      });

      const result = await service.refresh('valid-token');

      expect(refreshQueryBuilder.where).toHaveBeenCalledWith(
        'id = :id AND usedAt IS NULL',
        { id: 1 },
      );
      expect(refreshTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ familyId: 'family-1' }),
      );
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('revokes the entire chain when an already-used token is replayed', async () => {
      refreshTokenRepository.findOne.mockResolvedValue({
        id: 1,
        familyId: 'family-1',
        usedAt: new Date(Date.now() - 5000),
        expiresAt: new Date(Date.now() + 60000),
        user: { id: 7, role: 'user' },
      });

      await expect(service.refresh('stolen-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        familyId: 'family-1',
      });
      expect(refreshTokenRepository.save).not.toHaveBeenCalled();
    });

    it('refuses to issue a pair if the token was consumed by a parallel request', async () => {
      refreshTokenRepository.findOne.mockResolvedValue({
        id: 1,
        familyId: 'family-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        user: { id: 1, role: 'user' },
      });
      refreshQueryBuilder.execute.mockResolvedValue({ affected: 0 });

      await expect(service.refresh('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokenRepository.save).not.toHaveBeenCalled();
    });

    it('locks the row for update inside a transaction', async () => {
      refreshTokenRepository.findOne.mockResolvedValue({
        id: 1,
        familyId: 'family-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60000),
        user: { id: 1, role: 'user' },
      });

      await service.refresh('valid-token');

      expect(refreshTokenRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });
  });

  describe('logout', () => {
    it('ends the whole session chain, not just the current token', async () => {
      refreshTokenRepository.findOne.mockResolvedValue({
        id: 1,
        familyId: 'family-1',
      });

      await service.logout('some-token');

      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        familyId: 'family-1',
      });
    });

    it('is a no-op for a token that is not in the database', async () => {
      refreshTokenRepository.findOne.mockResolvedValue(null);

      await service.logout('unknown-token');

      expect(refreshTokenRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('password reset', () => {
    // Telling the caller "no such user" would turn this into a way to
    // find out which numbers are registered.
    it('answers the same for a number with no account, and sends nothing', async () => {
      usersService.findOneByMobile.mockResolvedValue(null);

      await expect(service.forgotPassword('09120000000')).resolves.toEqual({
        mobile: '09120000000',
      });
      expect(smsService.sendOtp).not.toHaveBeenCalled();
    });

    it('sends a reset code of its own, separate from any signup code', async () => {
      usersService.findOneByMobile.mockResolvedValue({ id: 1 });
      otpRepository.findOneBy.mockResolvedValue(null);

      await service.forgotPassword('09120000000');

      expect(otpRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: OtpPurposeEnum.PasswordReset }),
      );
      expect(smsService.sendOtp).toHaveBeenCalled();
    });

    it('refuses a wrong code and counts the attempt', async () => {
      otpRepository.findOneBy.mockResolvedValue({
        id: 1,
        mobile: '09120000000',
        codeHash: 'not-this',
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      });

      await expect(
        service.resetPassword({
          mobile: '09120000000',
          code: '123456',
          password: 'NewPassword1',
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.OTP_INCORRECT });
      expect(usersService.setPassword).not.toHaveBeenCalled();
    });

    // Whoever locked them out may still be holding a refresh token.
    it('signs every session out once the password is replaced', async () => {
      const code = '123456';
      const hash = createHmac('sha256', OTP_SECRET).update(code).digest('hex');
      otpRepository.findOneBy.mockResolvedValue({
        id: 1,
        mobile: '09120000000',
        codeHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      });
      usersService.findOneByMobile.mockResolvedValue({ id: 7 });

      await service.resetPassword({
        mobile: '09120000000',
        code,
        password: 'NewPassword1',
      });

      expect(usersService.setPassword).toHaveBeenCalledWith(
        7,
        expect.any(String),
      );
      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        user: { id: 7 },
      });
    });
  });

  describe('changing a password while signed in', () => {
    it('refuses without the current one', async () => {
      const hash = await bcrypt.hash('CurrentPassword1', 10);
      usersService.findOneWithPassword.mockResolvedValue({
        id: 7,
        password: hash,
      });

      await expect(
        service.changePassword(7, 'WrongCurrent1', 'NewPassword1'),
      ).rejects.toMatchObject({ code: ErrorCodes.CURRENT_PASSWORD_INCORRECT });
      expect(usersService.setPassword).not.toHaveBeenCalled();
    });

    it('replaces it and signs the other sessions out', async () => {
      const hash = await bcrypt.hash('CurrentPassword1', 10);
      usersService.findOneWithPassword.mockResolvedValue({
        id: 7,
        password: hash,
      });

      await service.changePassword(7, 'CurrentPassword1', 'NewPassword1');

      expect(usersService.setPassword).toHaveBeenCalledWith(
        7,
        expect.any(String),
      );
      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        user: { id: 7 },
      });
    });
  });
});
