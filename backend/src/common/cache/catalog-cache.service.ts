import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { randomUUID } from 'crypto';

export enum CatalogCacheScope {
  Products = 'products',
  Categories = 'categories',
}

interface CacheStore {
  get<T>(key: string): Promise<T | null | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<unknown>;
}

const VERSION_TTL_MS = 24 * 60 * 60 * 1000;
const INITIAL_VERSION = 'initial';

@Injectable()
export class CatalogCacheService {
  private readonly logger = new Logger(CatalogCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: CacheStore) {}

  async getVersion(scope: CatalogCacheScope): Promise<string> {
    const version = await this.cache.get<string>(this.versionKey(scope));
    return version ?? INITIAL_VERSION;
  }

  // Called after a write commits, not inside the transaction: invalidating
  // early would let a reader cache the old rows again.
  async invalidate(...scopes: CatalogCacheScope[]): Promise<void> {
    const uniqueScopes = [...new Set(scopes)];
    try {
      await Promise.all(
        uniqueScopes.map((scope) =>
          this.cache.set(this.versionKey(scope), randomUUID(), VERSION_TTL_MS),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Could not invalidate catalog cache (${uniqueScopes.join(', ')})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private versionKey(scope: CatalogCacheScope): string {
    return `catalog-cache-version:${scope}`;
  }
}
