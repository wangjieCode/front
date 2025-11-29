#!/usr/bin/env tsx
/**
 * 清空数据库脚本
 * 删除所有对话相关的数据
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';
import { 
  conversations, 
  conversationContexts, 
  branches, 
  messages, 
  messageMetadata,
  neovateSessions 
} from '../src/db/schema';

// 加载环境变量
dotenv.config();

async function clearDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL 环境变量未设置');
    process.exit(1);
  }

  console.log('🗑️  准备清空数据库...');
  console.log('📍 数据库:', databaseUrl.replace(/:[^:@]+@/, ':****@'));

  // 创建数据库连接
  const client = postgres(databaseUrl);
  const db = drizzle(client);

  try {
    console.log('\n⚠️  警告：此操作将删除所有数据！');
    console.log('按 Ctrl+C 取消，或等待 5 秒后自动继续...\n');

    // 等待 5 秒
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('🔄 开始清空数据库...\n');

    // 按照依赖关系的逆序删除（先删除子表，再删除父表）
    
    // 1. 删除消息元数据
    console.log('1️⃣  删除消息元数据...');
    const deletedMetadata = await db.delete(messageMetadata);
    console.log(`   ✅ 已删除 message_metadata 表的所有数据`);

    // 2. 删除消息
    console.log('2️⃣  删除消息...');
    const deletedMessages = await db.delete(messages);
    console.log(`   ✅ 已删除 messages 表的所有数据`);

    // 3. 删除分支
    console.log('3️⃣  删除分支...');
    const deletedBranches = await db.delete(branches);
    console.log(`   ✅ 已删除 branches 表的所有数据`);

    // 4. 删除 Neovate 会话
    console.log('4️⃣  删除 Neovate 会话...');
    const deletedNeovateSessions = await db.delete(neovateSessions);
    console.log(`   ✅ 已删除 neovate_sessions 表的所有数据`);

    // 5. 删除对话上下文
    console.log('5️⃣  删除对话上下文...');
    const deletedContexts = await db.delete(conversationContexts);
    console.log(`   ✅ 已删除 conversation_contexts 表的所有数据`);

    // 6. 删除对话
    console.log('6️⃣  删除对话...');
    const deletedConversations = await db.delete(conversations);
    console.log(`   ✅ 已删除 conversations 表的所有数据`);

    console.log('\n✅ 数据库清空完成！');
    console.log('\n📊 清空统计:');
    console.log(`   - 对话: 已清空`);
    console.log(`   - 上下文: 已清空`);
    console.log(`   - 分支: 已清空`);
    console.log(`   - 消息: 已清空`);
    console.log(`   - 元数据: 已清空`);
    console.log(`   - Neovate 会话: 已清空`);

  } catch (error) {
    console.error('\n❌ 清空数据库失败:', error);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await client.end();
  }
}

// 执行清空
clearDatabase().catch((error) => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
