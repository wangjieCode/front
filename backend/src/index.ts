import express, { Express } from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { SSHExecutor, GitService, CodeToolService, GitLabMCPService } from './services';
import { WorktreeManager } from './services/WorktreeManager';
import { createConversationRoutes } from './api/conversationRoutes';
import {
  errorHandler,
  requestLogger,
  corsMiddleware,
  validateRequest,
  notFoundHandler,
} from './api/middleware';
import { loadSSHConfig, loadGitLabConfig, getGitWorkDir, getGitDefaultBranch } from './utils/config';

// 加载环境变量
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// 创建 HTTP 服务器
const server = createServer(app);

// 初始化数据库
import { initializeDatabase } from './db/init';
import { DrizzleConversationStorage } from './storage/DrizzleConversationStorage';

// 初始化服务
let conversationManager: any;
let messageRouter: any;
let conversationAIService: any;
let conversationStorage: DrizzleConversationStorage | null = null;
let executor: any;

const runMode = process.env.RUN_MODE || 'local';
console.log(`🔧 运行模式: ${runMode === 'local' ? '本机模式' : '远程模式'}`);

// 初始化服务的异步函数
async function initializeServices() {
  try {
    // 1. 先初始化数据库
    await initializeDatabase();
    conversationStorage = new DrizzleConversationStorage();
    console.log('✅ 数据库已初始化，使用 Drizzle/Supabase 存储');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error instanceof Error ? error.message : error);
    console.error('   请检查 DATABASE_URL 环境变量配置');
    process.exit(1);
  }

  // 2. 然后初始化其他服务
  try {
  const gitlabConfig = loadGitLabConfig();
  const workDir = getGitWorkDir();
  const defaultBranch = getGitDefaultBranch();

  if (runMode === 'local') {
    // 本机模式：使用 LocalExecutor
    const { LocalExecutor } = require('./services');
    executor = new LocalExecutor();
    console.log('✅ 本机执行器已初始化');

    // 确保工作目录存在
    const { existsSync, mkdirSync } = require('fs');
    const { resolve } = require('path');
    const absWorkDir = resolve(workDir);
    if (!existsSync(absWorkDir)) {
      mkdirSync(absWorkDir, { recursive: true });
      console.log(`📁 创建工作目录: ${absWorkDir}`);
    }
  } else {
    // 远程模式：使用 SSHExecutor
    const sshConfig = loadSSHConfig();
    console.log('🔌 SSH 配置:');
    console.log('  host:', sshConfig.host);
    console.log('  port:', sshConfig.port);
    console.log('  username:', sshConfig.username);
    console.log('  认证方式:', sshConfig.privateKey ? '私钥' : '密码');
    
    executor = new SSHExecutor();

    // 连接 SSH（等待连接完成）
    try {
      console.log('🔌 正在连接 SSH...');
      await executor.connect(sshConfig);
      console.log('✅ SSH 连接已建立');
      
      // 测试 SSH 连接
      console.log('🧪 测试 SSH 连接...');
      const testResult = await executor.testConnection();
      if (testResult) {
        console.log('✅ SSH 连接测试成功');
      } else {
        console.warn('⚠️  SSH 连接测试失败');
      }
      
      // 测试基本命令
      console.log('🧪 测试基本命令执行...');
      const echoResult = await executor.executeCommand('echo "Hello from SSH"');
      console.log('  exitCode:', echoResult.exitCode);
      console.log('  stdout:', echoResult.stdout);
      
      // 检查 shell 类型
      const shellResult = await executor.executeCommand('echo $SHELL');
      console.log('🐚 远程 Shell:', shellResult.stdout.trim());
      
      // 检查 PATH
      const pathResult = await executor.executeCommand('echo $PATH');
      console.log('📍 远程 PATH:', pathResult.stdout.trim());
      
      // 检查 Node.js 版本
      const nodeResult = await executor.executeCommand('node -v');
      console.log('📦 Node.js 版本:', nodeResult.exitCode === 0 ? nodeResult.stdout.trim() : '未安装或不在 PATH 中');
      
      // 检查 fnm
      const fnmResult = await executor.executeCommand('which fnm');
      console.log('🔧 fnm 路径:', fnmResult.exitCode === 0 ? fnmResult.stdout.trim() : '未找到');
      
      // 检查 docker
      const dockerResult = await executor.executeCommand('which docker');
      console.log('🐳 docker 路径:', dockerResult.exitCode === 0 ? dockerResult.stdout.trim() : '未找到');
      
      // 检查 docker-compose
      const dockerComposeResult = await executor.executeCommand('which docker-compose');
      console.log('🐳 docker-compose 路径:', dockerComposeResult.exitCode === 0 ? dockerComposeResult.stdout.trim() : '未找到');
      
    } catch (error) {
      console.error('❌ SSH 连接失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  }

  const codeToolService = new CodeToolService(executor);

  // 获取工具信息并记录
  const info = await codeToolService.getToolInfo(workDir);
  console.log(`🔧 代码工具: ${info.name} (${info.version})`);
  console.log(`✅ 工具可用性: ${info.available ? '可用' : '不可用'}`);



  // 创建对话服务实例
  const { ConversationManager } = require('./services/ConversationManager');
  const { MessageRouter } = require('./services/MessageRouter');
  const { ConversationAIService } = require('./services/ConversationAIService');
  const { NeovateAIService } = require('./services/NeovateAIService');
  const { ConversationStorageAdapter } = require('./storage/ConversationStorageAdapter');
  const { GitService } = require('./services/GitService');
  const { GitLabMCPService } = require('./services/GitLabMCPService');

  // 使用 Drizzle 存储
  if (!conversationStorage) {
    throw new Error('数据库未初始化，无法启动对话服务');
  }
  
  // 使用适配器包装存储
  const storageAdapter = new ConversationStorageAdapter(conversationStorage);
  const gitService = new GitService(executor, workDir);
  const gitlabService = new GitLabMCPService({
    url: process.env.GITLAB_URL || '',
    token: process.env.GITLAB_TOKEN || '',
    projectId: process.env.GITLAB_PROJECT_ID || '',
  });
  
  // 创建 WorktreeManager
  const worktreeBaseDir = process.env.WORKTREE_BASE_DIR || `${workDir}/../worktrees`;
  const worktreeManager = new WorktreeManager(executor, workDir, worktreeBaseDir);
  console.log(`📁 Worktree 基础目录: ${worktreeBaseDir}`);
  
  conversationManager = new ConversationManager(storageAdapter, gitService, gitlabService, worktreeManager);
  const databaseUrl = process.env.DATABASE_URL || '';
  const neovateAIService = new NeovateAIService(executor, workDir, databaseUrl);
  conversationAIService = new ConversationAIService(neovateAIService, databaseUrl, gitService, gitlabService);
  messageRouter = new MessageRouter(conversationManager, conversationAIService);

  console.log('✅ 对话服务已初始化 (存储: Drizzle/Supabase)');
  } catch (error) {
    console.warn('⚠️  服务初始化失败（可能缺少配置）:', error instanceof Error ? error.message : error);
    console.warn('⚠️  系统将以只读模式运行（仅支持查询任务）');
  }
}

// 全局中间件
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' })); // 增加 JSON body 大小限制
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(requestLogger);
app.use(validateRequest);

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 启动服务器（异步）
async function startServer() {
  // 1. 先初始化服务
  await initializeServices();

  // 2. 注册 API 路由
  // 认证路由
  const { createAuthRoutes } = require('./api/authRoutes');
  app.use('/api/auth', createAuthRoutes());

  // 对话路由（在服务初始化后注册）
  if (conversationManager && messageRouter && conversationAIService) {
    app.use('/api/conversations', createConversationRoutes(conversationManager, messageRouter, conversationAIService));
    
    // 预览路由
    const { createPreviewRoutes } = require('./api/previewRoutes');
    const { ProjectPreviewService } = require('./services/ProjectPreviewService');
    const previewService = new ProjectPreviewService(conversationManager, executor, process.env.SSH_HOST);
    app.use('/api/conversations', createPreviewRoutes(previewService));
  }

  // Docker 管理路由
  const dockerRoutes = require('./api/dockerRoutes').default;
  app.use('/api/docker', dockerRoutes);

  // Docker Compose 管理路由
  const { createDockerComposeRoutes } = require('./api/dockerComposeRoutes');
  const { DockerComposeService } = require('./services/DockerComposeService');
  const dockerComposeService = new DockerComposeService(executor);
  app.use('/api/docker-compose', createDockerComposeRoutes(dockerComposeService));

  // 404 处理
  app.use(notFoundHandler);

  // 错误处理
  app.use(errorHandler);

  // 3. 启动服务器
  server.listen(PORT, async () => {
    console.log(`🚀 后端服务器运行在 http://localhost:${PORT}`);
    console.log(`📝 环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌊 SSE 流式响应端点: http://localhost:${PORT}/api/streaming`);
    
    if (conversationManager && messageRouter && conversationAIService) {
      console.log(`💬 对话 API 端点: http://localhost:${PORT}/api/conversations`);
    }
  });
}

// 启动服务器
startServer().catch((error) => {
  console.error('❌ 服务器启动失败:', error);
  process.exit(1);
});

// 优雅关闭
import { closeDatabase } from './db/init';
import { streamingManager } from './streaming/StreamingResponseManager';

process.on('SIGTERM', async () => {
  console.log('收到 SIGTERM 信号，正在关闭服务器...');
  
  // 关闭所有 SSE 连接
  await streamingManager.closeAll();
  
  // 关闭数据库连接
  await closeDatabase();
  
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\n收到 SIGINT 信号，正在关闭服务器...');
  
  // 关闭所有 SSE 连接
  await streamingManager.closeAll();
  
  // 关闭数据库连接
  await closeDatabase();
  
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

// 导出实例供其他模块使用
export { app };
export default app;

