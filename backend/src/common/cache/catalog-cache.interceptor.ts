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
import userRoleEnum from '../../users/enums/userRoleEnum';
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
    // A cached response is served without the handler running - and with
    // it, the check that only an admin may see drafts. Anything an admin
    // asked for stays out of the shared cache.
    const request = context.switchToHttp().getRequest<{
      query?: Record<string, unknown>;
      user?: { role?: string } | null;
    }>();
    if (
      request.query?.includeDrafts === 'true' ||
      request.user?.role === userRoleEnum.AdminUser
    ) {
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
