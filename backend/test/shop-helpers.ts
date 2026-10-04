import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';
import { Wallet } from '../src/wallets/entities/wallet.entity';
import { Address } from '../src/address/entities/address.entity';
import userRoleEnum from '../src/users/enums/userRoleEnum';

// Shared setup for the shop-level e2e suites. Accounts are created
// straight through the data source rather than the registration flow:
// these suites are about what happens AFTER someone has an account, and
// registration needs an SMS provider to hand over a code.
export const PASSWORD = 'TestPassword123';

export async function bootApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

export async function createAccount(
  app: INestApplication,
  role: userRoleEnum,
  options: { walletAmount?: number; withAddress?: boolean } = {},
): Promise<{ id: number; mobile: string; token: string; addressId?: number }> {
  const dataSource = app.get(DataSource);
  // Unique per run, so re-running a suite never collides on the mobile
  // unique index and no cleanup step is needed.
  const mobile = `09${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;

  const users = dataSource.getRepository(User);
  const user = await users.save(
    users.create({
      mobile,
      display_name: 'E2E user',
      password: await bcrypt.hash(PASSWORD, 10),
      role,
    }),
  );

  if (options.walletAmount) {
    const wallets = dataSource.getRepository(Wallet);
    await wallets.save(
      wallets.create({ user, amount: options.walletAmount, is_active: true }),
    );
  }

  let addressId: number | undefined;
  if (options.withAddress) {
    const addresses = dataSource.getRepository(Address);
    const address = await addresses.save(
      addresses.create({
        user,
        province: 'تهران',
        city: 'تهران',
        address: 'خیابان آزادی، پلاک ۱',
        postal_code: '1234567890',
        receiver_mobile: mobile,
      }),
    );
    addressId = address.id;
  }

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ mobile, password: PASSWORD });
  if (!login.body?.data?.accessToken) {
    throw new Error(`Could not log the test account in: ${login.text}`);
  }

  return { id: user.id, mobile, token: login.body.data.accessToken, addressId };
}

// A unique idempotency key per checkout, as a real client would send.
export const idempotencyKey = (label: string): string =>
  `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
