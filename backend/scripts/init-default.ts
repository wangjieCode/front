#!/usr/bin/env tsx

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { containerQuota } from '../src/db/schema';
import { eq } from 'drizzle-orm';

/**
 * 默认配置初始化脚本
 * 创建默认容器配额等系统配置
 */

async function initDefault() {
  console.log('🔧 开始初始化默认配置...\n');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL 环境变量未设置');
    process.exit(1);
  }

  const client = postgres(databaseUrl);
  const db = drizzle(client);

  try {
    // 1. 创建全局容器配额
    console.log('📦 创建全局容器配额配置...');
    const globalMaxContainers = parseInt(process.env.GLOBAL_MAX_CONTAINERS || '50');
    
    const existingGlobal = await db
      .select()
      .from(containerQuota)
      .where(eq(containerQuota.quotaType, 'global'))
      .limit(1);

    if (existingGlobal.length === 0) {
      await db.insert(containerQuota).values({
        quotaType: 'global',
        maxContainers: globalMaxContainers,
        currentContainers: 0,
        referenceId: null,
      });
      console.log(`✅ 全局容器配额已创建: ${globalMaxContainers}\n`);
    } else {
      console.log(`ℹ️  全局容器配额已存在，跳过\n`);
    }

    console.log('✅ 默认配置初始化完成！\n');
    console.log('📝 提示：');
    console.log('   - 请使用 SQL 或管理界面创建用户');
    console.log('   - 使用 `pnpm run hash-password` 生成密码哈希');
    console.log('   - 创建项目后会自动为创建者分配权限\n');

  } catch (error) {
    console.error('❌ 初始化失败:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initDefault();
