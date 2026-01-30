import { SSHExecutor, GitService, CodeToolService, GitLabMCPService, ProjectService, LocalExecutor, NeovateAIService } from './index';
import { WorktreeManager } from './WorktreeManager';
import { ConversationManager } from './ConversationManager';
import { MessageRouter } from './MessageRouter';
import { ConversationAIService } from './ConversationAIService';
import { DrizzleConversationStorage } from '../storage/DrizzleConversationStorage';
import { ConversationStorageAdapter } from '../storage/ConversationStorageAdapter';
import { initializeDatabase } from '../db/init';
import { getGitWorkDir, getGitDefaultBranch, getWorktreeBaseDir, loadSSHConfig } from '../utils/config';

import { RedisManager } from '../db/RedisManager';

let services: {
  conversationManager: any;
  messageRouter: any;
  conversationAIService: any;
  conversationStorage: DrizzleConversationStorage;
  executor: any;
  worktreeManager: WorktreeManager;
  projectService: ProjectService;
  gitlabService: GitLabMCPService;
  gitService: GitService;
  codeToolService: CodeToolService;
  redis: any;
} | null = null;

export async function initializeAllServices() {
  if (services) return services;

  console.log('[INIT] 开始初始化服务...');
  const runMode = process.env.RUN_MODE || 'local';
  const appEnv = process.env.APP_ENV || 'local';
  const workDir = getGitWorkDir();
  console.log(`[INIT] RUN_MODE=${runMode}, APP_ENV=${appEnv}, GIT_WORK_DIR=${workDir}`);
  
  // 1. 初始化数据库
  const dbInitStart = Date.now();
  await initializeDatabase();
  console.log(`[INIT] 数据库初始化完成，耗时 ${Date.now() - dbInitStart}ms`);
  const conversationStorage = new DrizzleConversationStorage();
  
  // 2. 初始化执行器
  let executor: any;
  if (runMode === 'local') {
    executor = new LocalExecutor();
    const { existsSync, mkdirSync } = require('fs');
    if (!existsSync(workDir)) {
      try {
        mkdirSync(workDir, { recursive: true });
      } catch (e: any) {
        console.warn(`⚠️ 无法创建工作目录 ${workDir}: ${e.message}`);
      }
    }
  } else {
    try {
      const sshConfig = loadSSHConfig();
      executor = new SSHExecutor();
      await executor.connect(sshConfig);
    } catch (error) {
      console.error('❌ SSH 初始化/连接失败:', error instanceof Error ? error.message : error);
      executor = new LocalExecutor();
    }
  }

  console.log('[INIT] 执行器初始化完成');
  // 3. 初始化各级服务
  const codeToolService = new CodeToolService(executor);
  const storageAdapter = new ConversationStorageAdapter(conversationStorage);
  const gitService = new GitService(executor, workDir);
  const gitlabService = new GitLabMCPService({
    url: process.env.GITLAB_URL || '',
    token: process.env.GITLAB_TOKEN || '',
  });
  
  const worktreeBaseDir = getWorktreeBaseDir(workDir);
  const worktreeManager = new WorktreeManager(executor, workDir, worktreeBaseDir, 'global-or-default');
  const projectService = new ProjectService(executor);
  
  const conversationManager = new ConversationManager(storageAdapter, projectService, gitlabService, worktreeManager);
  const databaseUrl = process.env.DATABASE_URL || '';
  const neovateAIService = new NeovateAIService(executor, workDir, databaseUrl);
  const conversationAIService = new ConversationAIService(neovateAIService, databaseUrl, gitService, gitlabService);
  const messageRouter = new MessageRouter(conversationManager);

  console.log('[INIT] 对话相关服务初始化完成，准备连接 Redis');
  const redis = RedisManager.getInstance();
  console.log('[INIT] Redis 实例已创建');

  services = {
    conversationManager,
    messageRouter,
    conversationAIService,
    conversationStorage,
    executor,
    worktreeManager,
    projectService,
    gitlabService,
    gitService,
    codeToolService,
    redis
  };

  return services;
}

export function getServices() {
  if (!services) {
    throw new Error('Services not initialized. Call initializeAllServices() first.');
  }
  return services;
}
