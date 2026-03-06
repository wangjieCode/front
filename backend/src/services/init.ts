import { GitService, CodeToolService, GitLabMCPService, ProjectService, LocalExecutor, NeovateAIService, ModelAvailabilityService } from './index';
import { WorktreeManager } from './WorktreeManager';
import { ConversationManager } from './ConversationManager';
import { BranchCacheService } from './BranchCacheService';
import { ConversationAIService } from './ConversationAIService';
import { DrizzleConversationStorage } from '../storage/DrizzleConversationStorage';
import { ConversationStorageAdapter } from '../storage/ConversationStorageAdapter';
import { initializeDatabase } from '../db/init';
import { getGitWorkDir, getWorktreeBaseDir } from '../utils/config';

let services: {
  conversationManager: any;
  branchCacheService: BranchCacheService;
  conversationAIService: any;
  conversationStorage: DrizzleConversationStorage;
  executor: any;
  worktreeManager: WorktreeManager;
  projectService: ProjectService;
  gitlabService: GitLabMCPService;
  gitService: GitService;
  codeToolService: CodeToolService;
  modelAvailabilityService: ModelAvailabilityService;
} | null = null;

export async function initializeAllServices() {
  if (services) return services;

  console.log('[INIT] 开始初始化服务...');
  const appEnv = process.env.APP_ENV || 'local';
  const workDir = getGitWorkDir();
  console.log(`[INIT] APP_ENV=${appEnv}, LOCAL_GIT_WORK_DIR=${workDir}`);
  
  // 1. 初始化数据库
  const dbInitStart = Date.now();
  await initializeDatabase();
  console.log(`[INIT] 数据库初始化完成，耗时 ${Date.now() - dbInitStart}ms`);
  const conversationStorage = new DrizzleConversationStorage();
  
  // 2. 初始化执行器
  const executor = new LocalExecutor();
  const { existsSync, mkdirSync } = require('fs');
  if (!existsSync(workDir)) {
    try {
      mkdirSync(workDir, { recursive: true });
    } catch (e: any) {
      console.warn(`⚠️ 无法创建工作目录 ${workDir}: ${e.message}`);
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
  const modelAvailabilityService = new ModelAvailabilityService();
  await modelAvailabilityService.initialize(workDir);
  
  const conversationManager = new ConversationManager(storageAdapter, projectService, gitlabService);
  const branchCacheService = new BranchCacheService(gitlabService, projectService);
  const databaseUrl = process.env.DATABASE_URL || '';
  const neovateAIService = new NeovateAIService(executor, workDir, databaseUrl);
  const conversationAIService = new ConversationAIService(
    neovateAIService,
    databaseUrl,
    gitService
  );

  console.log('[INIT] 对话相关服务初始化完成（业务缓存: Redis）');

  services = {
    conversationManager,
    branchCacheService,
    conversationAIService,
    conversationStorage,
    executor,
    worktreeManager,
    projectService,
    gitlabService,
    gitService,
    codeToolService,
    modelAvailabilityService
  };

  return services;
}

export function getServices() {
  if (!services) {
    throw new Error('Services not initialized. Call initializeAllServices() first.');
  }
  return services;
}
