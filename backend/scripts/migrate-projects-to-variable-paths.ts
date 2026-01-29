#!/usr/bin/env tsx
/**
 * Projects 表路径迁移脚本：将现有路径转换为变量占位符格式
 * 
 * 迁移内容：
 * 1. projects 表的 repoDir 字段
 * 2. projects 表的 workDirectory 字段
 * 
 * 迁移格式：
 * - 绝对路径 -> ${GIT_WORK_DIR}/relative/path
 * - 纯相对路径 -> ${GIT_WORK_DIR}/relative/path
 */

import { DatabaseManager } from '../src/db/DatabaseManager';
import { initializeDatabase } from '../src/db/init';
import { projects } from '../src/db/schema';
import { convertToStoredPath, hasPathVariable } from '../src/utils/PathUtils';
import { getGitWorkDir } from '../src/utils/config';
import path from 'path';
import { eq } from 'drizzle-orm';

async function migrateProjectsToVariablePaths() {
  console.log('🚀 开始迁移 projects 表路径到变量占位符格式...\n');

  // 初始化数据库连接
  await initializeDatabase();
  const db = DatabaseManager.getDb();
  const gitWorkDir = getGitWorkDir();
  
  let totalUpdated = 0;
  let skipped = 0;

  // 获取所有项目
  const allProjects = await db.select().from(projects);
  console.log(`📋 找到 ${allProjects.length} 个项目\n`);

  for (const project of allProjects) {
    const updates: any = {};
    let needsUpdate = false;

    console.log(`\n处理项目: ${project.name} (ID: ${project.id})`);

    // 处理 repoDir
    if (project.repoDir && !hasPathVariable(project.repoDir)) {
      console.log(`  当前 repoDir: ${project.repoDir}`);
      
      // 判断是绝对路径还是相对路径
      const absolutePath = path.isAbsolute(project.repoDir)
        ? project.repoDir
        : path.resolve(gitWorkDir, project.repoDir);
      
      const storedPath = convertToStoredPath(absolutePath);
      
      if (storedPath && storedPath !== project.repoDir) {
        updates.repoDir = storedPath;
        needsUpdate = true;
        console.log(`  ✓ 新 repoDir: ${storedPath}`);
      } else {
        console.log(`  - repoDir 无需更新`);
      }
    } else if (hasPathVariable(project.repoDir)) {
      console.log(`  ✓ repoDir 已是变量格式: ${project.repoDir}`);
    }

    // 处理 workDirectory
    if (project.workDirectory && !hasPathVariable(project.workDirectory)) {
      console.log(`  当前 workDirectory: ${project.workDirectory}`);
      
      // 判断是绝对路径还是相对路径
      const absolutePath = path.isAbsolute(project.workDirectory)
        ? project.workDirectory
        : path.resolve(gitWorkDir, project.workDirectory);
      
      const storedPath = convertToStoredPath(absolutePath);
      
      if (storedPath && storedPath !== project.workDirectory) {
        updates.workDirectory = storedPath;
        needsUpdate = true;
        console.log(`  ✓ 新 workDirectory: ${storedPath}`);
      } else {
        console.log(`  - workDirectory 无需更新`);
      }
    } else if (hasPathVariable(project.workDirectory)) {
      console.log(`  ✓ workDirectory 已是变量格式: ${project.workDirectory}`);
    }

    // 执行更新
    if (needsUpdate) {
      await db
        .update(projects)
        .set(updates)
        .where(eq(projects.id, project.id));
      
      totalUpdated++;
      console.log(`  ✅ 项目已更新`);
    } else {
      skipped++;
      console.log(`  ⏭️  项目跳过（无需更新）`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 迁移统计:`);
  console.log(`   总项目数: ${allProjects.length}`);
  console.log(`   已更新: ${totalUpdated}`);
  console.log(`   已跳过: ${skipped}`);
  console.log(`${'='.repeat(60)}\n`);

  console.log('✅ 迁移完成！');
}

// 执行迁移
migrateProjectsToVariablePaths()
  .then(() => {
    console.log('\n🎉 Projects 表路径已成功迁移到变量占位符格式');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 迁移失败:', error);
    process.exit(1);
  });
