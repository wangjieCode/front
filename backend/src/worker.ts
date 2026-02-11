import { Worker, Job } from 'bullmq';
import express from 'express';
import dotenv from 'dotenv';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { initializeAllServices, getServices } from './services/init';
import { runArchiveTask, runCleanupTask } from './tasks';
import { QueueManager, TaskType, MAIN_QUEUE_NAME, getBullOptions } from './queue/QueueManager';

// 加载环境变量
dotenv.config();

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_DAY_SECONDS = 24 * 60 * 60;
const WORKER_RETRY_DELAY_MS = Number(process.env.WORKER_RETRY_DELAY_MS || 30_000);

let retryTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

function scheduleWorkerRetry(reason: unknown): void {
  if (shuttingDown || retryTimer) {
    return;
  }
  const message = reason instanceof Error ? reason.message : String(reason);
  console.warn(`[Worker] 启动失败，${WORKER_RETRY_DELAY_MS}ms 后重试: ${message}`);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void startWorker();
  }, WORKER_RETRY_DELAY_MS);
}

/**
 * 启动任务监控界面 (Dashboard)
 */
async function startDashboard(app: express.Application) {
  const PORT = process.env.DASHBOARD_PORT || 3003;
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/');

  createBullBoard({
    queues: [new BullMQAdapter(QueueManager.getQueue())],
    serverAdapter: serverAdapter,
    options: {
      uiConfig: {
        boardTitle: '任务监控后台',
        // 将 Dashboard 轮询间隔设置为 1 天，降低 Redis 空转请求
        pollingInterval: {
          showSetting: false,
          forceInterval: ONE_DAY_MS,
        },
      },
    },
  });

  // 添加手动触发接口
  app.post('/trigger/:taskType', async (req, res) => {
    const { taskType } = req.params;
    const queue = QueueManager.getQueue();
    
    try {
      console.log(`[Dashboard] 手动触发任务: ${taskType}`);
      await queue.add(taskType, taskType === TaskType.ARCHIVE_CONVERSATIONS ? { olderThanDays: 1 } : {});
      res.json({ message: `任务 ${taskType} 已加入队列`, status: 'success' });
    } catch (err: any) {
      res.status(500).json({ error: err.message, status: 'error' });
    }
  });

  app.use('/', serverAdapter.getRouter());

  app.listen(PORT, () => {
    console.log(`📊 BullMQ Dashboard is running at http://localhost:${PORT}`);
  });
}

async function startWorker() {
  console.log('🚀 BullMQ Worker Process Starting...');
  
  try {
    // 1. 初始化所有服务
    await initializeAllServices();
    const { conversationManager, worktreeManager, conversationStorage } = getServices();
    
    console.log('✅ Worker Services Initialized');

    // 2. 初始化可重复任务调度
    await QueueManager.setupRepeatableJobs();

    // 3. 启动任务处理器 (Worker)
    const worker = new Worker(
      MAIN_QUEUE_NAME,
      async (job: Job) => {
        console.log(`[Worker] 收到任务: ${job.name} (ID: ${job.id})`);

        try {
          switch (job.name) {
            case TaskType.ARCHIVE_CONVERSATIONS:
              const days = job.data.olderThanDays || 1;
              await runArchiveTask(conversationManager, days, job);
              break;
            
            case TaskType.CLEANUP_WORKTREES:
              await runCleanupTask(worktreeManager, conversationStorage, job);
              break;

            default:
              console.warn(`[Worker] 未知任务类型: ${job.name}`);
          }
        } catch (jobError) {
          console.error(`[Worker] 任务执行出错: ${job.name}`, jobError);
          throw jobError; // 重新抛出让 BullMQ 处理重试
        }
      },
      {
        ...getBullOptions(),
        concurrency: 1, // 顺序执行，避免冲突
        // Worker 空闲轮询间隔设置为 1 天，降低 Redis 空转请求
        drainDelay: ONE_DAY_SECONDS,
      }
    );

    worker.on('completed', (job) => {
      console.log(`[Worker] ✅ 任务完成: ${job.name}`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[Worker] ❌ 任务失败: ${job?.name}`, err);
    });

    worker.on('error', (err) => {
      console.error('[Worker] ❌ Worker 运行异常:', err);
    });

    console.log('⏰ BullMQ 任务监听中 (Archive: 00:00, Cleanup: 02:00)');

    // 4. 在同一个进程启动管理界面
    const app = express();
    await startDashboard(app);

  } catch (error) {
    console.error('❌ Worker 启动失败:', error);
    scheduleWorkerRetry(error);
  }
}

// 优雅关闭
process.on('SIGTERM', () => {
  shuttingDown = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  console.log('收到 SIGTERM，正在关闭 Worker...');
  process.exit(0);
});

process.on('SIGINT', () => {
  shuttingDown = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  console.log('收到 SIGINT，正在关闭 Worker...');
  process.exit(0);
});

void startWorker();
