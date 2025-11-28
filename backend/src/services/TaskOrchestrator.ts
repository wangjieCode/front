import { TaskManager } from './TaskManager';
import { SSHExecutor } from './SSHExecutor';
import { GitService } from './GitService';
import { CodeToolService } from './CodeToolService';
import { GitLabMCPService } from './GitLabMCPService';
import { TaskStatus, TaskType } from '../types';
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
    private codeToolService: CodeToolService,
    private gitlabService: GitLabMCPService,
    private workDir: string,
    private defaultBranch: string = 'main'
  ) { }

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

      // 步骤 1: 连接 SSH
      await this.step1_ConnectSSH(taskId);

      // 步骤 2: 准备工作区（清理本地变更并切换到默认分支）
      await this.step2_PrepareWorkspace(taskId);

      // 根据任务类型执行不同的流程
      if (task.type === TaskType.QUERY) {
        // 只读模式：不调用代码工具，直接返回提示词作为结果
        this.addLog(taskId, 'info', 'system', '📋 只读模式：不修改代码');
        
        // 保存提示词作为查询结果
        this.taskManager.setTaskResult(taskId, task.prompt);
        
        this.taskManager.updateTaskStatus(taskId, TaskStatus.SUCCESS);
        this.addLog(taskId, 'info', 'system', '✅ 只读任务执行成功！');
      } else {
        // 编辑模式：检查工具可用性
        const toolAvailable = await this.codeToolService.isAvailable(this.workDir);
        if (!toolAvailable) {
          const toolName = this.codeToolService.getToolName();
          throw new Error(
            `代码工具 ${toolName} 不可用。请确保 ${toolName} 已安装并在 PATH 中。\n` +
            `安装说明：请参考 ${toolName} 的官方文档。`
          );
        }

        // 步骤 3: 调用代码工具修改代码
        const aiResult = await this.step3_ModifyCode(taskId, task.prompt);

        // 检查是否有代码变更
        const hasChanges = await this.gitService.hasUncommittedChanges();

        if (!hasChanges) {
          // 没有代码变更（可能是查询类操作）
          this.addLog(taskId, 'info', 'system', '📋 未检测到代码变更');

          // 保存结果
          if (aiResult.rawOutput) {
            this.taskManager.setTaskResult(taskId, aiResult.rawOutput);
          }

          this.taskManager.updateTaskStatus(taskId, TaskStatus.SUCCESS);
          this.addLog(taskId, 'info', 'system', '✅ 任务执行成功！');
        } else {
          // 代码修改任务：创建分支并继续提交和创建 MR
          this.addLog(taskId, 'info', 'system', '📝 检测到代码变更，开始创建分支');

          // 步骤 4: 创建新分支
          await this.step4_CreateBranch(taskId, task.branchName!);

          // 步骤 5: 提交代码
          await this.step5_CommitCode(taskId, task.prompt);

          // 步骤 6: 推送分支
          await this.step6_PushBranch(taskId, task.branchName!);

          // 步骤 7: 创建 MR
          const mrUrl = await this.step7_CreateMR(taskId, task.prompt, task.branchName!);

          // 任务完成
          this.taskManager.updateTaskStatus(taskId, TaskStatus.SUCCESS);
          this.taskManager.setTaskMRUrl(taskId, mrUrl);

          this.addLog(taskId, 'info', 'system', '✅ 任务执行成功！');
        }
      }
    } catch (error) {
      // 任务失败
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.taskManager.setTaskError(taskId, errorMessage);
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
   * 步骤 2: 准备工作区
   * 清理本地变更并切换到默认分支的最新代码
   */
  private async step2_PrepareWorkspace(taskId: string): Promise<void> {
    this.addLog(taskId, 'info', 'git', '🧹 正在准备工作区...');

    // 1. 重置所有本地变更（丢弃未提交的修改）
    this.addLog(taskId, 'info', 'git', '清理本地变更...');
    const resetResult = await this.sshExecutor.executeCommand(
      'git reset --hard HEAD',
      this.workDir
    );
    if (resetResult.exitCode !== 0) {
      throw new Error(`重置本地变更失败: ${resetResult.stderr}`);
    }

    // 2. 清理未跟踪的文件
    const cleanResult = await this.sshExecutor.executeCommand(
      'git clean -fd',
      this.workDir
    );
    if (cleanResult.exitCode !== 0) {
      throw new Error(`清理未跟踪文件失败: ${cleanResult.stderr}`);
    }

    // 3. 切换到默认分支
    this.addLog(taskId, 'info', 'git', `切换到 ${this.defaultBranch} 分支...`);
    const checkoutResult = await this.gitService.checkoutBranch(this.defaultBranch);
    if (!checkoutResult.success) {
      throw new Error(`切换到 ${this.defaultBranch} 分支失败: ${checkoutResult.error}`);
    }

    // 4. 拉取最新代码
    this.addLog(taskId, 'info', 'git', '拉取最新代码...');
    const pullResult = await this.sshExecutor.executeCommand(
      `git pull origin ${this.defaultBranch}`,
      this.workDir
    );
    if (pullResult.exitCode !== 0) {
      // 拉取失败不一定是致命错误，可能只是网络问题或已经是最新
      this.addLog(taskId, 'info', 'git', `⚠️ 拉取代码警告: ${pullResult.stderr}`);
    }

    this.addLog(taskId, 'info', 'git', `✅ 工作区已准备就绪（基于 ${this.defaultBranch} 最新代码）`);
  }

  /**
   * 步骤 3: 调用代码工具修改代码
   */
  private async step3_ModifyCode(taskId: string, prompt: string): Promise<any> {
    // 获取当前使用的工具名称
    const toolName = this.codeToolService.getToolName();

    this.addLog(taskId, 'info', 'codetool', `🤖 正在使用 ${toolName} 修改代码...`);
    this.addLog(taskId, 'info', 'codetool', `提示词: ${prompt}`);

    // 使用流式输出执行代码修改
    const result = await this.codeToolService.modifyCodeStream(
      prompt,
      this.workDir,
      (data: string) => {
        // 添加日志到任务管理器，前端会通过轮询获取
        this.taskManager.addLog(taskId, createInfoLog('codetool', data));
      },
      (error: string) => {
        // 添加错误日志到任务管理器
        this.taskManager.addLog(taskId, createErrorLog('codetool', error));
      }
    );

    if (!result.success) {
      throw new Error(`AI 代码修改失败: ${result.error}`);
    }

    this.addLog(
      taskId,
      'info',
      'codetool',
      `✅ 代码修改完成，共 ${result.changes.length} 个文件变更`
    );

    // 记录代码变更（前端通过轮询获取）
    if (result.changes.length > 0) {

      // 记录每个文件的变更
      result.changes.forEach((change) => {
        this.addLog(
          taskId,
          'info',
          'codetool',
          `  - ${change.changeType}: ${change.filePath}`
        );
      });
    }

    return result;
  }

  /**
   * 步骤 4: 创建新分支
   */
  private async step4_CreateBranch(taskId: string, branchName: string): Promise<void> {
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
   * 步骤 5: 提交代码
   */
  private async step5_CommitCode(taskId: string, prompt: string): Promise<void> {
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
   * 步骤 6: 推送分支
   */
  private async step6_PushBranch(taskId: string, branchName: string): Promise<void> {
    this.addLog(taskId, 'info', 'git', `🚀 正在推送分支: ${branchName}`);

    const result = await this.gitService.push(branchName);
    if (!result.success) {
      throw new Error(`推送分支失败: ${result.error}`);
    }

    this.addLog(taskId, 'info', 'git', `✅ 分支已推送到远程仓库`);
  }

  /**
   * 步骤 7: 创建 MR
   */
  private async step7_CreateMR(
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
  }
}
