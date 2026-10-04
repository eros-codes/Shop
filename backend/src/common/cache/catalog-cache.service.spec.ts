import {
  CatalogCacheScope,
  CatalogCacheService,
} from './catalog-cache.service';

describe('CatalogCacheService', () => {
  const makeCache = () => {
    const store = new Map<string, unknown>();
    return {
      store,
      get: jest.fn(async (key: string) => store.get(key)),
      set: jest.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    };
  };

  it('starts at a stable initial version and gets a new, unique one on every invalidation', async () => {
    const cache = makeCache();
    const service = new CatalogCacheService(cache as any);

    const initial = await service.getVersion(CatalogCacheScope.Products);
    await service.invalidate(CatalogCacheScope.Products);
    const second = await service.getVersion(CatalogCacheScope.Products);
    await service.invalidate(CatalogCacheScope.Products);
    const third = await service.getVersion(CatalogCacheScope.Products);

    expect(new Set([initial, second, third]).size).toBe(3);
  });

  it('only bumps the scopes it is given', async () => {
    const cache = makeCache();
    const service = new CatalogCacheService(cache as any);
    const categoriesBefore = await service.getVersion(
      CatalogCacheScope.Categories,
    );

    await service.invalidate(CatalogCacheScope.Products);

    expect(await service.getVersion(CatalogCacheScope.Categories)).toBe(
      categoriesBefore,
    );
  });

  it('never throws when the cache backend fails - the write already committed', async () => {
    const cache = makeCache();
    cache.set.mockRejectedValue(new Error('cache down'));
    const service = new CatalogCacheService(cache as any);

    await expect(
      service.invalidate(CatalogCacheScope.Products),
    ).resolves.toBeUndefined();
  });
});
