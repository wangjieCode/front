import express, { Express } from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { SSHExecutor, GitService, CodeToolService, GitLabMCPService } from './services';
import { WorktreeManager } from './services/WorktreeManager';
import { createConversationRoutes } from './api/conversationRoutes';
import dayjs from 'dayjs';
import {
  errorHandler,
  requestLogger,
  corsMiddleware,
  validateRequest,
  notFoundHandler,
} from './api/middleware';
import { loadSSHConfig, loadGitLabConfig, getGitWorkDir, getGitDefaultBranch, getWorktreeBaseDir } from './utils/config';

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
    const appEnv = process.env.APP_ENV || 'local';
    const workDir = getGitWorkDir();
    const defaultBranch = getGitDefaultBranch();
    
    console.log(`🌍 当前应用环境 (APP_ENV): ${appEnv}`);
    console.log(`🔧 运行模式 (RUN_MODE): ${runMode}`);
    console.log(`📂 工作目录: ${workDir}`);

    if (runMode === 'local') {
      const { LocalExecutor } = require('./services');
      executor = new LocalExecutor();
      console.log('✅ 本机执行器已初始化');

      // 确保工作目录存在
      const { existsSync, mkdirSync } = require('fs');
      if (!existsSync(workDir)) {
        try {
          mkdirSync(workDir, { recursive: true });
          console.log(`📁 已自动创建本地工作目录: ${workDir}`);
        } catch (e: any) {
          console.warn(`⚠️ 无法创建工作目录 ${workDir}: ${e.message}`);
        }
      }
    } else {
      // 远程模式：使用 SSHExecutor
      console.log('🔌 运行在远程模式，正在尝试加载 SSH 配置...');
      try {
        const sshConfig = loadSSHConfig();
        const { SSHExecutor } = require('./services');
        executor = new SSHExecutor();
        
        console.log('🔌 正在连接 SSH...');
        await executor.connect(sshConfig);
        console.log('✅ SSH 连接已建立');
      } catch (error) {
        console.error('❌ SSH 初始化/连接失败:', error instanceof Error ? error.message : error);
        console.warn('⚠️ SSH 连接失败，系统将尝试以只读/本地受限模式运行');
        const { LocalExecutor } = require('./services');
        executor = new LocalExecutor();
      }
    }

    const codeToolService = new CodeToolService(executor);

    // 获取工具信息并记录
    try {
      const info = await codeToolService.getToolInfo(workDir);
      console.log(`🔧 代码工具: ${info.name} (${info.version})`);
      console.log(`✅ 工具可用性: ${info.available ? '可用' : '不可用'}`);
    } catch (e) {
      console.warn('⚠️ 无法获取代码工具信息');
    }

    // 创建对话服务实例
    const { ConversationManager } = require('./services/ConversationManager');
    const { MessageRouter } = require('./services/MessageRouter');
    const { ConversationAIService } = require('./services/ConversationAIService');
    const { NeovateAIService } = require('./services/NeovateAIService');
    const { ConversationStorageAdapter } = require('./storage/ConversationStorageAdapter');
    const { GitService } = require('./services/GitService');
    const { GitLabMCPService } = require('./services/GitLabMCPService');
    const { ProjectService } = require('./services/ProjectService');

    // 使用 Drizzle 存储
    if (!conversationStorage) {
      throw new Error('数据库存储未初始化');
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
    const worktreeBaseDir = getWorktreeBaseDir(workDir);
    const worktreeManager = new WorktreeManager(executor, workDir, worktreeBaseDir);
    console.log(`📁 Worktree 基础目录: ${worktreeBaseDir}`);
    
    // 创建 ProjectService
    const projectService = new ProjectService(executor);
    
    conversationManager = new ConversationManager(storageAdapter, projectService, gitlabService, worktreeManager);
    const databaseUrl = process.env.DATABASE_URL || '';
    const neovateAIService = new NeovateAIService(executor, workDir, databaseUrl);
    conversationAIService = new ConversationAIService(neovateAIService, databaseUrl, gitService, gitlabService);
    messageRouter = new MessageRouter(conversationManager, conversationAIService);

    console.log('✅ 对话服务已初始化 (存储: Drizzle/Supabase)');
  } catch (error) {
    console.error('❌ 服务初始化过程中发生严重错误:', error);
    console.warn('⚠️ 系统将以受限模式运行');
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
    timestamp: dayjs().toISOString(),
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

  // 项目管理路由
  const { createProjectRoutes } = require('./api/projectRoutes');
  app.use('/api/projects', createProjectRoutes(executor));

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

  // 静态资源服务
  const publicDir = path.resolve(__dirname, '../public');
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      return next();
    });
  }

  // 404 处理
  app.use(notFoundHandler);

  // 错误处理
  app.use(errorHandler);

  // 3. 启动服务器
  const HOST = process.env.HOST || '0.0.0.0'; // 监听所有网络接口
  server.listen(Number(PORT), HOST, async () => {
    console.log(`🚀 后端服务器运行在:`);
    console.log(`   - 本地访问: http://localhost:${PORT}`);
    console.log(`   - 局域网访问: http://<your-ip>:${PORT}`);
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
