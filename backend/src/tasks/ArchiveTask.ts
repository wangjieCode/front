import { Job } from 'bullmq';
import { ConversationManager } from '../services/ConversationManager';

/**
 * 归档不活跃对话任务
 * @param conversationManager 对话管理器
 * @param olderThanXDays 超过多少天归档
 * @param job BullMQ 任务对象（用于 UI 日志投递）
 */
export async function runArchiveTask(
  conversationManager: ConversationManager,
  olderThanXDays: number = 1,
  job?: Job
) {
  const log = (msg: string) => {
    console.log(`[ArchiveTask] ${msg}`);
    if (job) job.log(msg);
  };

  log(`正在执行... (阈值: ${olderThanXDays} 天)`);
  try {
    const archivedCount = await conversationManager.archiveInactiveSessions(olderThanXDays);
    log(`任务完成，成功归档 ${archivedCount} 个会话`);
  } catch (error) {
    const errorMsg = `任务失败: ${error instanceof Error ? error.message : String(error)}`;
    log(errorMsg);
    throw error;
  }
}
