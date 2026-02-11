import type Redis from 'ioredis';
import { RedisManager } from '../db/RedisManager';

/**
 * Redis 缓存服务（统一 JSON 缓存读写与失效）
 */
export class RedisCacheService {
  private static WARN_INTERVAL_MS = 60 * 1000;
  private static lastWarnAt = 0;

  constructor(private redis?: Redis | null) {}

  private getClient(): Redis | null {
    return this.redis ?? RedisManager.getInstanceSafe();
  }

  private warn(operation: string, error: unknown): void {
    const now = Date.now();
    if (now - RedisCacheService.lastWarnAt < RedisCacheService.WARN_INTERVAL_MS) {
      return;
    }
    RedisCacheService.lastWarnAt = now;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[RedisCacheService] ${operation} 失败，已降级为无缓存路径: ${message}`);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const client = this.getClient();
    if (!client) return null;

    try {
      const raw = await client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.warn(`getJson(${key})`, error);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    try {
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.warn(`setJson(${key})`, error);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const client = this.getClient();
    if (!client) return;

    try {
      await client.del(...keys);
    } catch (error) {
      this.warn(`del(${keys.length} keys)`, error);
    }
  }

  async delByPattern(pattern: string, batchSize: number = 100): Promise<number> {
    const client = this.getClient();
    if (!client) return 0;

    try {
      let deleted = 0;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
        if (keys.length > 0) {
          await client.del(...keys);
          deleted += keys.length;
        }
        cursor = nextCursor;
      } while (cursor !== '0');

      return deleted;
    } catch (error) {
      this.warn(`delByPattern(${pattern})`, error);
      return 0;
    }
  }
}
