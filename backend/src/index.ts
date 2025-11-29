import express, { Express } from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { SSHExecutor, GitService, CodeToolService, GitLabMCPService } from './services';
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

  let executor: any;

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
    executor = new SSHExecutor();

    // 连接 SSH
    executor.connect(sshConfig).then(() => {
      console.log('✅ SSH 连接已建立');
    }).catch((error: Error) => {
      console.error('❌ SSH 连接失败:', error.message);
    });
  }

  const codeToolService = new CodeToolService(executor);

  // 获取工具信息并记录
  codeToolService.getToolInfo(workDir).then((info: { name: string; version: string; available: boolean }) => {
    console.log(`🔧 代码工具: ${info.name} (${info.version})`);
    console.log(`✅ 工具可用性: ${info.available ? '可用' : '不可用'}`);
  });

  // 创建对话服务实例
  const { ConversationManager } = require('./services/ConversationManager');
  const { MessageRouter } = require('./services/MessageRouter');
  const { ConversationAIService } = require('./services/ConversationAIService');
  const { NeovateAIService } = require('./services/NeovateAIService');
  const { ConversationStorageAdapter } = require('./storage/ConversationStorageAdapter');

  // 使用 Drizzle 存储
  if (!conversationStorage) {
    throw new Error('数据库未初始化，无法启动对话服务');
  }
  
  // 使用适配器包装存储
  const storageAdapter = new ConversationStorageAdapter(conversationStorage);
  conversationManager = new ConversationManager(storageAdapter);
  const neovateAIService = new NeovateAIService(executor, workDir);
  const databaseUrl = process.env.DATABASE_URL || '';
  conversationAIService = new ConversationAIService(neovateAIService, databaseUrl);
  messageRouter = new MessageRouter(conversationManager, conversationAIService);

  console.log('✅ 对话服务已初始化 (存储: Drizzle/Supabase)');

  // 加载历史会话
  conversationManager.listSessions().then((sessions: any[]) => {
    console.log(`📚 已加载 ${sessions.length} 个历史对话会话`);
    if (sessions.length > 0) {
      console.log('   最近的会话:');
      sessions
        .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5)
        .forEach((session: any) => {
          console.log(`   - ${session.id} (${session.status}) - ${new Date(session.updatedAt).toLocaleString('zh-CN')}`);
        });
    }
  }).catch((error: Error) => {
    console.error('❌ 加载历史会话失败:', error.message);
  });
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

// SSE 流式响应路由
import streamingRoutes from './routes/streaming';

// 启动服务器（异步）
async function startServer() {
  // 1. 先初始化服务
  await initializeServices();

  // 2. 注册 API 路由
  // 对话路由（在服务初始化后注册）
  if (conversationManager && messageRouter && conversationAIService) {
    app.use('/api/conversations', createConversationRoutes(conversationManager, messageRouter, conversationAIService));
  }

  // SSE 流式响应路由
  app.use('/api', streamingRoutes);

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

