#!/usr/bin/env tsx
/**
 * 数据库路径迁移脚本：将现有路径转换为变量占位符格式
 * 
 * 迁移内容：
 * 1. conversation_contexts 表的 workDir 和 worktreePath 字段
 * 2. neovate_sessions 表的 workDir 字段
 * 
 * 迁移格式：
 * - 绝对路径 -> ${WORKTREE_BASE_DIR}/relative/path 或 ${GIT_WORK_DIR}/relative/path
 * - 相对路径 -> ${WORKTREE_BASE_DIR}/relative/path 或 ${GIT_WORK_DIR}/relative/path
 */

import { DatabaseManager } from '../src/db/DatabaseManager';
import { initializeDatabase } from '../src/db/init';
import { conversationContexts, neovateSessions } from '../src/db/schema';
import { convertToStoredPath, hasPathVariable } from '../src/utils/PathUtils';
import path from 'path';

async function migrateToVariablePaths() {
  console.log('🚀 开始迁移路径到变量占位符格式...\n');

  // 初始化数据库连接
  await initializeDatabase();
  const db = DatabaseManager.getDb();
  
  let totalUpdated = 0;
  let skipped = 0;

  // ==================== 迁移 conversation_contexts 表 ====================
  console.log('📋 迁移 conversation_contexts 表...');
  
  const contexts = await db.select().from(conversationContexts);
  console.log(`   找到 ${contexts.length} 条记录`);

  for (const context of contexts) {
    const updates: any = {};
    let needsUpdate = false;

    // 处理 workDir
    if (context.workDir && !hasPathVariable(context.workDir)) {
      const absolutePath = path.isAbsolute(context.workDir) 
        ? context.workDir 
        : path.resolve(process.env.LOCAL_GIT_WORK_DIR || '', context.workDir);
      
      const storedPath = convertToStoredPath(absolutePath);
      if (storedPath && storedPath !== context.workDir) {
        updates.workDir = storedPath;
        needsUpdate = true;
        console.log(`   ✓ workDir: ${context.workDir} -> ${storedPath}`);
      }
    }

    // 处理 worktreePath
    if (context.worktreePath && !hasPathVariable(context.worktreePath)) {
      const absolutePath = path.isAbsolute(context.worktreePath)
        ? context.worktreePath
        : path.resolve(process.env.WORKTREE_BASE_DIR || '', context.worktreePath);
      
      const storedPath = convertToStoredPath(absolutePath);
      if (storedPath && storedPath !== context.worktreePath) {
        updates.worktreePath = storedPath;
        needsUpdate = true;
        console.log(`   ✓ worktreePath: ${context.worktreePath} -> ${storedPath}`);
      }
    }

    if (needsUpdate) {
      await db
        .update(conversationContexts)
        .set(updates)
        .where(eq(conversationContexts.id, context.id));
      totalUpdated++;
    } else {
      skipped++;
    }
  }

  console.log(`   完成：更新 ${totalUpdated} 条，跳过 ${skipped} 条\n`);

  // ==================== 迁移 neovate_sessions 表 ====================
  console.log('📋 迁移 neovate_sessions 表...');
  
  totalUpdated = 0;
  skipped = 0;

  const sessions = await db.select().from(neovateSessions);
  console.log(`   找到 ${sessions.length} 条记录`);

  for (const session of sessions) {
    if (session.workDir && !hasPathVariable(session.workDir)) {
      const absolutePath = path.isAbsolute(session.workDir)
        ? session.workDir
        : path.resolve(process.env.LOCAL_GIT_WORK_DIR || '', session.workDir);
      
      const storedPath = convertToStoredPath(absolutePath);
      
      if (storedPath && storedPath !== session.workDir) {
        await db
          .update(neovateSessions)
          .set({ workDir: storedPath })
          .where(eq(neovateSessions.id, session.id));
        
        console.log(`   ✓ workDir: ${session.workDir} -> ${storedPath}`);
        totalUpdated++;
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  console.log(`   完成：更新 ${totalUpdated} 条，跳过 ${skipped} 条\n`);

  console.log('✅ 迁移完成！');
}

// 导入 eq 函数
import { eq } from 'drizzle-orm';

// 执行迁移
migrateToVariablePaths()
  .then(() => {
    console.log('\n🎉 所有路径已成功迁移到变量占位符格式');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 迁移失败:', error);
    process.exit(1);
  });
