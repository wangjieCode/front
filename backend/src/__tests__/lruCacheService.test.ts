import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const loadService = () => {
  // 每次重新加载模块，避免静态单例在用例间串状态
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../services/LruCacheService') as {
    LruCacheService: {
      new (): {
        getJson<T>(key: string): Promise<T | null>;
        setJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;
      };
      persistNow(): Promise<void>;
    };
  };
};

describe('LruCacheService never-expire behavior', () => {
  it('keeps key alive when ttlSeconds is 0', async () => {
    delete process.env.LRU_CACHE_PERSIST_PATH;
    delete process.env.LRU_CACHE_PERSIST_INTERVAL_MS;

    const { LruCacheService } = loadService();
    const cache = new LruCacheService();

    await cache.setJson('never-expire:key', { ok: true }, 0);
    await new Promise((resolve) => setTimeout(resolve, 30));

    await expect(cache.getJson<{ ok: boolean }>('never-expire:key')).resolves.toEqual({ ok: true });
  });

  it('persists and restores key with no ttl', async () => {
    const persistPath = path.join(
      os.tmpdir(),
      `lru-cache-persist-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );

    process.env.LRU_CACHE_PERSIST_PATH = persistPath;
    process.env.LRU_CACHE_PERSIST_INTERVAL_MS = '3600000';

    {
      const { LruCacheService } = loadService();
      const cache = new LruCacheService();
      await cache.setJson('persist:no-ttl', { value: 1 }, 0);
      await LruCacheService.persistNow();
    }

    const snapshotRaw = await fs.readFile(persistPath, 'utf8');
    const snapshot = JSON.parse(snapshotRaw) as {
      entries: Array<{ key: string; ttlMs: number | null }>;
    };
    const persistedEntry = snapshot.entries.find((entry) => entry.key === 'persist:no-ttl');
    expect(persistedEntry).toBeDefined();
    expect(persistedEntry?.ttlMs).toBeNull();

    {
      const { LruCacheService } = loadService();
      const cache = new LruCacheService();
      await expect(cache.getJson<{ value: number }>('persist:no-ttl')).resolves.toEqual({ value: 1 });
    }

    await fs.rm(persistPath, { force: true });
  });
});
