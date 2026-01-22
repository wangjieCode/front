import path from 'path';
import { ICommandExecutor } from '../types';

/**
 * Worktree 信息接口
 */
export interface WorktreeInfo {
  userId: string;
  sessionId: string;        // 对话ID（每个对话一个 worktree）
  worktreePath: string;
  branchName: string;        // 对话分支名
  createdAt: Date;
  lastUsedAt: Date;
}

/**
 * Worktree 管理器（优化版）
 * 为每个对话创建独立的 Git worktree，去掉分支层级
 * 
 * 新架构：
 * /worktrees/
 *   └── user-{userId}/
 *       ├── conversation-{sessionId1}/   # 对话1的独立 worktree
 *       ├── conversation-{sessionId2}/   # 对话2的独立 worktree
 *       └── conversation-{sessionId3}/   # 对话3的独立 worktree
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
    console.log(`[WorktreeManager] 初始化（优化版 - 每对话一个 worktree）`);
    console.log(`[WorktreeManager] 基础仓库: ${baseRepoPath}`);
    console.log(`[WorktreeManager] Worktree 目录: ${worktreeBaseDir}`);
  }

  /**
   * 获取对话的 worktree 路径
   * 新路径格式: /worktrees/user-{userId}/conversation-{sessionId}
   */
  private getConversationWorktreePath(userId: string, sessionId: string): string {
    return path.join(this.worktreeBaseDir, `user-${userId}`, `conversation-${sessionId}`);
  }

  /**
   * 检查对话 worktree 是否存在
   */
  async conversationWorktreeExists(userId: string, sessionId: string): Promise<boolean> {
    const worktreePath = this.getConversationWorktreePath(userId, sessionId);
    
    try {
      const result = await this.executor.executeCommand(
        `test -d "${worktreePath}" && echo "exists" || echo "not exists"`,
        this.baseRepoPath
      );
      
      return result.stdout.trim() === 'exists';
    } catch (error) {
      console.error(`[WorktreeManager] 检查 worktree 失败:`, error);
      return false;
    }
  }

  /**
   * 为对话创建独立的 worktree 和分支
   * 这是核心方法，替代了原来的 createWorktree + createConversationBranch
   */
  async createConversationWorktree(
    userId: string,
    sessionId: string,
    baseBranch: string = 'master'
  ): Promise<WorktreeInfo> {
    const worktreePath = this.getConversationWorktreePath(userId, sessionId);
    const cacheKey = `${userId}-${sessionId}`;
    
    // 检查是否已存在
    if (await this.conversationWorktreeExists(userId, sessionId)) {
      console.log(`[WorktreeManager] 对话 worktree 已存在: ${worktreePath}`);
      return this.getWorktreeInfo(userId, sessionId);
    }

    try {
      console.log(`[WorktreeManager] 创建对话 worktree: ${sessionId}`);
      console.log(`[WorktreeManager] 用户: ${userId}, 基础分支: ${baseBranch}`);
      
      // 1. 验证基础分支是否存在
      let targetBranch = await this.validateAndGetBaseBranch(baseBranch);
      
      // 2. 生成对话分支名
      const shortSessionId = sessionId.substring(0, 8);
      const timestamp = Date.now();
      const branchName = `conversation-${shortSessionId}-${timestamp}`;
      
      console.log(`[WorktreeManager] 创建分支: ${branchName}`);
      
      // 3. 基于目标分支创建新分支
      await this.executor.executeCommand(
        `git branch ${branchName} ${targetBranch}`,
        this.baseRepoPath
      );

      // 4. 使用新分支创建 worktree
      const result = await this.executor.executeCommand(
        `git worktree add "${worktreePath}" ${branchName}`,
        this.baseRepoPath
      );

      if (result.exitCode !== 0) {
        // 清理分支
        await this.executor.executeCommand(
          `git branch -D ${branchName}`,
          this.baseRepoPath
        ).catch(() => {});
        throw new Error(`创建 worktree 失败: ${result.stderr}`);
      }

      const now = new Date();
      const worktreeInfo: WorktreeInfo = {
        userId,
        sessionId,
        worktreePath,
        branchName,
        createdAt: now,
        lastUsedAt: now,
      };

      // 缓存 worktree 信息
      this.worktreeCache.set(cacheKey, worktreeInfo);

      console.log(`[WorktreeManager] ✅ 对话 worktree 创建成功`);
      console.log(`[WorktreeManager]    路径: ${worktreePath}`);
      console.log(`[WorktreeManager]    分支: ${branchName}`);
      
      return worktreeInfo;
    } catch (error) {
      throw new Error(
        `创建对话 worktree 失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 验证并获取有效的基础分支
   */
  private async validateAndGetBaseBranch(baseBranch: string): Promise<string> {
    let targetBranch = baseBranch;
    
    try {
      await this.executor.executeCommand(
        `git rev-parse --verify ${targetBranch}`, 
        this.baseRepoPath
      );
      return targetBranch;
    } catch (e) {
      console.warn(`[WorktreeManager] 分支 ${targetBranch} 不存在，尝试自动探测默认分支`);
      
      // 尝试切换 master/main
      if (targetBranch === 'master') {
        targetBranch = 'main';
      } else if (targetBranch === 'main') {
        targetBranch = 'master';
      }
      
      // 再次检查
      try {
        await this.executor.executeCommand(
          `git rev-parse --verify ${targetBranch}`, 
          this.baseRepoPath
        );
        console.log(`[WorktreeManager] 自动切换到分支: ${targetBranch}`);
        return targetBranch;
      } catch (e2) {
        // 如果还是失败，尝试获取 HEAD 指向的分支
        try {
          const headResult = await this.executor.executeCommand(
            'git symbolic-ref --short HEAD', 
            this.baseRepoPath
          );
          targetBranch = headResult.stdout.trim();
          console.log(`[WorktreeManager] 使用 HEAD 分支: ${targetBranch}`);
          return targetBranch;
        } catch (e3) {
          throw new Error(`无法找到有效的基础分支: ${baseBranch}`);
        }
      }
    }
  }

  /**
   * 获取对话的 worktree 信息
   */
  async getWorktreeInfo(userId: string, sessionId: string): Promise<WorktreeInfo> {
    const cacheKey = `${userId}-${sessionId}`;
    
    // 先从缓存获取
    if (this.worktreeCache.has(cacheKey)) {
      const info = this.worktreeCache.get(cacheKey)!;
      info.lastUsedAt = new Date();
      return info;
    }

    const worktreePath = this.getConversationWorktreePath(userId, sessionId);
    const exists = await this.conversationWorktreeExists(userId, sessionId);

    if (!exists) {
      throw new Error(`对话 ${sessionId} 的 worktree 不存在`);
    }

    // 获取当前分支
    const branchResult = await this.executor.executeCommand(
      'git branch --show-current',
      worktreePath
    );

    const now = new Date();
    const worktreeInfo: WorktreeInfo = {
      userId,
      sessionId,
      worktreePath,
      branchName: branchResult.stdout.trim(),
      createdAt: now,
      lastUsedAt: now,
    };

    this.worktreeCache.set(cacheKey, worktreeInfo);
    return worktreeInfo;
  }

  /**
   * 同步主仓库最新代码到对话 worktree
   */
  async syncWithMainRepo(
    userId: string,
    sessionId: string,
    mainBranch: string = 'master'
  ): Promise<{
    success: boolean;
    updated: boolean;
    conflicts?: string[];
    error?: string;
  }> {
    try {
      const worktreeInfo = await this.getWorktreeInfo(userId, sessionId);
      const worktreePath = worktreeInfo.worktreePath;

      console.log(`[WorktreeManager] 同步主仓库代码到对话 worktree: ${sessionId}`);

      // 1. 在主仓库中拉取最新代码
      console.log(`[WorktreeManager] 拉取主仓库最新代码...`);
      const fetchResult = await this.executor.executeCommand(
        'git fetch origin',
        this.baseRepoPath
      );

      if (fetchResult.exitCode !== 0) {
        return {
          success: false,
          updated: false,
          error: `拉取主仓库失败: ${fetchResult.stderr}`
        };
      }

      // 2. 获取主分支最新 commit
      const latestCommitResult = await this.executor.executeCommand(
        `git rev-parse origin/${mainBranch}`,
        this.baseRepoPath
      );

      if (latestCommitResult.exitCode !== 0) {
        return {
          success: false,
          updated: false,
          error: `获取主分支最新 commit 失败: ${latestCommitResult.stderr}`
        };
      }

      const latestCommit = latestCommitResult.stdout.trim();

      // 3. 检查 worktree 当前 commit
      const currentCommitResult = await this.executor.executeCommand(
        'git rev-parse HEAD',
        worktreePath
      );

      const currentCommit = currentCommitResult.stdout.trim();

      // 4. 如果已是最新，无需更新
      if (currentCommit === latestCommit) {
        console.log(`[WorktreeManager] Worktree 已是最新代码`);
        return {
          success: true,
          updated: false
        };
      }

      // 5. 检查是否有未提交的更改
      const statusResult = await this.executor.executeCommand(
        'git status --porcelain',
        worktreePath
      );

      const hasUncommittedChanges = statusResult.stdout.trim().length > 0;

      // 6. 如果有未提交更改，先 stash
      if (hasUncommittedChanges) {
        console.log(`[WorktreeManager] 检测到未提交更改，先进行 stash...`);
        const stashResult = await this.executor.executeCommand(
          'git stash push -m "auto-stash before sync"',
          worktreePath
        );

        if (stashResult.exitCode !== 0) {
          return {
            success: false,
            updated: false,
            error: `Stash 失败: ${stashResult.stderr}`
          };
        }
      }

      // 7. 尝试合并最新代码
      console.log(`[WorktreeManager] 合并主分支最新代码...`);
      const mergeResult = await this.executor.executeCommand(
        `git merge origin/${mainBranch} --no-edit`,
        worktreePath
      );

      let conflicts: string[] = [];
      let mergeSuccess = mergeResult.exitCode === 0;

      // 8. 处理合并冲突
      if (!mergeSuccess) {
        console.log(`[WorktreeManager] 检测到合并冲突，获取冲突文件列表...`);
        
        const conflictResult = await this.executor.executeCommand(
          'git diff --name-only --diff-filter=U',
          worktreePath
        );

        if (conflictResult.exitCode === 0) {
          conflicts = conflictResult.stdout.trim().split('\n').filter(f => f.length > 0);
        }

        // 取消合并，回到合并前状态
        await this.executor.executeCommand(
          'git merge --abort',
          worktreePath
        );
      }

      // 9. 恢复 stash（如果之前有 stash）
      if (hasUncommittedChanges && mergeSuccess) {
        console.log(`[WorktreeManager] 恢复之前的未提交更改...`);
        const popResult = await this.executor.executeCommand(
          'git stash pop',
          worktreePath
        );

        if (popResult.exitCode !== 0) {
          console.warn(`[WorktreeManager] 恢复 stash 失败，可能有冲突: ${popResult.stderr}`);
        }
      }

      if (mergeSuccess) {
        console.log(`[WorktreeManager] ✅ 代码同步成功`);
        return {
          success: true,
          updated: true
        };
      } else {
        console.log(`[WorktreeManager] ⚠️ 代码同步失败，存在冲突`);
        return {
          success: false,
          updated: false,
          conflicts,
          error: `合并冲突，需要手动解决。冲突文件: ${conflicts.join(', ')}`
        };
      }

    } catch (error) {
      return {
        success: false,
        updated: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 提交所有更改
   */
  async commitChanges(
    userId: string, 
    sessionId: string, 
    message: string
  ): Promise<void> {
    const worktreeInfo = await this.getWorktreeInfo(userId, sessionId);
    
    console.log(`[WorktreeManager] ========== 开始提交更改 ==========`);
    console.log(`[WorktreeManager] 用户: ${userId}`);
    console.log(`[WorktreeManager] 会话: ${sessionId}`);
    console.log(`[WorktreeManager] 工作目录: ${worktreeInfo.worktreePath}`);
    console.log(`[WorktreeManager] 提交信息: ${message}`);
    
    // 检查是否有变更
    const statusResult = await this.executor.executeCommand(
      'git status --porcelain',
      worktreeInfo.worktreePath
    );

    console.log(`[WorktreeManager] Git 状态输出:\n${statusResult.stdout}`);

    if (!statusResult.stdout.trim()) {
      console.log(`[WorktreeManager] 没有变更，跳过提交`);
      return; // 无变更
    }

    // 添加所有更改
    console.log(`[WorktreeManager] 执行: git add .`);
    const addResult = await this.executor.executeCommand(
      'git add .',
      worktreeInfo.worktreePath
    );
    
    if (addResult.exitCode !== 0) {
      console.error(`[WorktreeManager] ❌ git add 失败`);
      console.error(`[WorktreeManager] exitCode:`, addResult.exitCode);
      console.error(`[WorktreeManager] stdout:`, addResult.stdout);
      console.error(`[WorktreeManager] stderr:`, addResult.stderr);
      
      // 检查是否有文件被暂存
      const stagedResult = await this.executor.executeCommand(
        'git diff --cached --name-only',
        worktreeInfo.worktreePath
      );
      
      console.log(`[WorktreeManager] 已暂存的文件:\n${stagedResult.stdout}`);
      
      if (!stagedResult.stdout.trim()) {
        console.log(`[WorktreeManager] 没有文件被暂存，跳过提交`);
        return;
      }
    } else {
      console.log(`[WorktreeManager] git add 成功`);
      if (addResult.stdout) console.log(`[WorktreeManager] stdout: ${addResult.stdout}`);
      if (addResult.stderr) console.log(`[WorktreeManager] stderr: ${addResult.stderr}`);
    }

    // 再次检查暂存状态
    const finalStagedResult = await this.executor.executeCommand(
      'git diff --cached --name-only',
      worktreeInfo.worktreePath
    );
    console.log(`[WorktreeManager] 最终暂存的文件:\n${finalStagedResult.stdout}`);

    if (!finalStagedResult.stdout.trim()) {
      console.log(`[WorktreeManager] 没有文件被暂存，跳过提交`);
      return;
    }

    // 提交
    console.log(`[WorktreeManager] 执行: git commit -m "${message}"`);
    const commitResult = await this.executor.executeCommand(
      `git commit -m "${message}"`,
      worktreeInfo.worktreePath
    );
    
    if (commitResult.exitCode !== 0) {
      console.error(`[WorktreeManager] ❌ 提交失败`);
      console.error(`[WorktreeManager] exitCode:`, commitResult.exitCode);
      console.error(`[WorktreeManager] stdout:`, commitResult.stdout);
      console.error(`[WorktreeManager] stderr:`, commitResult.stderr);
      console.log(`[WorktreeManager] ========== 提交失败 ==========`);
    } else {
      console.log(`[WorktreeManager] ✅ 提交成功: ${message}`);
      if (commitResult.stdout) console.log(`[WorktreeManager] stdout: ${commitResult.stdout}`);
      console.log(`[WorktreeManager] ========== 提交完成 ==========`);
    }
  }

  /**
   * 推送分支
   */
  async pushBranch(
    userId: string, 
    sessionId: string
  ): Promise<void> {
    const worktreeInfo = await this.getWorktreeInfo(userId, sessionId);
    const branchName = worktreeInfo.branchName;

    console.log(`[WorktreeManager] 推送分支: ${branchName}`);
    
    const result = await this.executor.executeCommand(
      `git push origin ${branchName}`,
      worktreeInfo.worktreePath
    );

    if (result.exitCode !== 0) {
       // 尝试 set-upstream
       const upstreamResult = await this.executor.executeCommand(
        `git push --set-upstream origin ${branchName}`,
        worktreeInfo.worktreePath
      );
      
      if (upstreamResult.exitCode !== 0) {
        throw new Error(`推送分支失败: ${upstreamResult.stderr}`);
      }
    }
  }

  /**
   * 删除对话的 worktree
   */
  async removeConversationWorktree(userId: string, sessionId: string): Promise<void> {
    const worktreePath = this.getConversationWorktreePath(userId, sessionId);

    if (!(await this.conversationWorktreeExists(userId, sessionId))) {
      console.log(`[WorktreeManager] Worktree 不存在，无需删除: ${worktreePath}`);
      return;
    }

    try {
      console.log(`[WorktreeManager] 删除对话 worktree: ${sessionId}`);

      // 获取分支名（用于后续删除分支）
      let branchName: string | undefined;
      try {
        const worktreeInfo = await this.getWorktreeInfo(userId, sessionId);
        branchName = worktreeInfo.branchName;
      } catch (e) {
        // 如果获取失败，继续删除 worktree
      }

      // 删除 worktree
      const result = await this.executor.executeCommand(
        `git worktree remove "${worktreePath}" --force`,
        this.baseRepoPath
      );

      if (result.exitCode !== 0) {
        throw new Error(`删除 worktree 失败: ${result.stderr}`);
      }

      // 删除分支
      if (branchName) {
        try {
          await this.executor.executeCommand(
            `git branch -D ${branchName}`,
            this.baseRepoPath
          );
          console.log(`[WorktreeManager] 已删除分支: ${branchName}`);
        } catch (e) {
          console.warn(`[WorktreeManager] 删除分支失败: ${branchName}`, e);
        }
      }

      // 从缓存移除
      const cacheKey = `${userId}-${sessionId}`;
      this.worktreeCache.delete(cacheKey);

      console.log(`[WorktreeManager] ✅ Worktree 删除成功`);
    } catch (error) {
      throw new Error(
        `删除对话 worktree 失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 列出用户的所有对话 worktree
   */
  async listUserWorktrees(userId: string): Promise<string[]> {
    try {
      const userWorktreeDir = path.join(this.worktreeBaseDir, `user-${userId}`);
      
      const result = await this.executor.executeCommand(
        `find "${userWorktreeDir}" -maxdepth 1 -type d -name "conversation-*" 2>/dev/null || true`,
        this.baseRepoPath
      );

      const worktrees = result.stdout
        .split('\n')
        .filter(line => line.trim().length > 0);

      return worktrees;
    } catch (error) {
      console.error(`[WorktreeManager] 列出用户 worktree 失败:`, error);
      return [];
    }
  }

  /**
   * 清理用户的所有 worktree（谨慎使用）
   */
  async cleanupUserWorktrees(userId: string): Promise<void> {
    console.log(`[WorktreeManager] 清理用户所有 worktree: ${userId}`);

    const worktrees = await this.listUserWorktrees(userId);

    for (const worktreePath of worktrees) {
      try {
        // 提取 sessionId
        const sessionId = path.basename(worktreePath).replace('conversation-', '');
        
        await this.removeConversationWorktree(userId, sessionId);
        console.log(`[WorktreeManager] 已删除: ${worktreePath}`);
      } catch (error) {
        console.error(`[WorktreeManager] 删除失败: ${worktreePath}`, error);
      }
    }

    console.log(`[WorktreeManager] ✅ 清理完成`);
  }

  /**
   * 列出所有 worktree（用于调试）
   */
  async listAllWorktrees(): Promise<string[]> {
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
   * 清理已归档对话的 worktree
   * @param archivedSessionIds 已归档的对话 ID 列表
   * @param userId 用户 ID
   * @returns 清理结果
   */
  async cleanupArchivedWorktrees(
    archivedSessionIds: string[],
    userId: string
  ): Promise<{
    success: boolean;
    cleaned: number;
    failed: number;
    errors: string[];
  }> {
    let cleaned = 0;
    let failed = 0;
    const errors: string[] = [];

    console.log(`[WorktreeManager] 开始清理 ${archivedSessionIds.length} 个归档对话的 worktree`);

    for (const sessionId of archivedSessionIds) {
      try {
        await this.removeConversationWorktree(userId, sessionId);
        cleaned++;
        console.log(`[WorktreeManager] ✅ 已清理归档对话 worktree: ${sessionId}`);
      } catch (error) {
        failed++;
        const errorMsg = `清理 ${sessionId} 失败: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.error(`[WorktreeManager] ❌ ${errorMsg}`);
      }
    }

    console.log(`[WorktreeManager] 清理完成: 成功 ${cleaned}, 失败 ${failed}`);

    return {
      success: failed === 0,
      cleaned,
      failed,
      errors,
    };
  }
}
