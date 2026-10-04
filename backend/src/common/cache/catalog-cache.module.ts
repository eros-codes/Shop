import { Global, Module } from '@nestjs/common';
import { CatalogCacheService } from './catalog-cache.service';

@Global()
@Module({
  providers: [CatalogCacheService],
  exports: [CatalogCacheService],
})
export class CatalogCacheModule {}
