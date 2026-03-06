import { CacheStrategyManager } from '../services/CacheStrategyManager';
import { CacheClient } from '../services/RedisCacheService';

class InMemoryCacheClient implements CacheClient {
  private cache = new Map<string, unknown>();

  async getJson<T>(key: string): Promise<T | null> {
    return this.cache.has(key) ? (this.cache.get(key) as T) : null;
  }

  async setJson(key: string, value: unknown, _ttlSeconds: number): Promise<void> {
    this.cache.set(key, value);
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.cache.delete(key);
    }
  }

  async delByPattern(pattern: string): Promise<number> {
    const regex = new RegExp(
      '^' +
      pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*') +
      '$'
    );
    let deleted = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }
}

describe('CacheStrategyManager stale-while-revalidate', () => {
  it('returns stale value first and refreshes in background after refresh window', async () => {
    const cache = new InMemoryCacheClient();
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
