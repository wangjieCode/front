import { TaskManager } from './TaskManager';
import { SSHExecutor } from './SSHExecutor';
import { GitService } from './GitService';
import { NeovateAIService } from './NeovateAIService';
import { GitLabMCPService } from './GitLabMCPService';
import { WebSocketServer } from '../websocket/WebSocketServer';
import { TaskStatus } from '../types';
import { createInfoLog, createErrorLog } from '../models/LogEntry';

/**
 * 任务执行编排器
 * 协调所有服务完成完整的任务执行流程
 */
export class TaskOrchestrator {
  constructor(
    private taskManager: TaskManager,
    private sshExecutor: SSHExecutor,
    private gitService: GitService,
    private neovateAIService: NeovateAIService,
    private gitlabService: GitLabMCPService,
    private wsServer: WebSocketServer,
    private workDir: string,
    private defaultBranch: string = 'main'
  ) {}

  /**
   * 执行任务的完整流程
   * @param taskId 任务 ID
   */
  async executeTask(taskId: string): Promise<void> {
    try {
      // 获取任务
      const task = this.taskManager.getTask(taskId);
      if (!task) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      // 更新任务状态为运行中
      this.taskManager.updateTaskStatus(taskId, TaskStatus.RUNNING);
      this.wsServer.sendTaskStatus(taskId, TaskStatus.RUNNING);

      // 步骤 1: 连接 SSH
      await this.step1_ConnectSSH(taskId);

      // 步骤 2: 调用 qodercli（先不创建分支）
      const aiResult = await this.step2_ModifyCode(taskId, task.prompt);

      // 检查是否有代码变更
      const hasChanges = await this.gitService.hasUncommittedChanges();
      
      if (!hasChanges) {
        // 查询类任务：没有代码变更，直接标记为成功
        this.addLog(taskId, 'info', 'system', '📋 这是一个查询类任务，无需提交代码');
        
        // 保存查询结果
        if (aiResult.rawOutput) {
          this.taskManager.setTaskResult(taskId, aiResult.rawOutput);
        }
        
        this.taskManager.updateTaskStatus(taskId, TaskStatus.SUCCESS);
        this.wsServer.sendTaskCompleted(taskId);
        this.addLog(taskId, 'info', 'system', '✅ 任务执行成功！');
      } else {
        // 代码修改任务：创建分支并继续提交和创建 MR
        this.addLog(taskId, 'info', 'system', '📝 检测到代码变更，开始创建分支');
        
        // 步骤 3: 创建新分支
        await this.step3_CreateBranch(taskId, task.branchName!);

        // 步骤 4: 提交代码
        await this.step4_CommitCode(taskId, task.prompt);

        // 步骤 5: 推送分支
        await this.step5_PushBranch(taskId, task.branchName!);

        // 步骤 6: 创建 MR
        const mrUrl = await this.step6_CreateMR(taskId, task.prompt, task.branchName!);

        // 任务完成
        this.taskManager.updateTaskStatus(taskId, TaskStatus.SUCCESS);
        this.taskManager.setTaskMRUrl(taskId, mrUrl);
        this.wsServer.sendTaskCompleted(taskId, mrUrl);

        this.addLog(taskId, 'info', 'system', '✅ 任务执行成功！');
      }
    } catch (error) {
      // 任务失败
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.taskManager.setTaskError(taskId, errorMessage);
      this.wsServer.sendTaskError(taskId, errorMessage);
      this.addLog(taskId, 'error', 'system', `❌ 任务执行失败: ${errorMessage}`);
    }
  }

  /**
   * 步骤 1: 连接 SSH
   */
  private async step1_ConnectSSH(taskId: string): Promise<void> {
    this.addLog(taskId, 'info', 'system', '🔌 正在连接到远程虚拟机...');

    if (!this.sshExecutor.isConnected()) {
      throw new Error('SSH 未连接，请检查配置');
    }

    // 测试连接
    const isConnected = await this.sshExecutor.testConnection();
    if (!isConnected) {
      throw new Error('SSH 连接测试失败');
    }

    this.addLog(taskId, 'info', 'ssh', '✅ SSH 连接成功');
  }

  /**
   * 步骤 2: 调用 qodercli 修改代码
   */
  private async step2_ModifyCode(taskId: string, prompt: string): Promise<any> {
    this.addLog(taskId, 'info', 'neovateai', '🤖 正在使用 AI 修改代码...');
    this.addLog(taskId, 'info', 'neovateai', `提示词: ${prompt}`);

    const result = await this.neovateAIService.modifyCode(prompt);

    if (!result.success) {
      throw new Error(`AI 代码修改失败: ${result.error}`);
    }

    this.addLog(
      taskId,
      'info',
      'neovateai',
      `✅ 代码修改完成，共 ${result.changes.length} 个文件变更`
    );

    // 发送代码变更通知
    if (result.changes.length > 0) {
      this.wsServer.sendCodeChange(taskId, result.changes);
      
      // 记录每个文件的变更
      result.changes.forEach((change) => {
        this.addLog(
          taskId,
          'info',
          'neovateai',
          `  - ${change.changeType}: ${change.filePath}`
        );
      });
    }

    return result;
  }

  /**
   * 步骤 3: 创建新分支
   */
  private async step3_CreateBranch(taskId: string, branchName: string): Promise<void> {
    this.addLog(taskId, 'info', 'git', `🌿 正在创建分支: ${branchName}`);

    // 检查分支是否已存在
    const exists = await this.gitService.branchExists(branchName);
    if (exists) {
      this.addLog(taskId, 'info', 'git', `分支 ${branchName} 已存在，切换到该分支`);
      const checkoutResult = await this.gitService.checkoutBranch(branchName);
      if (!checkoutResult.success) {
        throw new Error(`切换分支失败: ${checkoutResult.error}`);
      }
    } else {
      const result = await this.gitService.createBranch(branchName, this.defaultBranch);
      if (!result.success) {
        throw new Error(`创建分支失败: ${result.error}`);
      }
    }

    this.addLog(taskId, 'info', 'git', `✅ 分支 ${branchName} 已就绪`);
  }

  /**
   * 步骤 4: 提交代码
   */
  private async step4_CommitCode(taskId: string, prompt: string): Promise<void> {
    this.addLog(taskId, 'info', 'git', '📝 正在提交代码...');

    // 添加所有文件
    const addResult = await this.gitService.addFiles();
    if (!addResult.success) {
      throw new Error(`添加文件失败: ${addResult.error}`);
    }

    // 提交代码
    const commitMessage = `feat: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`;
    const commitResult = await this.gitService.commit(commitMessage);
    if (!commitResult.success) {
      throw new Error(`提交代码失败: ${commitResult.error}`);
    }

    this.addLog(taskId, 'info', 'git', `✅ 代码已提交: ${commitMessage}`);
  }

  /**
   * 步骤 5: 推送分支
   */
  private async step5_PushBranch(taskId: string, branchName: string): Promise<void> {
    this.addLog(taskId, 'info', 'git', `🚀 正在推送分支: ${branchName}`);

    const result = await this.gitService.push(branchName);
    if (!result.success) {
      throw new Error(`推送分支失败: ${result.error}`);
    }

    this.addLog(taskId, 'info', 'git', `✅ 分支已推送到远程仓库`);
  }

  /**
   * 步骤 6: 创建 MR
   */
  private async step6_CreateMR(
    taskId: string,
    prompt: string,
    branchName: string
  ): Promise<string> {
    this.addLog(taskId, 'info', 'gitlab', '📋 正在创建 Merge Request...');

    const mr = await this.gitlabService.createMRForTask(
      taskId,
      prompt,
      branchName,
      this.defaultBranch
    );

    this.addLog(taskId, 'info', 'gitlab', `✅ Merge Request 已创建`);
    this.addLog(taskId, 'info', 'gitlab', `🔗 MR 链接: ${mr.webUrl}`);

    return mr.webUrl;
  }

  /**
   * 添加日志的辅助方法
   */
  private addLog(
    taskId: string,
    level: 'info' | 'error',
    source: string,
    message: string
  ): void {
    const log = level === 'info' 
      ? createInfoLog(source, message)
      : createErrorLog(source, message);
    
    this.taskManager.addLog(taskId, log);
    this.wsServer.sendTaskLog(taskId, log);
  }
}
