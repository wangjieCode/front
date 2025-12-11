import cron from 'node-cron';
import { WorkspaceManagementService } from './WorkspaceManagementService';

/**
 * 定时任务服务
 * 管理系统的定时清理和同步任务
 */
export class ScheduledTasksService {
  private workspaceService?: WorkspaceManagementService;
  private workspaceCleanupTask?: cron.ScheduledTask;

  constructor(
    workspaceService?: WorkspaceManagementService
  ) {
    this.workspaceService = workspaceService;
  }

  /**
   * 启动所有定时任务
   */
  startAll(): void {
    this.startWorkspaceCleanup();
    console.log('✅ 定时任务已启动');
  }

  /**
   * 启动工作空间清理任务
   * 默认每天凌晨 2 点执行
   */
  startWorkspaceCleanup(): void {
    if (!this.workspaceService) {
      console.warn('⚠️ WorkspaceManagementService 未初始化，跳过工作空间清理任务');
      return;
    }

    // 从环境变量获取配置
    const cronSchedule = process.env.WORKSPACE_CLEANUP_CRON || '0 2 * * *'; // 默认每天凌晨 2 点
    const daysThreshold = parseInt(process.env.WORKSPACE_CLEANUP_DAYS || '7', 10);

    console.log(`📅 工作空间清理任务计划：${cronSchedule}（清理 ${daysThreshold} 天未使用的工作空间）`);

    this.workspaceCleanupTask = cron.schedule(cronSchedule, async () => {
      try {
        console.log('🧹 开始执行工作空间清理任务...');
        const result = await this.workspaceService!.cleanupExpiredWorkspaces(daysThreshold);
        console.log(`✅ 工作空间清理任务完成：成功 ${result.cleaned} 个，失败 ${result.failed} 个`);
      } catch (error) {
        console.error('❌ 工作空间清理任务执行失败：', error);
      }
    });

    console.log('✅ 工作空间清理任务已启动');
  }



  /**
   * 停止工作空间清理任务
   */
  stopWorkspaceCleanup(): void {
    if (this.workspaceCleanupTask) {
      this.workspaceCleanupTask.stop();
      console.log('🛑 工作空间清理任务已停止');
    }
  }



  /**
   * 停止所有定时任务
   */
  stopAll(): void {
    this.stopWorkspaceCleanup();
    console.log('🛑 所有定时任务已停止');
  }

  /**
   * 手动执行工作空间清理
   */
  async manualWorkspaceCleanup(daysThreshold?: number): Promise<{ cleaned: number; failed: number }> {
    if (!this.workspaceService) {
      throw new Error('WorkspaceManagementService 未初始化');
    }

    const threshold = daysThreshold || parseInt(process.env.WORKSPACE_CLEANUP_DAYS || '7', 10);
    console.log(`🧹 手动执行工作空间清理（${threshold} 天）...`);
    
    const result = await this.workspaceService.cleanupExpiredWorkspaces(threshold);
    console.log(`✅ 清理完成：成功 ${result.cleaned} 个，失败 ${result.failed} 个`);
    
    return result;
  }

}
