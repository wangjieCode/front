/**
 * Supabase 数据库设置脚本
 * 
 * 使用步骤：
 * 1. 访问 Supabase Dashboard: https://supabase.com/dashboard
 * 2. 选择你的项目: pemhklrpojvctogksabk
 * 3. 进入 Project Settings > Database
 * 4. 找到 Connection String > URI
 * 5. 复制连接字符串并更新 .env 文件中的 DATABASE_URL
 * 
 * 连接字符串格式：
 * postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

async function setupDatabase() {
  console.log('🚀 Supabase 数据库设置向导\n');

  // 检查环境变量
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ 错误：SUPABASE_URL 或 SUPABASE_ANON_KEY 未设置');
    console.log('\n请在 .env 文件中设置以下变量：');
    console.log('SUPABASE_URL=https://pemhklrpojvctogksabk.supabase.co');
    console.log('SUPABASE_ANON_KEY=your-anon-key');
    process.exit(1);
  }

  console.log('✓ Supabase URL:', SUPABASE_URL);
  console.log('✓ Supabase Anon Key: ***' + SUPABASE_ANON_KEY.slice(-10));

  // 读取 SQL 迁移文件
  const migrationPath = path.join(__dirname, '../drizzle/0000_classy_colonel_america.sql');
  
  if (!fs.existsSync(migrationPath)) {
    console.error('\n❌ 错误：找不到迁移文件');
    console.log('请先运行: pnpm db:generate');
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
  
  console.log('\n📋 准备执行以下操作：');
  console.log('1. 创建 conversations 表');
  console.log('2. 创建 conversation_contexts 表');
  console.log('3. 创建 branches 表');
  console.log('4. 创建 messages 表');
  console.log('5. 创建 message_metadata 表');
  console.log('6. 创建所有索引');

  console.log('\n⚠️  注意：你需要使用 Supabase SQL Editor 来执行迁移');
  console.log('\n步骤：');
  console.log('1. 访问: https://supabase.com/dashboard/project/pemhklrpojvctogksabk/sql/new');
  console.log('2. 复制以下 SQL 内容到 SQL Editor');
  console.log('3. 点击 "Run" 执行');
  console.log('\n' + '='.repeat(80));
  console.log(migrationSQL);
  console.log('='.repeat(80));

  console.log('\n📝 下一步：');
  console.log('1. 执行完 SQL 后，获取数据库连接字符串');
  console.log('2. 访问: Project Settings > Database > Connection String');
  console.log('3. 选择 "URI" 模式');
  console.log('4. 复制连接字符串');
  console.log('5. 更新 .env 文件中的 DATABASE_URL');
  console.log('\n示例：');
  console.log('DATABASE_URL=postgresql://postgres.pemhklrpojvctogksabk:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres');
}

setupDatabase().catch(console.error);
