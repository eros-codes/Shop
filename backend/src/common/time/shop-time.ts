// The shop trades on Tehran time and the Persian calendar. The server's
// clock is in whatever zone the host was set up with - often UTC - so
// "today", "this month" and "which day did this order fall on" are worked
// out here, never from Date's local-time methods.
export const SHOP_TIME_ZONE = 'Asia/Tehran';

// Iran has stayed on +03:30 all year since it dropped daylight saving in
// 2022. MySQL is given the offset, not the zone name: named zones need the
// server's time zone tables loaded, and a stock install does not have them.
export const SHOP_UTC_OFFSET = '+03:30';

const DAY_MS = 24 * 60 * 60 * 1000;

const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: SHOP_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

const persianDate = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

// Labels are built from a calendar day, not an instant, so they are
// formatted in UTC - the day key is already a Tehran date.
const persianDayMonth = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
});
const persianMonthName = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC',
  month: 'long',
});
const persianYear = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC',
  year: 'numeric',
});
const persianDayOfMonth = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  timeZone: 'UTC',
  day: 'numeric',
});

function numericParts(
  format: Intl.DateTimeFormat,
  at: Date,
): Record<string, number> {
  const parts: Record<string, number> = {};
  for (const part of format.formatToParts(at)) {
    if (part.type !== 'literal' && part.type !== 'era') {
      parts[part.type] = Number(part.value);
    }
  }
  return parts;
}

// Tehran's offset from UTC at a given moment, in milliseconds.
function offsetAt(at: Date): number {
  const p = numericParts(wallClock, at);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

// The moment a Tehran wall-clock time happens. Month and day may run over
// (day 0, day 32) the way Date.UTC allows.
export function fromShopWallTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const guess = wall - offsetAt(new Date(wall));
  return new Date(wall - offsetAt(new Date(guess)));
}

// The Tehran calendar date of a moment, as YYYY-MM-DD (Gregorian).
export function shopDayKey(at: Date): string {
  const p = numericParts(wallClock, at);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function startOfShopDay(at: Date = new Date()): Date {
  const p = numericParts(wallClock, at);
  return fromShopWallTime(p.year, p.month, p.day);
}

// Midnight in Tehran on the first day of the current Persian month.
export function startOfShopMonth(at: Date = new Date()): Date {
  const p = numericParts(wallClock, at);
  const persianDay = numericParts(persianDate, at).day;
  return fromShopWallTime(p.year, p.month, p.day - (persianDay - 1));
}

// A report boundary as the API was given it. A bare date means that whole
// Tehran day (its first moment for `start`, its last for `end`); a time
// with no zone is Tehran time; anything with Z or an offset is taken as is.
export function parseShopBoundary(value: string, edge: 'start' | 'end'): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [year, month, day] = dateOnly.slice(1).map(Number);
    return edge === 'start'
      ? fromShopWallTime(year, month, day)
      : new Date(fromShopWallTime(year, month, day + 1).getTime() - 1);
  }
  const zoneless =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/.exec(
      value,
    );
  if (zoneless) {
    const [year, month, day, hour, minute] = zoneless.slice(1, 6).map(Number);
    const second = Number(zoneless[6] ?? 0);
    const ms = Number((zoneless[7] ?? '0').padEnd(3, '0'));
    return fromShopWallTime(year, month, day, hour, minute, second, ms);
  }
  return new Date(value);
}

// For a YYYY-MM-DD Tehran day: the first day of its Persian month (as a
// day key), and how the day and the month read in Persian.
export function persianMonthStart(dayKey: string): string {
  const noon = new Date(`${dayKey}T12:00:00Z`);
  const persianDay = numericParts(persianDayOfMonth, noon).day;
  return new Date(noon.getTime() - (persianDay - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function persianDayLabel(dayKey: string): string {
  return persianDayMonth.format(new Date(`${dayKey}T12:00:00Z`));
}

export function persianMonthLabel(dayKey: string): string {
  const noon = new Date(`${dayKey}T12:00:00Z`);
  return `${persianMonthName.format(noon)} ${persianYear.format(noon)}`;
}

// A moment as MySQL DATETIME text in UTC, for comparing in SQL against a
// column converted from the server's zone.
export function toUtcSql(at: Date): string {
  return at.toISOString().replace('T', ' ').replace('Z', '');
}
