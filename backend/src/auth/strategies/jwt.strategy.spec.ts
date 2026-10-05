import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.stragety';

// The strategy used to trust a token for its whole 15-minute life without
// looking at the database. These pin down the three things that now depend
// on the live row: password changes, role changes and removed accounts.
describe('JwtStrategy', () => {
  const config = {
    getOrThrow: () => 'test-secret-that-is-long-enough-for-the-check',
  } as unknown as ConfigService;

  const build = (row: unknown) => {
    const users = { findOne: jest.fn().mockResolvedValue(row) };
    return { strategy: new JwtStrategy(config, users as never), users };
  };

  const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

  it('accepts a token for a user with no password change on record', async () => {
    const { strategy } = build({
      id: 7,
      role: 'user',
      mobile: '09120000007',
      display_name: 'x',
      tokens_valid_after: null,
    });
    await expect(
      strategy.validate({ sub: 7, role: 'user', iat: 1 }),
    ).resolves.toMatchObject({ userId: 7, role: 'user' });
  });

  it('refuses a token issued before the password changed', async () => {
    const changedAt = new Date('2026-10-05T12:00:10.500Z');
    const { strategy } = build({
      id: 7,
      role: 'user',
      mobile: 'm',
      display_name: 'x',
      tokens_valid_after: changedAt,
    });
    await expect(
      strategy.validate({ sub: 7, role: 'user', iat: seconds(changedAt) - 5 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts the fresh token issued in the same second as the change', async () => {
    // iat only has whole-second resolution; comparing in milliseconds would
    // lock the customer out of the very token they just received.
    const changedAt = new Date('2026-10-05T12:00:10.900Z');
    const { strategy } = build({
      id: 7,
      role: 'user',
      mobile: 'm',
      display_name: 'x',
      tokens_valid_after: changedAt,
    });
    await expect(
      strategy.validate({ sub: 7, role: 'user', iat: seconds(changedAt) }),
    ).resolves.toMatchObject({ userId: 7 });
  });

  it('takes the role from the database, not from the token', async () => {
    const { strategy } = build({
      id: 7,
      role: 'user',
      mobile: 'm',
      display_name: 'x',
      tokens_valid_after: null,
    });
    const result = await strategy.validate({ sub: 7, role: 'admin', iat: 1 });
    expect(result.role).toBe('user');
  });

  it('refuses a token whose account no longer exists', async () => {
    const { strategy } = build(null);
    await expect(
      strategy.validate({ sub: 7, role: 'user', iat: 1 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
