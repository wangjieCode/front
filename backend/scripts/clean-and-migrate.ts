/**
 * 清理旧数据并应用新的 schema
 * 
 * 运行方式：
 * pnpm tsx backend/scripts/clean-and-migrate.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

async function cleanAndMigrate() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL 环境变量未设置');
    process.exit(1);
  }

  console.log('🔄 开始清理旧数据并应用新 schema...\n');

  const client = postgres(databaseUrl);
  const db = drizzle(client);

  try {
    // 1. 删除所有表（按依赖顺序）
    console.log('🗑️  删除旧表...');
    
    await client`DROP TABLE IF EXISTS message_metadata CASCADE`;
    console.log('   ✓ 删除 message_metadata');
    
    await client`DROP TABLE IF EXISTS messages CASCADE`;
    console.log('   ✓ 删除 messages');
    
    await client`DROP TABLE IF EXISTS branches CASCADE`;
    console.log('   ✓ 删除 branches');
    
    await client`DROP TABLE IF EXISTS neovate_sessions CASCADE`;
    console.log('   ✓ 删除 neovate_sessions');
    
    await client`DROP TABLE IF EXISTS conversation_contexts CASCADE`;
    console.log('   ✓ 删除 conversation_contexts');
    
    await client`DROP TABLE IF EXISTS conversations CASCADE`;
    console.log('   ✓ 删除 conversations');

    console.log('\n✅ 旧表已删除\n');

    // 2. 重新创建表
    console.log('📦 创建新表...\n');

    // conversations 表
    await client`
      CREATE TABLE conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(255) NOT NULL UNIQUE,
        task_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        error TEXT
      )
    `;
    console.log('   ✓ 创建 conversations');

    // 创建索引
    await client`CREATE INDEX idx_conversations_session_id ON conversations(session_id)`;
    await client`CREATE INDEX idx_conversations_task_id ON conversations(task_id)`;
    await client`CREATE INDEX idx_conversations_status ON conversations(status)`;
    await client`CREATE INDEX idx_conversations_created_at ON conversations(created_at)`;

    // conversation_contexts 表（包含新字段）
    await client`
      CREATE TABLE conversation_contexts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL,
        work_dir TEXT NOT NULL,
        git_branch VARCHAR(255),
        relevant_files JSONB,
        task_description TEXT NOT NULL,
        current_branch_id UUID NOT NULL,
        variables JSONB DEFAULT '{}',
        mode VARCHAR(50) NOT NULL DEFAULT 'edit',
        context_git_branch VARCHAR(255),
        mr_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('   ✓ 创建 conversation_contexts (包含 mode, context_git_branch, mr_url)');

    // 创建索引
    await client`CREATE INDEX idx_contexts_conversation_id ON conversation_contexts(conversation_id)`;
    await client`CREATE INDEX unique_contexts_conversation_id ON conversation_contexts(conversation_id)`;
    await client`CREATE INDEX idx_contexts_mode ON conversation_contexts(mode)`;

    // branches 表
    await client`
      CREATE TABLE branches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        parent_message_id UUID,
        is_active BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('   ✓ 创建 branches');

    // 创建索引
    await client`CREATE INDEX idx_branches_conversation_id ON branches(conversation_id)`;
    await client`CREATE INDEX idx_branches_parent_message_id ON branches(parent_message_id)`;
    await client`CREATE INDEX idx_branches_is_active ON branches(is_active)`;

    // messages 表
    await client`
      CREATE TABLE messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL,
        branch_id UUID NOT NULL,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        is_complete BOOLEAN NOT NULL DEFAULT true,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        parent_message_id UUID
      )
    `;
    console.log('   ✓ 创建 messages');

    // 创建索引
    await client`CREATE INDEX idx_messages_conversation_id ON messages(conversation_id)`;
    await client`CREATE INDEX idx_messages_branch_id ON messages(branch_id)`;
    await client`CREATE INDEX idx_messages_timestamp ON messages(timestamp)`;
    await client`CREATE INDEX idx_messages_parent_message_id ON messages(parent_message_id)`;

    // neovate_sessions 表
    await client`
      CREATE TABLE neovate_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL,
        neovate_session_id VARCHAR(255) NOT NULL,
        work_dir TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_neovate_conversation 
          FOREIGN KEY (conversation_id) 
          REFERENCES conversations(id) 
          ON DELETE CASCADE
      )
    `;
    console.log('   ✓ 创建 neovate_sessions');

    // 创建索引
    await client`CREATE INDEX idx_neovate_sessions_conversation_id ON neovate_sessions(conversation_id)`;
    await client`CREATE UNIQUE INDEX unique_neovate_sessions_conversation_id ON neovate_sessions(conversation_id)`;
    await client`CREATE INDEX idx_neovate_sessions_neovate_session_id ON neovate_sessions(neovate_session_id)`;

    // message_metadata 表（包含新字段）
    await client`
      CREATE TABLE message_metadata (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL,
        tool_calls JSONB,
        code_changes JSONB,
        thinking TEXT,
        is_question BOOLEAN DEFAULT false,
        question_options JSONB,
        requires_response BOOLEAN DEFAULT false,
        message_references JSONB,
        is_invalid BOOLEAN DEFAULT false,
        git_branch VARCHAR(255),
        mr_url TEXT,
        operation_denied JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    console.log('   ✓ 创建 message_metadata (包含 git_branch, mr_url, operation_denied)');

    // 创建索引
    await client`CREATE INDEX idx_metadata_message_id ON message_metadata(message_id)`;
    await client`CREATE INDEX unique_metadata_message_id ON message_metadata(message_id)`;
    await client`CREATE INDEX idx_metadata_is_question ON message_metadata(is_question)`;
    await client`CREATE INDEX idx_metadata_requires_response ON message_metadata(requires_response)`;

    console.log('\n✅ 所有表已创建成功！\n');

    // 3. 验证表结构
    console.log('🔍 验证表结构...\n');

    const contextsColumns = await client`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'conversation_contexts'
      ORDER BY ordinal_position
    `;

    console.log('📋 conversation_contexts 表字段：');
    contextsColumns.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

    const metadataColumns = await client`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'message_metadata'
      ORDER BY ordinal_position
    `;

    console.log('\n📋 message_metadata 表字段：');
    metadataColumns.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

    console.log('\n✅ 数据库清理和迁移完成！');
    console.log('\n💡 提示：');
    console.log('   - 所有旧数据已被清除');
    console.log('   - 新的 schema 已应用');
    console.log('   - 现在可以创建新的对话会话了');

  } catch (error) {
    console.error('\n❌ 操作失败:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// 运行清理和迁移
cleanAndMigrate().catch(error => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
