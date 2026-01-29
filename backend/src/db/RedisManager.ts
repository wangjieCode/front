import Redis from 'ioredis';

/**
 * Redis 管理器
 * 负责维护与 Upstash/Redis 的连接
 */
export class RedisManager {
  private static instance: Redis | null = null;

  /**
   * 获取 Redis 实例
   */
  public static getInstance(): Redis {
    if (!this.instance) {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error('REDIS_URL 环境变量未配置');
      }

      console.log('🔌 正在连接 Redis...');
      this.instance = new Redis(redisUrl, {
        // Upstash 建议开启 tls
        tls: redisUrl.includes('rediss://') || redisUrl.includes('.upstash.io') ? {} : undefined,
        keyPrefix: process.env.REDIS_PREFIX || '', // 自动添加环境前缀（dev: 或 prod:）
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
