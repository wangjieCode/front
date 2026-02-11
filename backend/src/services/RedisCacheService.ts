import { LRUCache } from 'lru-cache';

/**
 * 进程内缓存服务（统一 JSON 缓存读写与失效）
 */
export class RedisCacheService {
  private static cache = new LRUCache<string, object>({
    max: 5000,
    ttlAutopurge: true,
  });

  // 保留构造参数签名，避免调用方改动
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_redis?: unknown) {}

  async getJson<T>(key: string): Promise<T | null> {
    const value = RedisCacheService.cache.get(key);
    return value === undefined ? null : (value as T);
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    RedisCacheService.cache.set(key, value as object, { ttl: ttlSeconds * 1000 });
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    for (const key of keys) {
      RedisCacheService.cache.delete(key);
    }
  }

  async delByPattern(pattern: string, batchSize: number = 100): Promise<number> {
    void batchSize;
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*') +
        '$'
    );

    let deleted = 0;
    for (const key of RedisCacheService.cache.keys()) {
      if (regex.test(key)) {
        RedisCacheService.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }
}
