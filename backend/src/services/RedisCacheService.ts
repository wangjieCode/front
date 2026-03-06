import Redis from 'ioredis';

export interface CacheClient {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  delByPattern(pattern: string, batchSize?: number): Promise<number>;
}

/**
 * Redis 业务缓存服务（JSON 读写 + 按模式删键）
 */
export class RedisCacheService implements CacheClient {
  private static client: Redis | null = null;
  private static keyPrefix = '';

  private static getClient(): Redis {
    if (this.client) return this.client;

    const redisUrl = (process.env.BIZ_REDIS_URL || '').trim();
    if (!redisUrl) {
      throw new Error('BIZ_REDIS_URL not configured');
    }

    this.keyPrefix = (process.env.BIZ_REDIS_PREFIX || '').trim();
    this.client = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      tls: redisUrl.includes('rediss://') || redisUrl.includes('.upstash.io') ? {} : undefined,
    });
    return this.client;
  }

  private static fullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await RedisCacheService.getClient().get(RedisCacheService.fullKey(key));
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const payload = JSON.stringify(value);
    const redisKey = RedisCacheService.fullKey(key);
    const client = RedisCacheService.getClient();
    if (ttlSeconds > 0) {
      await client.set(redisKey, payload, 'EX', ttlSeconds);
      return;
    }
    await client.set(redisKey, payload);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const redisKeys = keys.map((key) => RedisCacheService.fullKey(key));
    await RedisCacheService.getClient().del(...redisKeys);
  }

  async delByPattern(pattern: string, batchSize: number = 100): Promise<number> {
    const client = RedisCacheService.getClient();
    const fullPattern = RedisCacheService.fullKey(pattern);
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', fullPattern, 'COUNT', batchSize);
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await client.del(...keys);
      }
    } while (cursor !== '0');

    return deleted;
  }
}
