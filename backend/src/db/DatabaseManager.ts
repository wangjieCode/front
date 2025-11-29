import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * 数据库配置接口
 */
export interface DatabaseConfig {
  connectionString: string; // PostgreSQL 连接字符串
  max?: number; // 最大连接数
  idleTimeout?: number; // 空闲超时（秒）
  connectionTimeout?: number; // 连接超时（秒）
}

/**
 * 数据库客户端管理器
 * 单例模式，管理数据库连接和 Drizzle 实例
 */
export class DatabaseManager {
  private static client: postgres.Sql | null = null;
  private static db: ReturnType<typeof drizzle> | null = null;
  private static config: DatabaseConfig | null = null;

  /**
   * 初始化数据库连接
   * @param config 数据库配置
   */
  static initialize(config: DatabaseConfig): void {
    if (this.client) {
      console.warn('Database already initialized. Closing existing connection...');
      this.close();
    }

    this.config = config;

    // 创建 PostgreSQL 客户端
    this.client = postgres(config.connectionString, {
      max: config.max ?? 10,
      idle_timeout: config.idleTimeout ?? 20,
      connect_timeout: config.connectionTimeout ?? 10,
      onnotice: () => {}, // 忽略 PostgreSQL 通知
    });

    // 创建 Drizzle 实例
    this.db = drizzle(this.client, { schema });

    console.log('Database initialized successfully');
  }

  /**
   * 获取 Drizzle 数据库实例
   * @returns Drizzle 数据库实例
   * @throws 如果数据库未初始化
   */
  static getDb(): ReturnType<typeof drizzle> {
    if (!this.db) {
      throw new Error('Database not initialized. Call DatabaseManager.initialize() first.');
    }
    return this.db;
  }

  /**
   * 获取原始 PostgreSQL 客户端
   * @returns PostgreSQL 客户端
   * @throws 如果数据库未初始化
   */
  static getClient(): postgres.Sql {
    if (!this.client) {
      throw new Error('Database not initialized. Call DatabaseManager.initialize() first.');
    }
    return this.client;
  }

  /**
   * 测试数据库连接
   * @returns 连接是否成功
   */
  static async testConnection(): Promise<boolean> {
    try {
      if (!this.client) {
        throw new Error('Database not initialized');
      }

      // 执行简单查询测试连接
      await this.client`SELECT 1 as test`;
      console.log('Database connection test successful');
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * 关闭数据库连接
   */
  static async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.end();
        console.log('Database connection closed');
      } catch (error) {
        console.error('Error closing database connection:', error);
      } finally {
        this.client = null;
        this.db = null;
        this.config = null;
      }
    }
  }

  /**
   * 获取当前配置
   * @returns 当前数据库配置
   */
  static getConfig(): DatabaseConfig | null {
    return this.config;
  }

  /**
   * 检查数据库是否已初始化
   * @returns 是否已初始化
   */
  static isInitialized(): boolean {
    return this.db !== null && this.client !== null;
  }
}
