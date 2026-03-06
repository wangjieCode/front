import type { CacheClient } from './RedisCacheService';

interface StaleCacheEnvelope<T> {
  value: T;
  fetchedAt: number;
}

interface StaleWhileRevalidateOptions<T> {
  key: string;
  refreshIntervalMs: number;
  loader: () => Promise<T>;
  ttlSeconds?: number;
  onStaleHit?: () => void;
}

interface GetOrLoadOptions<T> {
  key: string;
  loader: () => Promise<T>;
  ttlSeconds?: number;
}

function isStaleEnvelope<T>(input: unknown): input is StaleCacheEnvelope<T> {
  if (!input || typeof input !== 'object') return false;
  const record = input as Record<string, unknown>;
  return 'value' in record && typeof record.fetchedAt === 'number';
}

export class CacheStrategyManager {
  private refreshInFlight = new Map<string, Promise<void>>();

  constructor(private cache: CacheClient) {}

  async get<T>(key: string): Promise<T | null> {
    return this.cache.getJson<T>(key);
  }

  async set(key: string, value: unknown, ttlSeconds: number = 0): Promise<void> {
    await this.cache.setJson(key, value, ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    await this.cache.del(...keys);
  }

  async delByPattern(pattern: string, batchSize: number = 100): Promise<number> {
    return this.cache.delByPattern(pattern, batchSize);
  }

  async getOrLoad<T>(options: GetOrLoadOptions<T>): Promise<T> {
    const { key, loader, ttlSeconds = 0 } = options;
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async getWithStaleWhileRevalidate<T>(options: StaleWhileRevalidateOptions<T>): Promise<T> {
    const {
      key,
      loader,
      onStaleHit,
      ttlSeconds = 0,
      refreshIntervalMs,
    } = options;

    const cached = await this.get<StaleCacheEnvelope<T> | T>(key);
    if (cached) {
      if (isStaleEnvelope<T>(cached)) {
        const isFresh = Date.now() - cached.fetchedAt < refreshIntervalMs;
        if (isFresh) return cached.value;
        onStaleHit?.();
        this.triggerRefresh({ key, loader, ttlSeconds });
        return cached.value;
      }
      // 兼容历史裸值缓存：直接返回并后台刷新
      onStaleHit?.();
      this.triggerRefresh({ key, loader, ttlSeconds });
      return cached as T;
    }

    const fresh = await loader();
    await this.set(key, { value: fresh, fetchedAt: Date.now() }, ttlSeconds);
    return fresh;
  }

  private triggerRefresh<T>(params: { key: string; loader: () => Promise<T>; ttlSeconds: number }): void {
    const { key, loader, ttlSeconds } = params;
    if (this.refreshInFlight.has(key)) return;

    const refreshPromise: Promise<void> = loader()
      .then((value) => this.set(key, { value, fetchedAt: Date.now() }, ttlSeconds))
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.refreshInFlight.delete(key);
      });

    this.refreshInFlight.set(key, refreshPromise);
  }
}
