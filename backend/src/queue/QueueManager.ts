import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { RedisManager } from '../db/RedisManager';

/**
 * 任务类型枚举
 */
export enum TaskType {
  ARCHIVE_CONVERSATIONS = 'archive_conversations',
  CLEANUP_WORKTREES = 'cleanup_worktrees',
}

/**
 * 队列名称
 */
export const MAIN_QUEUE_NAME = 'main-task-queue';

/**
 * 获取 BullMQ 的基础配置，确保环境隔离
 */
export function getBullOptions() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('REDIS_URL not configured');

  return {
    connection: {
      url: redisUrl,
      tls: redisUrl.includes('rediss://') || redisUrl.includes('.upstash.io') ? {} : undefined,
    },
    // 核心隔离：环境前缀 + bull
    prefix: (process.env.REDIS_PREFIX || '') + 'bull',
  };
}

/**
 * 队列管理器
 * 负责定义队列、推送任务以及提供连接配置
 */
export class QueueManager {
  private static _queue: Queue | null = null;

  /**
   * 获取共享队列实例
   */
  public static getQueue(): Queue {
    if (!this._queue) {
      this._queue = new Queue(MAIN_QUEUE_NAME, getBullOptions());
    }
    return this._queue;
  }

  /**
   * 配置可重复执行的任务 (替代 node-cron)
   */
  public static async setupRepeatableJobs() {
    const queue = this.getQueue();

    console.log('⏲️ 配置 BullMQ 可重复任务...');

    // 清理旧的重复任务配置（防止逻辑更改后冲突）
    const oldRepeatableJobs = await queue.getRepeatableJobs();
    for (const job of oldRepeatableJobs) {
      await queue.removeRepeatableByKey(job.key);
    }

    // 1. 归档任务 - 每天 00:00
    await queue.add(
      TaskType.ARCHIVE_CONVERSATIONS,
      { olderThanDays: 1 },
      {
        repeat: { pattern: '0 0 * * *' },
        jobId: TaskType.ARCHIVE_CONVERSATIONS, // 确保唯一性
        attempts: 3, // 失败重试 3 次
        backoff: { type: 'exponential', delay: 1000 * 60 }, // 指数退避，初始 1 分钟
      }
    );

    // 2. 清理任务 - 每天 02:00
    await queue.add(
      TaskType.CLEANUP_WORKTREES,
      {},
      {
        repeat: { pattern: '0 2 * * *' },
        jobId: TaskType.CLEANUP_WORKTREES,
        attempts: 1, // 清理任务不建议频繁重试，失败可等下次
      }
    );

    console.log('✅ 可重复任务已注册');
  }
}
