import { LruCacheService } from '../services/LruCacheService';
import { CacheStrategyManager } from '../services/CacheStrategyManager';

describe('CacheStrategyManager stale-while-revalidate', () => {
  it('returns stale value first and refreshes in background after refresh window', async () => {
    delete process.env.LRU_CACHE_PERSIST_PATH;
    delete process.env.LRU_CACHE_PERSIST_INTERVAL_MS;

    const cache = new LruCacheService();
    const manager = new CacheStrategyManager(cache);

    const loader = jest
      .fn()
      .mockResolvedValueOnce({ branches: ['main'] })
      .mockResolvedValueOnce({ branches: ['main', 'feature/new-branch'] })
      .mockResolvedValue({ branches: ['main', 'feature/new-branch'] });

    const first = await manager.getWithStaleWhileRevalidate({
      key: 'test:swr',
      refreshIntervalMs: 10,
      loader,
    });
    expect(first).toEqual({ branches: ['main'] });
    expect(loader).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await manager.getWithStaleWhileRevalidate({
      key: 'test:swr',
      refreshIntervalMs: 10,
      loader,
    });
    expect(second).toEqual({ branches: ['main'] });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const third = await manager.getWithStaleWhileRevalidate({
      key: 'test:swr',
      refreshIntervalMs: 10,
      loader,
    });
    expect(loader.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(third).toEqual({ branches: ['main', 'feature/new-branch'] });
  });
});
