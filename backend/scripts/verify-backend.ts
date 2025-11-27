#!/usr/bin/env tsx

/**
 * 后端能力验证脚本
 * 测试所有核心功能是否正常工作
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// 加载环境变量
dotenv.config({ path: resolve(__dirname, '../.env') });

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({
      name,
      status: 'pass',
      message: '✓',
      duration: Date.now() - start,
    });
  } catch (error) {
    results.push({
      name,
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    });
  }
}

async function skip(name: string, reason: string): Promise<void> {
  results.push({
    name,
    status: 'skip',
    message: reason,
  });
}

async function main() {
  console.log('🧪 开始验证后端能力...\n');

  // 1. 测试数据模型
  console.log('📦 测试数据模型...');
  await test('创建任务模型', async () => {
    const { createTask } = await import('../src/models/Task');
    const task = createTask('测试任务');
    if (!task.id || !task.branchName) {
      throw new Error('任务创建失败');
    }
  });

  await test('任务状态转换验证', async () => {
    const { createTask, updateTaskStatus } = await import('../src/models/Task');
    const { TaskStatus } = await import('../src/types');
    const task = createTask('测试');
    updateTaskStatus(task, TaskStatus.RUNNING);
    if (task.status !== TaskStatus.RUNNING) {
      throw new Error('状态更新失败');
    }
    // 测试非法转换
    try {
      updateTaskStatus(task, TaskStatus.PENDING);
      throw new Error('应该拒绝非法状态转换');
    } catch (error: any) {
      if (!error.message.includes('非法')) {
        throw error;
      }
    }
  });

  await test('创建日志条目', async () => {
    const { createInfoLog } = await import('../src/models/LogEntry');
    const log = createInfoLog('test', '测试日志');
    if (!log.timestamp || !log.message) {
      throw new Error('日志创建失败');
    }
  });

  await test('创建代码变更', async () => {
    const { createCodeChange } = await import('../src/models/CodeChange');
    const { ChangeType } = await import('../src/types');
    const change = createCodeChange('test.ts', ChangeType.MODIFIED, 'diff content');
    if (!change.filePath) {
      throw new Error('代码变更创建失败');
    }
  });

  // 2. 测试任务管理器
  console.log('\n📋 测试任务管理器...');
  await test('任务管理器 - 创建和查询', async () => {
    const { TaskManager } = await import('../src/services/TaskManager');
    const manager = new TaskManager();
    const task = manager.createTask('测试任务');
    const retrieved = manager.getTask(task.id);
    if (!retrieved || retrieved.id !== task.id) {
      throw new Error('任务查询失败');
    }
  });

  await test('任务管理器 - 日志管理', async () => {
    const { TaskManager } = await import('../src/services/TaskManager');
    const { createInfoLog } = await import('../src/models/LogEntry');
    const manager = new TaskManager();
    const task = manager.createTask('测试');
    const log = createInfoLog('test', '测试日志');
    manager.addLog(task.id, log);
    const logs = manager.getLogs(task.id);
    if (logs.length < 2) { // 至少有创建日志和测试日志
      throw new Error('日志添加失败');
    }
  });

  await test('任务管理器 - 统计信息', async () => {
    const { TaskManager } = await import('../src/services/TaskManager');
    const manager = new TaskManager();
    manager.createTask('任务1');
    manager.createTask('任务2');
    const stats = manager.getStats();
    if (stats.total !== 2 || stats.pending !== 2) {
      throw new Error('统计信息错误');
    }
  });

  // 3. 测试本地执行器
  console.log('\n💻 测试本地执行器...');
  await test('本地执行器 - 连接测试', async () => {
    const { LocalExecutor } = await import('../src/services/LocalExecutor');
    const executor = new LocalExecutor();
    if (!executor.isConnected()) {
      throw new Error('本地执行器应该始终连接');
    }
    const testResult = await executor.testConnection();
    if (!testResult) {
      throw new Error('连接测试失败');
    }
  });

  await test('本地执行器 - 命令执行', async () => {
    const { LocalExecutor } = await import('../src/services/LocalExecutor');
    const executor = new LocalExecutor();
    const result = await executor.executeCommand('echo "hello"');
    if (result.exitCode !== 0 || !result.stdout.includes('hello')) {
      throw new Error(`命令执行失败: ${result.stderr}`);
    }
  });

  await test('本地执行器 - 错误处理', async () => {
    const { LocalExecutor } = await import('../src/services/LocalExecutor');
    const executor = new LocalExecutor();
    const result = await executor.executeCommand('nonexistentcommand');
    if (result.exitCode === 0) {
      throw new Error('应该返回非零退出码');
    }
  });

  // 4. 测试 Git 服务
  console.log('\n🌿 测试 Git 服务...');
  await test('Git 服务 - 初始化', async () => {
    const { GitService } = await import('../src/services/GitService');
    const { LocalExecutor } = await import('../src/services/LocalExecutor');
    const executor = new LocalExecutor();
    const gitService = new GitService(executor, './workspace');
    if (!gitService) {
      throw new Error('Git 服务初始化失败');
    }
  });

  // 5. 测试配置加载
  console.log('\n⚙️  测试配置加载...');
  await test('加载 Git 配置', async () => {
    const { getGitWorkDir, getGitDefaultBranch } = await import('../src/utils/config');
    const workDir = getGitWorkDir();
    const branch = getGitDefaultBranch();
    if (!workDir || !branch) {
      throw new Error('Git 配置加载失败');
    }
  });

  const runMode = process.env.RUN_MODE || 'local';
  if (runMode === 'remote') {
    await test('加载 SSH 配置', async () => {
      const { loadSSHConfig } = await import('../src/utils/config');
      const config = loadSSHConfig();
      if (!config.host || !config.username) {
        throw new Error('SSH 配置不完整');
      }
    });
  } else {
    await skip('加载 SSH 配置', '本地模式不需要 SSH');
  }

  // 6. 测试 WebSocket 服务器
  console.log('\n🔌 测试 WebSocket 服务器...');
  await test('WebSocket 服务器 - 初始化', async () => {
    const { WebSocketServer } = await import('../src/websocket/WebSocketServer');
    const { createServer } = await import('http');
    const server = createServer();
    const wsServer = new WebSocketServer(server);
    if (wsServer.getClientCount() !== 0) {
      throw new Error('初始客户端数量应该为 0');
    }
    wsServer.close();
    server.close();
  });

  // 7. 测试 API 路由
  console.log('\n🌐 测试 API 路由...');
  await test('API 路由 - 创建路由', async () => {
    const { createTaskRoutes } = await import('../src/api/taskRoutes');
    const { TaskManager } = await import('../src/services/TaskManager');
    const manager = new TaskManager();
    const router = createTaskRoutes(manager);
    if (!router) {
      throw new Error('路由创建失败');
    }
  });

  // 打印结果
  console.log('\n' + '='.repeat(60));
  console.log('验证结果汇总\n');

  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const skipCount = results.filter((r) => r.status === 'skip').length;

  results.forEach((result) => {
    const icon =
      result.status === 'pass' ? '✅' : result.status === 'skip' ? '⏭️ ' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`${icon} ${result.name}${duration}`);
    if (result.status === 'fail') {
      console.log(`   错误: ${result.message}`);
    } else if (result.status === 'skip') {
      console.log(`   原因: ${result.message}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(
    `总计: ${passCount} 通过, ${failCount} 失败, ${skipCount} 跳过\n`
  );

  if (failCount > 0) {
    console.error('❌ 验证失败！请检查上述错误。\n');
    process.exit(1);
  } else {
    console.log('✅ 所有测试通过！后端功能正常。\n');
    console.log('💡 提示:');
    console.log('  - 运行 npm run dev 启动服务器');
    console.log('  - 运行 npm test 执行完整测试套件');
    console.log('  - 查看 QUICKSTART.md 了解如何使用\n');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('❌ 验证过程出错:', error);
  process.exit(1);
});
