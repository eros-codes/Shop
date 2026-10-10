import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { assertDisposableTestDatabase } from './assert-test-database';

// Refuses to touch anything that isn't an obviously disposable test
// database (phase 4 / bug 26).
assertDisposableTestDatabase();

// Boots the REAL app (real DB connection via whatever's in .env,
// synchronize:true creates the schema). Run this against a disposable
// test database, not your working dev DB - set DB_DATABASE to
// something like "ecommerce_test" before running `npm run test:e2e`,
// since this will create/read/write real rows there.

// The refresh token now travels as an httpOnly cookie, not a JSON
// field - pull it out of the raw Set-Cookie header so it can be
// replayed on the next request, the same way a browser would.
function extractRefreshTokenCookie(res: request.Response): string {
  const setCookieHeader = res.headers['set-cookie'] as unknown as string[];
  const cookie = setCookieHeader?.find((c) => c.startsWith('refreshToken='));
  if (!cookie) {
    throw new Error('No refreshToken cookie was set on this response');
  }
  return cookie.split(';')[0]; // "refreshToken=<value>", trims the attributes
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  // Unique per run so re-running the suite never collides on the
  // mobile-number unique constraint - no manual DB cleanup needed.
  const mobile = `09${Date.now().toString().slice(-9)}`;
  const password = 'TestPassword123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a protected route with no token', async () => {
    const res = await request(app.getHttpServer()).get('/orders');
    expect(res.status).toBe(401);
  });

  it('completes the full register -> verify-otp -> login flow', async () => {
    // Step 1: register - captures the console.log'd code instead of
    // needing a real SMS provider or reading the (hashed, unreadable)
    // DB row.
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ mobile, password, display_name: 'E2E Test User' });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.mobile).toBe(mobile);

    const logged = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    logSpy.mockRestore();
    // Anchored to what follows the colon: the log line also contains the
    // mobile number, and a bare /(\d{6})/ happily matched the first six
    // digits of THAT instead of the code.
    const match = logged.match(/:\s*(\d{6})\b/);
    expect(match).not.toBeNull();
    const code = match![1];

    // Wrong code is rejected
    const wrongOtpRes = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ mobile, code: code === '000000' ? '111111' : '000000' });
    expect(wrongOtpRes.status).toBe(400);

    // Step 2: verify with the real code - creates the account, logs in
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ mobile, code });

    expect(verifyRes.status).toBe(201);
    expect(verifyRes.body.data).toHaveProperty('accessToken');
    expect(verifyRes.body.data.user).not.toHaveProperty('password');
    // No refreshToken in the body anymore - only ever in the cookie.
    expect(verifyRes.body.data).not.toHaveProperty('refreshToken');
    expect(() => extractRefreshTokenCookie(verifyRes)).not.toThrow();

    // Step 3: can now log in normally with the same credentials
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ mobile, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data).toHaveProperty('accessToken');

    // The freshly issued token actually works on a protected route
    const meRes = await request(app.getHttpServer())
      .get(`/orders`)
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
    expect(meRes.status).toBe(200);
  });

  it('rejects login with the wrong password', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ mobile, password: 'WrongPassword1' });
    expect(res.status).toBe(401);
  });

  it('rejects /auth/refresh when there is no refresh token cookie at all', async () => {
    const res = await request(app.getHttpServer()).post('/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('refresh token rotation: old refresh token stops working after use', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ mobile, password });
    const firstCookie = extractRefreshTokenCookie(loginRes);

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie);
    expect(refreshRes.status).toBe(200);
    const secondCookie = extractRefreshTokenCookie(refreshRes);
    expect(secondCookie).not.toBe(firstCookie);

    // A second tab sending the same token right away still gets a pair -
    // the two tabs share one cookie and refresh together.
    const secondTabRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie);
    expect(secondTabRes.status).toBe(200);
    const siblingCookie = extractRefreshTokenCookie(secondTabRes);

    // Past the grace window, the old (rotated-out) token is a replay: it
    // fails, and takes every token of its chain with it.
    await app
      .get(DataSource)
      .query(
        'UPDATE `refresh_tokens` SET `usedAt` = DATE_SUB(`usedAt`, INTERVAL 5 MINUTE) WHERE `usedAt` IS NOT NULL',
      );
    const reuseRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', firstCookie);
    expect(reuseRes.status).toBe(401);
    for (const cookie of [secondCookie, siblingCookie]) {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookie);
      expect(res.status).toBe(401);
    }
  });

  it('logout invalidates the refresh token', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ mobile, password });
    const cookie = extractRefreshTokenCookie(loginRes);

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie);
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogoutRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie);
    expect(refreshAfterLogoutRes.status).toBe(401);
  });

  // Sign-up and "forgot password" must not tell anyone which numbers are
  // registered. Two requests in a row used to answer 200/200 for one kind
  // of number and 200/429 for the other.
  it('answers sign-up and password reset the same whether or not the number is registered', async () => {
    const fresh = `09${(Date.now() + 3).toString().slice(-9)}`;
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const signUpTwice = async (number: string) => {
      const body = { mobile: number, password, display_name: 'Probe' };
      const first = await request(app.getHttpServer())
        .post('/auth/register')
        .send(body);
      const second = await request(app.getHttpServer())
        .post('/auth/register')
        .send(body);
      return [first.status, second.status, second.body.code];
    };
    const resetTwice = async (number: string) => {
      const first = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ mobile: number });
      const second = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ mobile: number });
      return [first.status, second.status, second.body.code];
    };

    const registered = await signUpTwice(mobile);
    const unregistered = await signUpTwice(fresh);
    expect(registered).toEqual([201, 429, 'OTP_COOLDOWN']);
    expect(unregistered).toEqual(registered);

    const freshForReset = `09${(Date.now() + 5).toString().slice(-9)}`;
    expect(await resetTwice(freshForReset)).toEqual(await resetTwice(mobile));

    // A wrong code against the registered number's sign-up fails like any
    // wrong code, not with "nothing pending for this number".
    const guess = await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ mobile, code: '000000' });
    logSpy.mockRestore();
    expect(guess.status).toBe(400);
    expect(guess.body.code).toBe('OTP_INCORRECT');
  });

  // Sign-in is limited per mobile number, not per IP: a whole carrier can
  // share one address, and one person hammering a number must not lock
  // the others out.
  it('limits sign-in attempts per number, not per address', async () => {
    const target = `09${(Date.now() + 7).toString().slice(-9)}`;
    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ mobile: target, password: 'WrongPassword1' });
      expect(res.status).toBe(401);
    }

    // Same number typed in Persian digits is still the same number.
    const persian = target.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
    const blocked = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ mobile: persian, password: 'WrongPassword1' });
    expect(blocked.status).toBe(429);

    // Someone else on the same address signs in as usual.
    const other = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ mobile, password });
    expect(other.status).toBe(200);
  });
});
