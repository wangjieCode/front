/**
 * 数据库迁移脚本：添加对话模式支持
 * 
 * 运行方式：
 * pnpm tsx backend/scripts/migrate-conversation-mode.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL 环境变量未设置');
    process.exit(1);
  }

  console.log('🔄 开始数据库迁移：添加对话模式支持...\n');

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    // 读取迁移 SQL 文件
    const migrationPath = path.join(__dirname, '../drizzle/0001_add_conversation_mode.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 读取迁移文件:', migrationPath);

    // 执行迁移
    console.log('⚙️  执行迁移 SQL...\n');
    await pool.query(migrationSQL);

    console.log('✅ 迁移成功完成！\n');
    console.log('📊 已添加的字段：');
    console.log('   - conversation_contexts.mode (varchar)');
    console.log('   - conversation_contexts.context_git_branch (varchar)');
    console.log('   - conversation_contexts.mr_url (text)');
    console.log('   - message_metadata.git_branch (varchar)');
    console.log('   - message_metadata.mr_url (text)');
    console.log('   - message_metadata.operation_denied (jsonb)');
    console.log('\n📌 已创建索引：');
    console.log('   - idx_contexts_mode');

    // 验证迁移
    console.log('\n🔍 验证迁移结果...');
    const result = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'conversation_contexts'
      AND column_name IN ('mode', 'context_git_branch', 'mr_url')
      ORDER BY column_name;
    `);

    console.log('\n✅ conversation_contexts 表新增字段：');
    result.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (默认值: ${row.column_default || 'NULL'})`);
    });

    const metadataResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'message_metadata'
      AND column_name IN ('git_branch', 'mr_url', 'operation_denied')
      ORDER BY column_name;
    `);

    console.log('\n✅ message_metadata 表新增字段：');
    metadataResult.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });

    // 检查现有数据
    const countResult = await pool.query(`
      SELECT COUNT(*) as count FROM conversation_contexts;
    `);

    const count = parseInt(countResult.rows[0].count);
    console.log(`\n📈 现有对话会话数量: ${count}`);
    if (count > 0) {
      console.log('   所有现有会话已自动设置为编辑模式 (mode = "edit")');
    }

  } catch (error) {
    console.error('\n❌ 迁移失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 运行迁移
runMigration().catch(error => {
  console.error('❌ 迁移脚本执行失败:', error);
  process.exit(1);
});
