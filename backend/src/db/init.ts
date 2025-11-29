import { DatabaseManager } from './DatabaseManager';
import { loadDatabaseConfig, validateDatabaseConfig } from '../config/database';

/**
 * 初始化数据库连接
 * @returns 初始化是否成功
 */
export async function initializeDatabase(): Promise<boolean> {
  try {
    console.log('Initializing database connection...');

    // 加载配置
    const config = loadDatabaseConfig();

    // 验证配置
    if (!validateDatabaseConfig(config)) {
      throw new Error('Invalid database configuration');
    }

    // 初始化数据库管理器
    DatabaseManager.initialize(config);

    // 测试连接
    const isConnected = await DatabaseManager.testConnection();

    if (!isConnected) {
      throw new Error('Database connection test failed');
    }

    console.log('Database initialized and connected successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    return false;
  }
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
  try {
    await DatabaseManager.close();
  } catch (error) {
    console.error('Error closing database:', error);
  }
}

// 如果直接运行此文件，执行初始化测试
if (require.main === module) {
  (async () => {
    const success = await initializeDatabase();
    if (success) {
      console.log('✓ Database initialization test passed');
      await closeDatabase();
      process.exit(0);
    } else {
      console.error('✗ Database initialization test failed');
      process.exit(1);
    }
  })();
}
