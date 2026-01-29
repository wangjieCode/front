import { Job } from 'bullmq';
import { WorktreeManager } from '../services/WorktreeManager';
import { DrizzleConversationStorage } from '../storage/DrizzleConversationStorage';
import { ConversationStatus } from '../types';

/**
 * 清理已归档对话的 Worktrees 任务
 * @param worktreeManager Worktree 管理器
 * @param conversationStorage 存储器（用于获取活跃会话列表）
 * @param job BullMQ 任务对象
 */
export async function runCleanupTask(
  worktreeManager: WorktreeManager,
  conversationStorage: DrizzleConversationStorage,
  job?: Job
) {
  const log = (msg: string) => {
    console.log(`[CleanupTask] ${msg}`);
    if (job) job.log(msg);
  };

  log('正在执行全局清理...');
  try {
    // 先获取所有活跃的会话 ID
    const allSessions = await conversationStorage.listSessions();
    const activeSessionIds = allSessions
      .filter(s => s.status === ConversationStatus.ACTIVE)
      .map(s => s.id);
    
    const { cleaned, failed } = await worktreeManager.globalCleanupWorktrees(activeSessionIds);
    log(`任务完成: 成功清理 ${cleaned}, 失败 ${failed}`);
    
    if (failed > 0) {
      throw new Error(`清理任务部分失败: 成功 ${cleaned}, 失败 ${failed}`);
    }
  } catch (error) {
    const errorMsg = `任务失败: ${error instanceof Error ? error.message : String(error)}`;
    log(errorMsg);
    throw error;
  }
}
