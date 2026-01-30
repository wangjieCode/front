#!/usr/bin/env tsx
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { projects } from '../src/db/schema';
import { resolveStoredPath, BasePathType } from '../src/utils/PathUtils';
import { getGitWorkDir, loadSSHConfig } from '../src/utils/config';
import { LocalExecutor } from '../src/services/LocalExecutor';
import { SSHExecutor } from '../src/services/SSHExecutor';
import { RepositoryService } from '../src/services/RepositoryService';

const args = process.argv.slice(2);
const projectIdArg = args.find(arg => arg.startsWith('--project-id='));
const projectNameArg = args.find(arg => arg.startsWith('--name='));
const nameLikeArg = args.find(arg => arg.startsWith('--name-like='));
const listArg = args.includes('--list');
const envArg = args.find(arg => arg.startsWith('--env='));
const envFileArg = args.find(arg => arg.startsWith('--env-file='));
const dbUrlArg = args.find(arg => arg.startsWith('--db-url='));

const projectId = projectIdArg ? projectIdArg.split('=')[1] : '';
const projectName = projectNameArg ? projectNameArg.split('=')[1] : '';
const nameLike = nameLikeArg ? nameLikeArg.split('=')[1] : '';

if (!projectId && !projectName && !nameLike && !listArg) {
  console.error('❌ 需要提供 --project-id=... 或 --name=... 或 --name-like=... 或 --list');
  process.exit(1);
}

const envName = envArg ? envArg.split('=')[1] : '';
const envFile = envFileArg ? envFileArg.split('=')[1] : (envName ? `.env.${envName}` : (existsSync('.env.production') ? '.env.production' : '.env'));
dotenv.config({ path: envFile });
console.log(`🔧 使用环境文件: ${envFile}`);

const DATABASE_URL = dbUrlArg ? dbUrlArg.split('=')[1] : process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL 未设置');
  process.exit(1);
}

function deriveRepoName(gitRepositoryUrl: string): string {
  const urlParts = gitRepositoryUrl.split('/');
  const lastPart = urlParts[urlParts.length - 1];
  const repoName = lastPart.endsWith('.git') ? lastPart.slice(0, -4) : lastPart;
  return repoName.toLowerCase().replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function resolveWorkDir(project: { workDirectory?: string | null; repoDir?: string | null; gitRepositoryUrl: string }): string {
  const storedPath = project.workDirectory || project.repoDir || '';
  const resolved = resolveStoredPath(storedPath, BasePathType.GIT_WORK_DIR);
  if (resolved) return resolved;
  const baseDir = getGitWorkDir();
  return path.resolve(baseDir, deriveRepoName(project.gitRepositoryUrl));
}

async function main() {
  const client = postgres(DATABASE_URL as string);
  const db = drizzle(client);

  try {
    const runMode = process.env.RUN_MODE || 'local';
    const executor = runMode === 'remote' ? new SSHExecutor() : new LocalExecutor();
    if (runMode === 'remote') {
      const sshConfig = loadSSHConfig();
      await executor.connect(sshConfig);
    }

    if (listArg) {
      const all = await db.select({ id: projects.id, name: projects.name }).from(projects);
      if (all.length === 0) {
        console.log('ℹ️ 未找到任何项目');
      } else {
        console.log('📋 项目列表:');
        all.forEach(p => console.log(`- ${p.name} (${p.id})`));
      }
      return;
    }

    let projectQuery = [];
    if (projectId) {
      projectQuery = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    } else if (projectName) {
      projectQuery = await db.select().from(projects).where(eq(projects.name, projectName)).limit(1);
    } else if (nameLike) {
      const all = await db.select().from(projects);
      projectQuery = all.filter(p => p.name?.toLowerCase().includes(nameLike.toLowerCase())).slice(0, 1);
      if (projectQuery.length === 0) {
        console.log('ℹ️ 模糊匹配未命中，候选列表:');
        all
          .filter(p => p.name?.toLowerCase().includes(nameLike.toLowerCase()))
          .forEach(p => console.log(`- ${p.name} (${p.id})`));
      }
    }

    const project = projectQuery[0];
    if (!project) {
      console.error('❌ 未找到项目');
      process.exit(1);
    }

    const workDir = resolveWorkDir(project);
    if (!workDir || workDir === '/' || workDir === path.parse(workDir).root) {
      console.error(`❌ 工作目录无效: ${workDir}`);
      process.exit(1);
    }

    console.log('🔧 重建项目:');
    console.log(`   项目ID: ${project.id}`);
    console.log(`   项目名称: ${project.name}`);
    console.log(`   仓库地址: ${project.gitRepositoryUrl}`);
    console.log(`   分支: ${project.gitBranch || 'main'}`);
    console.log(`   目录: ${workDir}`);

    if (runMode === 'remote') {
      await executor.executeCommand(`rm -rf "${workDir}"`);
      console.log(`✅ 已删除目录: ${workDir}`);
    } else {
      if (existsSync(workDir)) {
        rmSync(workDir, { recursive: true, force: true });
        console.log(`✅ 已删除目录: ${workDir}`);
      }
    }

    const repositoryService = new RepositoryService(executor);

    const cloneResult = await repositoryService.cloneRepository({
      ...project,
      workDirectory: workDir,
      repoDir: workDir,
    });

    if (!cloneResult.success) {
      console.error(`❌ 重新克隆失败: ${cloneResult.error || cloneResult.message}`);
      process.exit(1);
    }

    console.log('✅ 重新初始化完成');
    if (runMode === 'remote') {
      executor.disconnect();
    }
  } finally {
    await client.end({ timeout: 2 });
  }
}

main().catch(error => {
  console.error('❌ 执行失败:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
