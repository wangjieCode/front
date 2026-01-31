#!/usr/bin/env tsx
/**
 * 项目初始化脚本
 * 从数据库读取项目配置，在指定目录下初始化项目
 */

import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { projects } from '../src/db/schema';
import { sql } from 'drizzle-orm';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { convertToStoredPath, resolveStoredPath } from '../src/utils/PathUtils';

// 解析命令行参数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldUpdateDb = !args.includes('--no-update-db');
const baseDirArg = args.find(arg => arg.startsWith('--base-dir='));
const baseDir = baseDirArg ? baseDirArg.split('=')[1] : null;
const shouldPull = args.includes('--pull');

// 加载环境变量
if (existsSync('.env.production')) {
  dotenv.config({ path: '.env.production' });
} else {
  dotenv.config(); // 默认加载 .env
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL 未设置');
  process.exit(1);
}

// 获取运行环境的工作空间根目录
const rawWorkDir = process.env.LOCAL_GIT_WORK_DIR || '../front-workspace';
const DEFAULT_WORKSPACE = path.isAbsolute(rawWorkDir) ? rawWorkDir : path.resolve(process.cwd(), rawWorkDir);

const WORKSPACE_ROOT = baseDir || DEFAULT_WORKSPACE;

console.log('🔧 配置信息:');
console.log(`   工作空间根目录: ${WORKSPACE_ROOT}`);
console.log(`   Dry Run: ${isDryRun ? '是' : '否'}`);
console.log(`   更新数据库: ${shouldUpdateDb ? '是' : '否'}`);
console.log('');

/**
 * 解析路径
 */
function resolvePath(targetPath: string): string {
  if (!targetPath) return '';
  return resolveStoredPath(targetPath);
}

/**
 * 执行命令
 */
function executeCommand(command: string, cwd?: string): string {
  if (isDryRun) {
    console.log(`   [DRY RUN] 将执行: ${command}`);
    return '';
  }
  
  try {
    return execSync(command, { 
      cwd, 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (error: any) {
    throw new Error(`命令执行失败: ${error.message}`);
  }
}

/**
 * 初始化单个项目
 */
async function initializeProject(project: any): Promise<{
  success: boolean;
  mappedDir: string;
  error?: string;
}> {
  console.log(`\n📦 处理项目: ${project.name}`);
  console.log(`   ID: ${project.id}`);
  
  // 解析路径
  const mappedDir = resolvePath(project.repoDir || project.workDirectory);
  
  console.log(`   原始仓库路径: ${project.repoDir || project.workDirectory}`);
  console.log(`   映射仓库路径: ${mappedDir}`);
  
  try {
    // 检查仓库目录
    if (existsSync(mappedDir)) {
      console.log(`   ✓ 仓库目录已存在`);
      
      // 验证是否是有效的 Git 仓库
      if (existsSync(path.join(mappedDir, '.git'))) {
        console.log(`   ✓ 有效的 Git 仓库`);
      } else {
        console.log(`   ⚠️  目录存在但不是有效的 Git 仓库`);
      }
    } else {
      console.log(`   ❌ 仓库目录不存在`);
      return {
        success: false,
        mappedDir,
        error: '仓库目录不在当前工作空间内，请手动克隆或确认配置',
      };
    }
    
    // 创建 Worktree 基础目录 (按约定是在项目目录同级的 worktrees 目录)
    const worktreeBaseDir = path.resolve(mappedDir, '..', '..', 'worktrees');
    if (!existsSync(worktreeBaseDir) && !isDryRun) {
      mkdirSync(worktreeBaseDir, { recursive: true });
      console.log(`   📁 创建 Worktree 基础目录: ${worktreeBaseDir}`);
    }
    
    console.log(`   ✅ 项目检查成功`);
    return {
      success: true,
      mappedDir,
    };
  } catch (error: any) {
    console.error(`   ❌ 检查失败: ${error.message}`);
    return {
      success: false,
      mappedDir,
      error: error.message,
    };
  }
}

// 已移除 cloneRepository 逻辑，现在由运维或开发人员手动管理仓库

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始初始化项目...\n');
  
  // 修正 DATABASE_URL 校验，允许空字符串但报错
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL 未设置');
    process.exit(1);
  }

  const client = postgres(DATABASE_URL as string);
  const db = drizzle(client);

  try {
    // 查询所有项目
    const allProjects = await db.select().from(projects);
    console.log(`📊 找到 ${allProjects.length} 个项目\n`);

    const results = [];
    
    for (const project of allProjects) {
      const result = await initializeProject(project);
      results.push({ project, result });
      
      // 更新数据库
      if (result.success && shouldUpdateDb && !isDryRun) {
        const needsUpdate = result.mappedDir !== project.repoDir || result.mappedDir !== project.workDirectory;
        
        if (needsUpdate) {
          console.log(`   💾 更新数据库路径...`);
          
          const relativeRepoDir = convertToStoredPath(result.mappedDir) || result.mappedDir;
          
          await db
            .update(projects)
            .set({
              repoDir: relativeRepoDir,
              workDirectory: relativeRepoDir,
            })
            .where(sql`${projects.id} = ${project.id}`);
          
          console.log(`   ✅ 数据库已更新`);
        }
      }
    }
    
    // 汇总结果
    console.log('\n' + '='.repeat(60));
    console.log('📊 初始化汇总:');
    console.log('='.repeat(60));
    
    const successCount = results.filter(r => r.result.success).length;
    const failCount = results.filter(r => !r.result.success).length;
    
    console.log(`✅ 成功: ${successCount}`);
    console.log(`❌ 失败: ${failCount}`);
    
    if (failCount > 0) {
      console.log('\n失败的项目:');
      results
        .filter(r => !r.result.success)
        .forEach(({ project, result }) => {
          console.log(`  - ${project.name}: ${result.error}`);
        });
    }
    
    if (isDryRun) {
      console.log('\n⚠️  这是 DRY RUN 模式，未实际执行任何操作');
    }
    
    console.log('\n✅ 初始化完成');
  } catch (error) {
    console.error('\n❌ 初始化失败:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
