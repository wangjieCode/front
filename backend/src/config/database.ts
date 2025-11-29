import * as dotenv from 'dotenv';
import { DatabaseConfig } from '../db/DatabaseManager';

// 加载环境变量
dotenv.config();

/**
 * 从环境变量加载数据库配置
 * @returns 数据库配置对象
 * @throws 如果必需的环境变量未设置
 */
export function loadDatabaseConfig(): DatabaseConfig {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
        'Please set it in your .env file. ' +
        'Example: postgresql://postgres:password@localhost:5432/conversation_db'
    );
  }

  return {
    connectionString,
    max: process.env.DB_MAX_CONNECTIONS ? parseInt(process.env.DB_MAX_CONNECTIONS, 10) : 10,
    idleTimeout: process.env.DB_IDLE_TIMEOUT ? parseInt(process.env.DB_IDLE_TIMEOUT, 10) : 20,
    connectionTimeout: process.env.DB_CONNECTION_TIMEOUT
      ? parseInt(process.env.DB_CONNECTION_TIMEOUT, 10)
      : 10,
  };
}

/**
 * 验证数据库配置
 * @param config 数据库配置
 * @returns 配置是否有效
 */
export function validateDatabaseConfig(config: DatabaseConfig): boolean {
  if (!config.connectionString) {
    console.error('Database connection string is empty');
    return false;
  }

  // 验证连接字符串格式
  const postgresUrlPattern = /^postgresql:\/\/.+/;
  if (!postgresUrlPattern.test(config.connectionString)) {
    console.error('Invalid PostgreSQL connection string format');
    return false;
  }

  return true;
}
