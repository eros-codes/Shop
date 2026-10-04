import { DatabaseThrottlerStorage } from './database-throttler.storage';

describe('DatabaseThrottlerStorage', () => {
  const buildStorage = (row: Record<string, unknown>) => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const dataSource = {
      query: jest.fn((sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        return Promise.resolve(sql.trim().startsWith('SELECT') ? [row] : []);
      }),
    };
    return {
      storage: new DatabaseThrottlerStorage(dataSource as never),
      queries,
    };
  };

  it('counts a hit with a single upsert and reports the window', async () => {
    const { storage, queries } = buildStorage({
      hits: 3,
      ttlSeconds: '42.5',
      blockSeconds: '0',
    });

    const record = await storage.increment('1.2.3.4', 60000, 100, 0, 'default');

    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 43,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(queries[0].sql).toContain('ON DUPLICATE KEY UPDATE');
    expect(queries[0].params[0]).toBe('default:1.2.3.4');
    expect(queries).toHaveLength(2);
  });

  it('blocks once the shared counter passes the limit', async () => {
    const { storage, queries } = buildStorage({
      hits: 101,
      ttlSeconds: '30',
      blockSeconds: '0',
    });

    const record = await storage.increment(
      '1.2.3.4',
      60000,
      100,
      60000,
      'default',
    );

    expect(record.isBlocked).toBe(true);
    expect(record.totalHits).toBe(101);
    expect(record.timeToBlockExpire).toBe(60);
    expect(queries[2].sql).toContain(
      'UPDATE `rate_limits` SET `blocked_until`',
    );
  });

  it('keeps a client blocked while an earlier block window is still open', async () => {
    const { storage } = buildStorage({
      hits: 5,
      ttlSeconds: '10',
      blockSeconds: '25',
    });

    const record = await storage.increment(
      '1.2.3.4',
      60000,
      100,
      60000,
      'default',
    );

    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(25);
  });
});
