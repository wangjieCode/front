import Redis from 'ioredis';

export interface CacheClient {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  delByPattern(pattern: string, batchSize?: number): Promise<number>;
}

/**
 * Redis 业务缓存服务（JSON 读写 + 按模式删键）
 * 当 BIZ_REDIS_URL 未配置时自动降级为 no-op，不影响主流程
 */
export class RedisCacheService implements CacheClient {
  private static client: Redis | null = null;
  private static keyPrefix = '';
  private static available = true;

  private static getClient(): Redis | null {
    if (this.client) return this.client;
    if (!this.available) return null;

    const redisUrl = (process.env.BIZ_REDIS_URL || '').trim();
    if (!redisUrl) {
      this.available = false;
      console.warn('[RedisCacheService] BIZ_REDIS_URL 未配置，缓存降级为 no-op');
      return null;
    }

    this.keyPrefix = (process.env.BIZ_REDIS_PREFIX || '').trim();
    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: false,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        tls: redisUrl.includes('rediss://') || redisUrl.includes('.upstash.io') ? {} : undefined,
      });
      this.client.on('error', (err) => {
        console.warn('[RedisCacheService] Redis 连接错误:', err.message);
      });
    } catch (err) {
      this.available = false;
      console.warn('[RedisCacheService] Redis 初始化失败，缓存降级为 no-op:', err);
      return null;
    }
    return this.client;
  }

  private static fullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const client = RedisCacheService.getClient();
    if (!client) return null;
    try {
      const raw = await client.get(RedisCacheService.fullKey(key));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = RedisCacheService.getClient();
    if (!client) return;
    try {
      const payload = JSON.stringify(value);
      const redisKey = RedisCacheService.fullKey(key);
      if (ttlSeconds > 0) {
        await client.set(redisKey, payload, 'EX', ttlSeconds);
        return;
      }
      await client.set(redisKey, payload);
    } catch {
      // 缓存写入失败不影响主流程
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const client = RedisCacheService.getClient();
    if (!client) return;
    try {
      const redisKeys = keys.map((key) => RedisCacheService.fullKey(key));
      await client.del(...redisKeys);
    } catch {
      // 缓存删除失败不影响主流程
    }
  }

  async delByPattern(pattern: string, batchSize: number = 100): Promise<number> {
    const client = RedisCacheService.getClient();
    if (!client) return 0;
    try {
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
    } catch {
      return 0;
    }
  }
}
