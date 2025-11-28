import express, { Express } from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { TaskManager, SSHExecutor, GitService, CodeToolService, GitLabMCPService, TaskOrchestrator } from './services';
import { createTaskRoutes } from './api/taskRoutes';
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

// 创建服务实例
const taskManager = new TaskManager();

// 初始化执行器和其他服务
let orchestrator: TaskOrchestrator | undefined;

const runMode = process.env.RUN_MODE || 'local';
console.log(`🔧 运行模式: ${runMode === 'local' ? '本机模式' : '远程模式'}`);

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

  const gitService = new GitService(executor, workDir);
  const codeToolService = new CodeToolService(executor);
  const gitlabService = new GitLabMCPService(gitlabConfig);

  // 获取工具信息并记录
  codeToolService.getToolInfo(workDir).then((info: { name: string; version: string; available: boolean }) => {
    console.log(`🔧 代码工具: ${info.name} (${info.version})`);
    console.log(`✅ 工具可用性: ${info.available ? '可用' : '不可用'}`);
  });

  // 创建任务编排器
  orchestrator = new TaskOrchestrator(
    taskManager,
    executor,
    gitService,
    codeToolService,
    gitlabService,
    workDir,
    defaultBranch
  );

  console.log('✅ 任务编排器已初始化');
} catch (error) {
  console.warn('⚠️  任务编排器初始化失败（可能缺少配置）:', error instanceof Error ? error.message : error);
  console.warn('⚠️  系统将以只读模式运行（仅支持查询任务）');
}

// 全局中间件
app.use(corsMiddleware);
app.use(express.json());
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

// API 路由
app.use('/api/tasks', createTaskRoutes(taskManager, orchestrator));

// 404 处理
app.use(notFoundHandler);

// 错误处理
app.use(errorHandler);

// 启动服务器
server.listen(PORT, () => {
  console.log(`🚀 后端服务器运行在 http://localhost:${PORT}`);
  console.log(`📝 环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 API 端点: http://localhost:${PORT}/api/tasks`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

// 导出实例供其他模块使用
export { app, taskManager };
export default app;

