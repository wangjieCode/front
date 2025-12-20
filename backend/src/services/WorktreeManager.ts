import path from 'path';
import { GitService } from './GitService';
import { ICommandExecutor } from '../types';

/**
 * Worktree 信息接口
 */
export interface WorktreeInfo {
  userId: string;
  worktreePath: string;
  mainBranch: string;
  createdAt: Date;
  lastUsedAt: Date;
}

/**
 * Worktree 管理器
 * 负责管理每个用户的独立 Git worktree
 * 
 * @param executor 命令执行器
 * @param baseRepoPath 基础仓库路径（工作空间项目，如 dtmall-admin）
 * @param worktreeBaseDir worktree 基础目录（存放所有用户 worktree）
 */
export class WorktreeManager {
  private worktreeCache: Map<string, WorktreeInfo> = new Map();
  
  constructor(
    private executor: ICommandExecutor,
    private baseRepoPath: string,
    private worktreeBaseDir: string
  ) {
    console.log(`[WorktreeManager] 初始化`);
    console.log(`[WorktreeManager] 基础仓库: ${baseRepoPath}`);
    console.log(`[WorktreeManager] Worktree 目录: ${worktreeBaseDir}`);
  }

  /**
   * 获取用户的 worktree 路径
   */
  private getUserWorktreePath(userId: string): string {
    return path.join(this.worktreeBaseDir, `user-${userId}`);
  }

  /**
   * 检查 worktree 是否存在
   */
  async worktreeExists(userId: string): Promise<boolean> {
    const worktreePath = this.getUserWorktreePath(userId);
    
    try {
      const result = await this.executor.executeCommand(
        `git worktree list`,
        this.baseRepoPath
      );
      
      return result.stdout.includes(worktreePath);
    } catch (error) {
      console.error(`[WorktreeManager] 检查 worktree 失败:`, error);
      return false;
    }
  }

  /**
   * 为用户创建 worktree
   */
  async createWorktree(
    userId: string,
    baseBranch: string = 'master'
  ): Promise<WorktreeInfo> {
    const worktreePath = this.getUserWorktreePath(userId);
    
    // 检查是否已存在
    if (await this.worktreeExists(userId)) {
      console.log(`[WorktreeManager] Worktree 已存在: ${worktreePath}`);
      return this.getWorktreeInfo(userId);
    }

    try {
      console.log(`[WorktreeManager] 创建用户 worktree: ${userId}`);
      
      // 创建 worktree（使用 --detach 创建分离的 HEAD，基于主分支）
      const result = await this.executor.executeCommand(
        `git worktree add --detach "${worktreePath}" ${baseBranch}`,
        this.baseRepoPath
      );

      if (result.exitCode !== 0) {
        throw new Error(`创建 worktree 失败: ${result.stderr}`);
      }

      // 在 worktree 中切换到主分支
      const checkoutResult = await this.executor.executeCommand(
        `git checkout -B ${baseBranch}`,
        worktreePath
      );

      if (checkoutResult.exitCode !== 0) {
        console.warn(`[WorktreeManager] ⚠️  切换分支失败: ${checkoutResult.stderr}`);
      }

      const now = new Date();
      const worktreeInfo: WorktreeInfo = {
        userId,
        worktreePath,
        mainBranch: baseBranch,
        createdAt: now,
        lastUsedAt: now,
      };

      // 缓存 worktree 信息
      this.worktreeCache.set(userId, worktreeInfo);

      console.log(`[WorktreeManager] ✅ Worktree 创建成功: ${worktreePath}`);
      return worktreeInfo;
    } catch (error) {
      throw new Error(
        `创建用户 worktree 失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取用户的 worktree 信息
   */
  async getWorktreeInfo(userId: string): Promise<WorktreeInfo> {
    // 先从缓存获取
    if (this.worktreeCache.has(userId)) {
      const info = this.worktreeCache.get(userId)!;
      info.lastUsedAt = new Date();
      return info;
    }

    // 从 git worktree list 获取
    const worktreePath = this.getUserWorktreePath(userId);
    const exists = await this.worktreeExists(userId);

    if (!exists) {
      throw new Error(`用户 ${userId} 的 worktree 不存在`);
    }

    // 获取当前分支
    const branchResult = await this.executor.executeCommand(
      'git branch --show-current',
      worktreePath
    );

    const now = new Date();
    const worktreeInfo: WorktreeInfo = {
      userId,
      worktreePath,
      mainBranch: branchResult.stdout.trim(),
      createdAt: now,
      lastUsedAt: now,
    };

    this.worktreeCache.set(userId, worktreeInfo);
    return worktreeInfo;
  }

  /**
   * 获取或创建用户的 worktree
   */
  async getOrCreateWorktree(
    userId: string,
    baseBranch: string = 'master'
  ): Promise<WorktreeInfo> {
    if (await this.worktreeExists(userId)) {
      return this.getWorktreeInfo(userId);
    }
    return this.createWorktree(userId, baseBranch);
  }

  /**
   * 为用户 worktree 创建 GitService
   */
  async createGitServiceForUser(userId: string): Promise<GitService> {
    const worktreeInfo = await this.getOrCreateWorktree(userId);
    return new GitService(this.executor, worktreeInfo.worktreePath);
  }

  /**
   * 在用户 worktree 中创建对话分支
   */
  async createConversationBranch(
    userId: string,
    sessionId: string,
    baseBranch?: string
  ): Promise<{ branchName: string; worktreePath: string }> {
    const worktreeInfo = await this.getOrCreateWorktree(userId);
    const gitService = new GitService(this.executor, worktreeInfo.worktreePath);

    // 生成分支名称
    const shortSessionId = sessionId.substring(0, 8);
    const timestamp = Date.now();
    const branchName = `conversation-${shortSessionId}-${timestamp}`;

    // 如果指定了基础分支，先切换
    const targetBaseBranch = baseBranch || worktreeInfo.mainBranch;
    
    console.log(`[WorktreeManager] 在 worktree ${worktreeInfo.worktreePath} 创建分支: ${branchName}`);
    
    // 先 stash 未提交的变更（如果有）
    const stashResult = await this.executor.executeCommand(
      'git stash push -m "auto-stash before creating conversation branch"',
      worktreeInfo.worktreePath
    );
    console.log(`[WorktreeManager] Stash 结果: ${stashResult.exitCode === 0 ? '成功' : '无需 stash'}`);

    // 在 worktree 中直接创建新分支（基于当前分支）
    const createResult = await this.executor.executeCommand(
      `git checkout -b ${branchName}`,
      worktreeInfo.worktreePath
    );

    if (createResult.exitCode !== 0) {
      throw new Error(`创建分支失败: ${createResult.stderr}`);
    }

    // 推送分支到远程
    const pushResult = await gitService.push(branchName);
    if (!pushResult.success) {
      throw new Error(`推送分支失败: ${pushResult.error}`);
    }

    console.log(`[WorktreeManager] ✅ 对话分支创建成功: ${branchName}`);

    return {
      branchName,
      worktreePath: worktreeInfo.worktreePath,
    };
  }

  /**
   * 切换用户 worktree 到主分支（只读模式）
   */
  async switchToMainBranch(userId: string): Promise<void> {
    const worktreeInfo = await this.getWorktreeInfo(userId);
    // @ts-ignore - GitService 接受 ICommandExecutor
    const gitService = new GitService(this.executor, worktreeInfo.worktreePath);

    console.log(`[WorktreeManager] 切换到主分支: ${worktreeInfo.mainBranch}`);

    // 丢弃所有变更
    const resetResult = await gitService.resetHard();
    if (!resetResult.success) {
      throw new Error(`丢弃变更失败: ${resetResult.error}`);
    }

    // 切换到主分支
    const checkoutResult = await gitService.checkoutBranch(worktreeInfo.mainBranch);
    if (!checkoutResult.success) {
      throw new Error(`切换分支失败: ${checkoutResult.error}`);
    }

    console.log(`[WorktreeManager] ✅ 已切换到主分支`);
  }

  /**
   * 删除用户的 worktree
   */
  async removeWorktree(userId: string): Promise<void> {
    const worktreePath = this.getUserWorktreePath(userId);

    if (!(await this.worktreeExists(userId))) {
      console.log(`[WorktreeManager] Worktree 不存在，无需删除: ${worktreePath}`);
      return;
    }

    try {
      console.log(`[WorktreeManager] 删除用户 worktree: ${userId}`);

      const result = await this.executor.executeCommand(
        `git worktree remove "${worktreePath}" --force`,
        this.baseRepoPath
      );

      if (result.exitCode !== 0) {
        throw new Error(`删除 worktree 失败: ${result.stderr}`);
      }

      // 从缓存移除
      this.worktreeCache.delete(userId);

      console.log(`[WorktreeManager] ✅ Worktree 删除成功`);
    } catch (error) {
      throw new Error(
        `删除用户 worktree 失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 列出所有 worktree
   */
  async listWorktrees(): Promise<string[]> {
    try {
      const result = await this.executor.executeCommand(
        'git worktree list --porcelain',
        this.baseRepoPath
      );

      const worktrees: string[] = [];
      const lines = result.stdout.split('\n');

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          const worktreePath = line.substring('worktree '.length);
          worktrees.push(worktreePath);
        }
      }

      return worktrees;
    } catch (error) {
      throw new Error(
        `列出 worktree 失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 清理所有用户 worktree（谨慎使用）
   */
  async cleanupAllWorktrees(): Promise<void> {
    console.log(`[WorktreeManager] 清理所有用户 worktree...`);

    const worktrees = await this.listWorktrees();

    for (const worktreePath of worktrees) {
      // 只删除用户 worktree（包含 user- 前缀）
      if (worktreePath.includes('user-')) {
        try {
          await this.executor.executeCommand(
            `git worktree remove "${worktreePath}" --force`,
            this.baseRepoPath
          );
          console.log(`[WorktreeManager] 已删除: ${worktreePath}`);
        } catch (error) {
          console.error(`[WorktreeManager] 删除失败: ${worktreePath}`, error);
        }
      }
    }

    this.worktreeCache.clear();
    console.log(`[WorktreeManager] ✅ 清理完成`);
  }
}
