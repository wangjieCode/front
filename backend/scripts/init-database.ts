#!/usr/bin/env tsx

/**
 * 初始化数据库表结构
 */

import { DatabaseManager } from '../src/db/DatabaseManager';
import { readFileSync } from 'fs';
import { join } from 'path';

async function initDatabase() {
  console.log('🔧 初始化数据库表结构...\n');

  try {
    // 1. 连接数据库
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL 环境变量未设置');
    }

    DatabaseManager.initialize({ connectionString: databaseUrl });
    console.log('✅ 数据库连接成功');

    // 2. 读取并执行迁移 SQL
    const migrationPath = join(__dirname, '../drizzle/0002_add_users_projects_tables.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    console.log('📄 执行数据库迁移...');
    
    // 使用原始 SQL 客户端执行迁移
    const client = DatabaseManager.getClient();
    await client.unsafe(migrationSQL);
    
    console.log('✅ 数据库迁移执行成功');

    // 3. 验证表是否创建成功
    console.log('\n🔍 验证表结构...');
    
    const tables = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'projects', 'conversations')
      ORDER BY table_name
    `;
    
    console.log('已创建的表:');
    tables.forEach((table: any) => {
      console.log(`  ✅ ${table.table_name}`);
    });

    // 4. 检查默认数据
    const userCount = await client`SELECT COUNT(*) as count FROM users`;
    const projectCount = await client`SELECT COUNT(*) as count FROM projects`;
    
    console.log(`\n📊 数据统计:`);
    console.log(`  用户数量: ${userCount[0].count}`);
    console.log(`  项目数量: ${projectCount[0].count}`);

    console.log('\n🎉 数据库初始化完成！');

  } catch (error) {
    console.error('\n❌ 数据库初始化失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await DatabaseManager.close();
  }
}

// 运行初始化
if (require.main === module) {
  require('dotenv').config();
  initDatabase().catch(console.error);
}

export { initDatabase };