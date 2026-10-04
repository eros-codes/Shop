import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { DataSource } from 'typeorm';
import { queryRows } from '../database/raw-query';

@Injectable()
// Rate limit counters in the database rather than in memory, so several
// application instances share one limit instead of one each.
export class DatabaseThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly dataSource: DataSource) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const bucketKey = `${throttlerName}:${key}`.slice(0, 191);
    const ttlSeconds = Math.max(Math.ceil(ttl / 1000), 1);
    const blockSeconds = Math.max(Math.ceil((blockDuration || ttl) / 1000), 1);

    await this.dataSource.query(
      'INSERT INTO `rate_limits` (`bucket_key`, `hits`, `expires_at`) ' +
        'VALUES (?, 1, DATE_ADD(NOW(3), INTERVAL ? SECOND)) ' +
        'ON DUPLICATE KEY UPDATE ' +
        '`hits` = IF(`expires_at` <= NOW(3), 1, `hits` + 1), ' +
        '`expires_at` = IF(`expires_at` <= NOW(3), VALUES(`expires_at`), `expires_at`), ' +
        '`blocked_until` = IF(`blocked_until` <= NOW(3), NULL, `blocked_until`)',
      [bucketKey, ttlSeconds],
    );

    const [row] = await queryRows<{
      hits: number;
      ttlSeconds: number;
      blockSeconds: number;
    }>(
      this.dataSource,
      'SELECT `hits` AS hits, ' +
        'GREATEST(TIMESTAMPDIFF(MICROSECOND, NOW(3), `expires_at`), 0) / 1000000 AS ttlSeconds, ' +
        'GREATEST(TIMESTAMPDIFF(MICROSECOND, NOW(3), COALESCE(`blocked_until`, NOW(3))), 0) / 1000000 AS blockSeconds ' +
        'FROM `rate_limits` WHERE `bucket_key` = ?',
      [bucketKey],
    );

    const totalHits = Number(row?.hits ?? 1);
    const timeToExpire = Math.ceil(Number(row?.ttlSeconds ?? 0));
    let timeToBlockExpire = Math.ceil(Number(row?.blockSeconds ?? 0));
    const isBlocked = totalHits > limit || timeToBlockExpire > 0;

    if (totalHits > limit) {
      await this.dataSource.query(
        'UPDATE `rate_limits` SET `blocked_until` = ' +
          'IF(`blocked_until` IS NULL OR `blocked_until` <= NOW(3), DATE_ADD(NOW(3), INTERVAL ? SECOND), `blocked_until`) ' +
          'WHERE `bucket_key` = ?',
        [blockSeconds, bucketKey],
      );
      timeToBlockExpire = Math.max(timeToBlockExpire, blockSeconds);
    }

    return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
  }
}
