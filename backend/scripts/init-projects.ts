#!/usr/bin/env ts-node
/**
 * 项目初始化脚本
 * 
 * 功能：
 * 1. 从环境变量加载所有项目配置
 * 2. 自动克隆 Git 仓库（如果不存在）
 * 3. 创建 Worktree 基础目录
 * 4. 同步项目信息到数据库
 * 
 * 使用方法：
 * ts-node scripts/init-projects.ts
 * 或
 * npm run init:projects
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectConfigLoader } from '../src/services/ProjectConfigLoader';
import { ProjectService } from '../src/services/ProjectService';
import { LocalExecutor } from '../src/services/LocalExecutor';
import { DatabaseManager } from '../src/db/DatabaseManager';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Git 仓库管理器
 */
class GitRepoManager {
  private executor: LocalExecutor;

  constructor() {
    this.executor = new LocalExecutor();
  }

  /**
   * 检查目录是否是 Git 仓库
   */
  async isGitRepo(dir: string): Promise<boolean> {
    if (!fs.existsSync(dir)) {
      return false;
    }

    const result = await this.executor.executeCommand(
      `cd "${dir}" && git rev-parse --is-inside-work-tree 2>/dev/null`
    );
    return result.exitCode === 0 && result.stdout.trim() === 'true';
  }

  /**
   * 克隆 Git 仓库
   */
  async cloneRepo(
    gitlabUrl: string,
    gitlabToken: string,
    gitlabProjectId: string,
    targetDir: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 确保父目录存在
      const parentDir = path.dirname(targetDir);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // 构建带 Token 的 Git URL
      const baseUrl = gitlabUrl.replace(/^https?:\/\//, '');
      const gitUrl = `https://oauth2:${gitlabToken}@${baseUrl}/api/v4/projects/${gitlabProjectId}/repository/clone.git`;

      console.log(`  ⏳ 克隆仓库到 ${targetDir}...`);
      const result = await this.executor.executeCommand(
        `git clone "${gitUrl}" "${targetDir}"`
      );

      if (result.exitCode !== 0) {
        return {
          success: false,
          message: `克隆失败: ${result.stderr}`,
        };
      }

      return {
        success: true,
        message: '克隆成功',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 拉取最新代码
   */
  async pullLatest(dir: string, branch: string = 'main'): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`  ⏳ 拉取最新代码...`);
      
      // 先检出目标分支
      await this.executor.executeCommand(`cd "${dir}" && git checkout ${branch}`);
      
      // 拉取最新代码
      const result = await this.executor.executeCommand(`cd "${dir}" && git pull origin ${branch}`);

      if (result.exitCode !== 0) {
        return {
          success: false,
          message: `拉取失败: ${result.stderr}`,
        };
      }

      return {
        success: true,
        message: '拉取成功',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * 主初始化函数
 */
async function initializeProjects() {
  console.log('===========================================');
  console.log('🚀 开始初始化项目');
  console.log('===========================================\n');

  try {
    // 初始化数据库连接
    console.log('📊 初始化数据库连接...');
    await DatabaseManager.getInstance().initialize();
    console.log('✅ 数据库连接成功\n');

    // 加载所有项目配置
    console.log('📋 扫描项目配置...');
    const projectKeys = ProjectConfigLoader.getAllProjectKeys();
    console.log(`✅ 找到 ${projectKeys.length} 个项目: ${projectKeys.join(', ')}\n`);

    if (projectKeys.length === 0) {
      console.log('⚠️  未找到项目配置，请检查环境变量');
      console.log('   配置格式：PROJECT_{KEY}_GITLAB_URL 等');
      process.exit(1);
    }

    const projectService = new ProjectService();
    const gitManager = new GitRepoManager();

    // 处理每个项目
    for (const projectKey of projectKeys) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📦 处理项目: ${projectKey}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      try {
        // 加载项目配置
        const config = ProjectConfigLoader.loadConfig(projectKey);
        console.log(`  ✅ 配置加载成功`);
        console.log(`     - Git URL: ${config.gitlabUrl}`);
        console.log(`     - 仓库目录: ${config.repoDir}`);
        console.log(`     - Worktree 目录: ${config.worktreeBaseDir}`);

        // 1. 处理 Git 仓库
        const isRepo = await gitManager.isGitRepo(config.repoDir);
        if (isRepo) {
          console.log(`  ℹ️  仓库已存在，拉取最新代码...`);
          const pullResult = await gitManager.pullLatest(config.repoDir, config.gitDefaultBranch);
          if (pullResult.success) {
            console.log(`  ✅ ${pullResult.message}`);
          } else {
            console.log(`  ⚠️  ${pullResult.message}`);
          }
        } else {
          console.log(`  ℹ️  仓库不存在，开始克隆...`);
          const cloneResult = await gitManager.cloneRepo(
            config.gitlabUrl,
            config.gitlabToken,
            config.gitlabProjectId,
            config.repoDir
          );
          if (cloneResult.success) {
            console.log(`  ✅ ${cloneResult.message}`);
          } else {
            console.log(`  ❌ ${cloneResult.message}`);
            continue; // 跳过此项目
          }
        }

        // 2. 创建 Worktree 基础目录
        console.log(`  ⏳ 创建 Worktree 基础目录...`);
        if (!fs.existsSync(config.worktreeBaseDir)) {
          fs.mkdirSync(config.worktreeBaseDir, { recursive: true });
          console.log(`  ✅ Worktree 目录已创建: ${config.worktreeBaseDir}`);
        } else {
          console.log(`  ℹ️  Worktree 目录已存在: ${config.worktreeBaseDir}`);
        }

        // 3. 同步到数据库
        console.log(`  ⏳ 同步到数据库...`);
        await projectService.syncProjectFromConfig(config);
        console.log(`  ✅ 项目信息已同步到数据库`);

        console.log(`\n✅ 项目 ${projectKey} 初始化完成`);
      } catch (error) {
        console.error(`\n❌ 项目 ${projectKey} 初始化失败:`, error instanceof Error ? error.message : error);
      }
    }

    console.log('\n===========================================');
    console.log('🎉 所有项目初始化完成');
    console.log('===========================================\n');

    // 显示项目列表
    const allProjects = await projectService.getAllProjects();
    console.log('📋 数据库中的项目列表：');
    for (const project of allProjects) {
      console.log(`   - ${project.projectName} (${project.projectKey})`);
      console.log(`     状态: ${project.isActive ? '✅ 激活' : '❌ 未激活'}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ 初始化失败:', error);
    process.exit(1);
  }
}

// 执行初始化
initializeProjects().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});
