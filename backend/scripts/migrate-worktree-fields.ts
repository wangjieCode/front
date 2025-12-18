import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL 未配置');
  process.exit(1);
}

async function migrate() {
  const sql = postgres(databaseUrl);

  try {
    console.log('🔄 开始迁移...');

    // 添加 users 表的 worktree_path 字段
    console.log('📝 添加 users.worktree_path 字段...');
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS worktree_path text
    `;
    console.log('✅ users.worktree_path 字段已添加');

    // 添加 conversation_contexts 表的 worktree_path 字段
    console.log('📝 添加 conversation_contexts.worktree_path 字段...');
    await sql`
      ALTER TABLE conversation_contexts 
      ADD COLUMN IF NOT EXISTS worktree_path text
    `;
    console.log('✅ conversation_contexts.worktree_path 字段已添加');

    console.log('🎉 迁移完成！');
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
