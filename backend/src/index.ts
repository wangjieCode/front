import express, { Express } from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createServer } from 'http';
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
import type { Request } from 'express';

// 加载环境变量
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;
const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

// 创建 HTTP 服务器
const server = createServer(app);

// 初始化数据库
import { initializeDatabase } from './db/init';
import { DrizzleConversationStorage } from './storage/DrizzleConversationStorage';

// 初始化服务
let conversationManager: any;
let messageRouter: any;
let conversationAIService: any;
let executor: any;

import { initializeAllServices } from './services/init';

// 初始化服务的异步函数
async function initializeServices() {
  try {
    const services = await initializeAllServices();
    conversationManager = services.conversationManager;
    messageRouter = services.messageRouter;
    conversationAIService = services.conversationAIService;
    executor = services.executor;
    
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

  // 静态资源服务
  const publicDir = path.resolve(__dirname, '../public');
  const indexPath = path.join(publicDir, 'index.html');
  const mobileIndexPath = path.join(publicDir, 'mobile.html');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: false }));
    const isMobileRequest = (req: Request) => {
      const userAgent = req.headers['user-agent'] || '';
      return MOBILE_UA_REGEX.test(userAgent);
    };

    const getQuerySuffix = (req: Request) => {
      const originalUrl = req.originalUrl || '';
      const queryIndex = originalUrl.indexOf('?');
      return queryIndex >= 0 ? originalUrl.slice(queryIndex) : '';
    };

    app.get(/^\/m(\/|$)/, (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      if (!fs.existsSync(mobileIndexPath)) {
        res.setHeader('X-Entry-Route', 'mobile-missing');
        return next();
      }
      if (!isMobileRequest(req)) {
        const query = getQuerySuffix(req);
        const desktopPath = req.path.replace(/^\/m/, '') || '/';
        res.setHeader('X-Entry-Route', 'desktop-redirect');
        return res.redirect(302, `${desktopPath}${query}`);
      }
      res.setHeader('X-Entry-Route', 'mobile-html');
      return res.sendFile(mobileIndexPath);
    });

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      if (isMobileRequest(req) && fs.existsSync(mobileIndexPath)) {
        const query = getQuerySuffix(req);
        const mobilePath = `/m${req.path === '/' ? '' : req.path}`;
        res.setHeader('X-Entry-Route', 'mobile-redirect');
        return res.redirect(302, `${mobilePath}${query}`);
      }
      if (fs.existsSync(indexPath)) {
        res.setHeader('X-Entry-Route', 'desktop-html');
        return res.sendFile(indexPath);
      }
      res.setHeader('X-Entry-Route', 'desktop-missing');
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
