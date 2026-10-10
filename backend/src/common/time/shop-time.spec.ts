import {
  parseShopBoundary,
  persianDayLabel,
  persianMonthLabel,
  persianMonthStart,
  shopDayKey,
  startOfShopDay,
  startOfShopMonth,
  toUtcSql,
} from './shop-time';

// Every case is pinned to a moment, so it reads the same on a UTC host, a
// Tehran one, or a laptop anywhere else.
describe('shop time (Tehran, Persian calendar)', () => {
  // 00:30 on 19 Mehr in Tehran - still the 10th of October in UTC.
  const justAfterMidnight = new Date('2026-10-10T21:00:00Z');

  it('puts a moment on its Tehran day, not the server day', () => {
    expect(shopDayKey(justAfterMidnight)).toBe('2026-10-11');
    expect(shopDayKey(new Date('2026-10-10T20:29:59Z'))).toBe('2026-10-10');
  });

  it('starts the day at midnight in Tehran', () => {
    expect(startOfShopDay(justAfterMidnight).toISOString()).toBe(
      '2026-10-10T20:30:00.000Z',
    );
  });

  it('starts the month on the first of the Persian month', () => {
    // 18 Mehr 1405 -> 1 Mehr 1405 is 23 September 2026.
    expect(
      startOfShopMonth(new Date('2026-10-10T13:00:00Z')).toISOString(),
    ).toBe('2026-09-22T20:30:00.000Z');
  });

  it('reads a bare date as the whole Tehran day', () => {
    expect(parseShopBoundary('2026-10-10', 'start').toISOString()).toBe(
      '2026-10-09T20:30:00.000Z',
    );
    expect(parseShopBoundary('2026-10-10', 'end').toISOString()).toBe(
      '2026-10-10T20:29:59.999Z',
    );
  });

  it('reads a time with no zone as Tehran time, and keeps an explicit one', () => {
    expect(
      parseShopBoundary('2026-10-10T08:15:00', 'start').toISOString(),
    ).toBe('2026-10-10T04:45:00.000Z');
    expect(
      parseShopBoundary('2026-10-10T08:15:00Z', 'start').toISOString(),
    ).toBe('2026-10-10T08:15:00.000Z');
    expect(
      parseShopBoundary('2026-10-10T08:15:00+03:30', 'start').toISOString(),
    ).toBe('2026-10-10T04:45:00.000Z');
  });

  it('finds the Persian month a day belongs to', () => {
    expect(persianMonthStart('2026-10-10')).toBe('2026-09-23');
    expect(persianMonthStart('2026-09-23')).toBe('2026-09-23');
    // 31 Shahrivar, the day before Mehr starts.
    expect(persianMonthStart('2026-09-22')).toBe('2026-08-23');
    // Across the Persian new year.
    expect(persianMonthStart('2026-03-20')).toBe('2026-02-20');
  });

  it('labels days and months in Persian', () => {
    expect(persianDayLabel('2026-10-10')).toBe('۱۸ مهر');
    expect(persianMonthLabel('2026-10-10')).toBe('مهر ۱۴۰۵');
  });

  it('writes a moment as UTC DATETIME text for MySQL', () => {
    expect(toUtcSql(new Date('2026-10-10T20:30:00.000Z'))).toBe(
      '2026-10-10 20:30:00.000',
    );
  });
});
