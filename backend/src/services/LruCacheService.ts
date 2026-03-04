import { LRUCache } from 'lru-cache';
import { promises as fs } from 'fs';
import path from 'path';

const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024;
const DEFAULT_PERSIST_INTERVAL_MS = 60_000;

interface PersistedCacheEntry {
  key: string;
  value: object;
  ttlMs: number | null;
}

interface PersistedCacheSnapshot {
  version: 1;
  savedAt: string;
  entries: PersistedCacheEntry[];
}

function calculateEntrySize(value: unknown, key: string): number {
  try {
    const payload = JSON.stringify(value);
    return Buffer.byteLength(key, 'utf8') + Buffer.byteLength(payload, 'utf8');
  } catch {
    return Buffer.byteLength(key, 'utf8') + 1024;
  }
}

/**
 * 进程内 LRU 缓存服务（统一 JSON 缓存读写与失效）
 */
export class LruCacheService {
  private static cache = new LRUCache<string, object>({
    maxSize: MAX_CACHE_SIZE_BYTES,
    ttlAutopurge: true,
    sizeCalculation: (value, key) => calculateEntrySize(value, key),
  });
  private static persistPath: string | null = null;
  private static persistIntervalMs = DEFAULT_PERSIST_INTERVAL_MS;
  private static persistenceTimer: NodeJS.Timeout | null = null;
  private static persistenceBootstrapped = false;
  private static restorePromise: Promise<void> | null = null;
  private static persistPromise: Promise<void> | null = null;

  constructor() {
    LruCacheService.bootstrapPersistence();
  }

  private static bootstrapPersistence(): void {
    if (this.persistenceBootstrapped) return;
    this.persistenceBootstrapped = true;

    const rawPath = (process.env.LRU_CACHE_PERSIST_PATH || '').trim();
    if (!rawPath) return;

    const parsedInterval = Number(process.env.LRU_CACHE_PERSIST_INTERVAL_MS || DEFAULT_PERSIST_INTERVAL_MS);
    this.persistIntervalMs = Number.isFinite(parsedInterval) && parsedInterval >= 1_000
      ? parsedInterval
      : DEFAULT_PERSIST_INTERVAL_MS;
    this.persistPath = path.resolve(rawPath);
    this.restorePromise = this.restoreFromDisk();
    this.startPeriodicPersistence();
  }

  private static startPeriodicPersistence(): void {
    if (!this.persistPath || this.persistenceTimer) return;

    this.persistenceTimer = setInterval(() => {
      void this.persistToDisk();
    }, this.persistIntervalMs);
    this.persistenceTimer.unref();

    console.log(
      `[LruCacheService] 已启用定时持久化: path=${this.persistPath}, intervalMs=${this.persistIntervalMs}`
    );
  }

  private static async ensurePersistenceReady(): Promise<void> {
    this.bootstrapPersistence();
    if (this.restorePromise) {
      await this.restorePromise;
    }
  }

  private static async restoreFromDisk(): Promise<void> {
    if (!this.persistPath) return;

    try {
      const raw = await fs.readFile(this.persistPath, 'utf8');
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw) as PersistedCacheSnapshot;
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return;

      for (const entry of parsed.entries) {
        if (!entry || typeof entry.key !== 'string') continue;
        if (entry.ttlMs === null) {
          this.cache.set(entry.key, entry.value);
          continue;
        }
        if (entry.ttlMs <= 0) continue;
        this.cache.set(entry.key, entry.value, { ttl: entry.ttlMs });
      }

      console.log(`[LruCacheService] 已恢复缓存快照: ${parsed.entries.length} entries`);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return;
      }
      console.warn('[LruCacheService] 缓存恢复失败，已忽略:', error?.message || error);
    }
  }

  private static async persistToDisk(): Promise<void> {
    if (!this.persistPath) return;
    const persistPath = this.persistPath;
    if (this.persistPromise) {
      await this.persistPromise;
      return;
    }

    this.persistPromise = (async () => {
      try {
        const entries: PersistedCacheEntry[] = [];

        for (const key of this.cache.keys()) {
          const value = this.cache.get(key);
          if (value === undefined) continue;
          const ttlMs = this.cache.getRemainingTTL(key);
          if (!Number.isFinite(ttlMs)) {
            entries.push({ key, value, ttlMs: null });
            continue;
          }
          if (ttlMs <= 0) continue;
          entries.push({ key, value, ttlMs });
        }

        const snapshot: PersistedCacheSnapshot = {
          version: 1,
          savedAt: new Date().toISOString(),
          entries,
        };

        const dir = path.dirname(persistPath);
        await fs.mkdir(dir, { recursive: true });
        const tmpPath = `${persistPath}.tmp`;
        await fs.writeFile(tmpPath, JSON.stringify(snapshot), 'utf8');
        await fs.rename(tmpPath, persistPath);
      } catch (error) {
        console.warn('[LruCacheService] 缓存持久化失败，已忽略:', error);
      } finally {
        this.persistPromise = null;
      }
    })();

    await this.persistPromise;
  }

  static async persistNow(): Promise<void> {
    await this.ensurePersistenceReady();
    await this.persistToDisk();
  }

  async getJson<T>(key: string): Promise<T | null> {
    await LruCacheService.ensurePersistenceReady();
    const value = LruCacheService.cache.get(key);
    return value === undefined ? null : (value as T);
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await LruCacheService.ensurePersistenceReady();
    if (ttlSeconds <= 0) {
      LruCacheService.cache.set(key, value as object);
      return;
    }
    LruCacheService.cache.set(key, value as object, { ttl: ttlSeconds * 1000 });
  }

  async del(...keys: string[]): Promise<void> {
    await LruCacheService.ensurePersistenceReady();
    if (keys.length === 0) return;
    for (const key of keys) {
      LruCacheService.cache.delete(key);
    }
  }

  async delByPattern(pattern: string, batchSize: number = 100): Promise<number> {
    await LruCacheService.ensurePersistenceReady();
    void batchSize;
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*') +
        '$'
    );

    let deleted = 0;
    for (const key of LruCacheService.cache.keys()) {
      if (regex.test(key)) {
        LruCacheService.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }
}
