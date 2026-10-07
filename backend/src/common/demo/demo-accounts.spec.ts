import { DEMO_ACCOUNT_MOBILES, isLockedDemoAccount } from './demo-accounts';

describe('demo account lock', () => {
  const original = process.env.DEMO_MODE;
  afterEach(() => {
    process.env.DEMO_MODE = original;
  });

  it('locks the seeded accounts on a demo server', () => {
    process.env.DEMO_MODE = 'true';
    for (const mobile of DEMO_ACCOUNT_MOBILES) {
      expect(isLockedDemoAccount(mobile)).toBe(true);
    }
  });

  it('leaves other accounts alone on a demo server', () => {
    process.env.DEMO_MODE = 'true';
    expect(isLockedDemoAccount('09121234567')).toBe(false);
    expect(isLockedDemoAccount(null)).toBe(false);
  });

  // The guard must be inert on a real shop, even for these numbers.
  it('locks nothing when DEMO_MODE is not set', () => {
    delete process.env.DEMO_MODE;
    expect(isLockedDemoAccount(DEMO_ACCOUNT_MOBILES[0])).toBe(false);
    process.env.DEMO_MODE = 'false';
    expect(isLockedDemoAccount(DEMO_ACCOUNT_MOBILES[0])).toBe(false);
  });
});
