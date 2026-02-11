import Redis from 'ioredis';

/**
 * Redis 管理器
 * 负责维护与 Upstash/Redis 的连接
 */
export class RedisManager {
  private static instance: Redis | null = null;
  private static hasWarnedDisabled = false;

  private static isDisabledByEnv(): boolean {
    return process.env.DISABLE_REDIS === 'true';
  }

  private static getRedisUrl(): string | null {
    return process.env.REDIS_URL || null;
  }

  private static warnDisabledOnce(reason: string): void {
    if (this.hasWarnedDisabled) return;
    this.hasWarnedDisabled = true;
    console.warn(`[RedisManager] Redis 已禁用，系统将以无缓存模式运行: ${reason}`);
  }

  /**
   * 获取 Redis 实例
   */
  public static getInstance(): Redis {
    if (!this.instance) {
      if (this.isDisabledByEnv()) {
        throw new Error('DISABLE_REDIS=true');
      }

      const redisUrl = this.getRedisUrl();
      if (!redisUrl) {
        throw new Error('REDIS_URL 环境变量未配置');
      }

      console.log('🔌 正在连接 Redis...');
      this.instance = new Redis(redisUrl, {
        // Upstash 建议开启 tls
        tls: redisUrl.includes('rediss://') || redisUrl.includes('.upstash.io') ? {} : undefined,
        keyPrefix: process.env.REDIS_PREFIX || '', // 自动添加环境前缀（dev: 或 prod:）
        connectTimeout: 1000,
        commandTimeout: 1000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      this.instance.on('connect', () => {
        console.log('✅ Redis 连接成功');
      });

      this.instance.on('error', (err) => {
        console.error('❌ Redis 连接错误:', err);
      });
    }

    return this.instance;
  }

  /**
   * 获取 Redis 实例（安全版，未配置时返回 null）
   */
  public static getInstanceSafe(): Redis | null {
    if (this.isDisabledByEnv()) {
      this.warnDisabledOnce('DISABLE_REDIS=true');
      return null;
    }

    if (!this.getRedisUrl()) {
      this.warnDisabledOnce('REDIS_URL 未配置');
      return null;
    }

    if (this.instance && this.instance.status === 'end') {
      this.instance = null;
    }

    try {
      return this.getInstance();
    } catch (_error) {
      return null;
    }
  }

  /**
   * 关闭 Redis 连接
   */
  public static async close(): Promise<void> {
    if (this.instance) {
      await this.instance.quit();
      this.instance = null;
      console.log('🔌 Redis 连接已关闭');
    }
  }
}
