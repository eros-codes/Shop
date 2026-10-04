import {
  applyDecorators,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { CACHE_MANAGER, CacheInterceptor } from '@nestjs/cache-manager';
import { Reflector } from '@nestjs/core';
import {
  CatalogCacheScope,
  CatalogCacheService,
} from './catalog-cache.service';

const CATALOG_CACHE_SCOPE = 'catalog-cache-scope';

@Injectable()
export class CatalogCacheInterceptor extends CacheInterceptor {
  private readonly logger = new Logger(CatalogCacheInterceptor.name);

  constructor(
    @Inject(CACHE_MANAGER) cacheManager: unknown,
    reflector: Reflector,
    private readonly catalogCache: CatalogCacheService,
  ) {
    super(cacheManager, reflector);
  }

  protected async trackBy(
    context: ExecutionContext,
  ): Promise<string | undefined> {
    const scope = this.reflector.get<CatalogCacheScope | undefined>(
      CATALOG_CACHE_SCOPE,
      context.getHandler(),
    );
    const urlKey = await super.trackBy(context);
    if (!scope || !urlKey) {
      return undefined;
    }
    try {
      const version = await this.catalogCache.getVersion(scope);
      return `${scope}:${version}:${urlKey}`;
    } catch (error) {
      this.logger.warn(
        `Cache version lookup failed, serving uncached: ${String(error)}`,
      );
      return undefined;
    }
  }
}

export const CatalogCache = (scope: CatalogCacheScope) =>
  applyDecorators(
    SetMetadata(CATALOG_CACHE_SCOPE, scope),
    UseInterceptors(CatalogCacheInterceptor),
  );
