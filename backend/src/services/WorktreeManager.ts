import path from 'path';
import { ICommandExecutor } from '../types';

/**
 * Worktree 信息接口
 */
export interface WorktreeInfo {
  userId: string;
  projectId?: string;        // 新增：项目ID（可选）
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
  private getUserWorktreePath(userId: string, projectId?: string): string {
    if (projectId) {
      // 如果有项目ID，使用项目+用户维度
      return path.join(this.worktreeBaseDir, `project-${projectId}`, `user-${userId}`);
    }
    // 保持向后兼容，如果没有项目ID，使用原有的用户维度
    return path.join(this.worktreeBaseDir, `user-${userId}`);
  }

  /**
   * 检查 worktree 是否存在
   */
  async worktreeExists(userId: string, projectId?: string): Promise<boolean> {
    const worktreePath = this.getUserWorktreePath(userId, projectId);
    
    try {
      // 检查目录是否存在
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
   * 为用户创建 worktree
   */
  async createWorktree(
    userId: string,
    baseBranch: string = 'master',
    projectId?: string
  ): Promise<WorktreeInfo> {
    const worktreePath = this.getUserWorktreePath(userId, projectId);
    
    // 检查是否已存在
    if (await this.worktreeExists(userId, projectId)) {
      console.log(`[WorktreeManager] Worktree 已存在: ${worktreePath}`);
      return this.getWorktreeInfo(userId, projectId);
    }

    try {
      console.log(`[WorktreeManager] 创建用户 worktree: ${userId}, 基础分支: ${baseBranch}`);
      
      // 验证分支是否存在，如果不存在尝试切换 'main'/'master'
      let targetBranch = baseBranch;
      try {
        await this.executor.executeCommand(`git rev-parse --verify ${targetBranch}`, this.baseRepoPath);
      } catch (e) {
        console.warn(`[WorktreeManager] 分支 ${targetBranch} 不存在，尝试自动探测默认分支`);
        if (targetBranch === 'master') {
          targetBranch = 'main';
        } else if (targetBranch === 'main') {
          targetBranch = 'master';
        }
        
        // 再次检查
        try {
          await this.executor.executeCommand(`git rev-parse --verify ${targetBranch}`, this.baseRepoPath);
          console.log(`[WorktreeManager] 自动切换到分支: ${targetBranch}`);
        } catch (e2) {
          // 如果还是失败，尝试获取 HEAD 指向的分支
          try {
             const headResult = await this.executor.executeCommand('git symbolic-ref --short HEAD', this.baseRepoPath);
             targetBranch = headResult.stdout.trim();
             console.log(`[WorktreeManager] 使用 HEAD 分支: ${targetBranch}`);
          } catch (e3) {
             throw new Error(`无法找到有效的基础分支: ${baseBranch}`);
          }
        }
      }

      // 创建 worktree 时使用一个临时分支，避免与主仓库冲突
      // 先创建一个临时分支名
      const tempBranchName = `temp-worktree-${userId}-${Date.now()}`;
      
      // 基于目标分支创建临时分支
      await this.executor.executeCommand(
        `git branch ${tempBranchName} ${targetBranch}`,
        this.baseRepoPath
      );

      // 使用临时分支创建 worktree
      const result = await this.executor.executeCommand(
        `git worktree add "${worktreePath}" ${tempBranchName}`,
        this.baseRepoPath
      );

      if (result.exitCode !== 0) {
        // 清理临时分支
        await this.executor.executeCommand(
          `git branch -D ${tempBranchName}`,
          this.baseRepoPath
        ).catch(() => {});
        throw new Error(`创建 worktree 失败: ${result.stderr}`);
      }

      const now = new Date();
      const worktreeInfo: WorktreeInfo = {
        userId,
        projectId,
        worktreePath,
        mainBranch: tempBranchName,  // 使用临时分支作为主分支
        createdAt: now,
        lastUsedAt: now,
      };

      // 缓存 worktree 信息
      const cacheKey = projectId ? `${userId}-${projectId}` : userId;
      this.worktreeCache.set(cacheKey, worktreeInfo);

      console.log(`[WorktreeManager] Worktree 创建成功: ${worktreePath}, 分支: ${tempBranchName}`);
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
  async getWorktreeInfo(userId: string, projectId?: string): Promise<WorktreeInfo> {
    const cacheKey = projectId ? `${userId}-${projectId}` : userId;
    
    // 先从缓存获取
    if (this.worktreeCache.has(cacheKey)) {
      const info = this.worktreeCache.get(cacheKey)!;
      info.lastUsedAt = new Date();
      return info;
    }

    const worktreePath = this.getUserWorktreePath(userId, projectId);
    const exists = await this.worktreeExists(userId, projectId);

    if (!exists) {
      throw new Error(`用户 ${userId} ${projectId ? `项目 ${projectId} 的` : ''} worktree 不存在`);
    }

    // 获取当前分支
    const branchResult = await this.executor.executeCommand(
      'git branch --show-current',
      worktreePath
    );

    const now = new Date();
    const worktreeInfo: WorktreeInfo = {
      userId,
      projectId,
      worktreePath,
      mainBranch: branchResult.stdout.trim(),
      createdAt: now,
      lastUsedAt: now,
    };

    this.worktreeCache.set(cacheKey, worktreeInfo);
    return worktreeInfo;
  }

  /**
   * 获取或创建用户的 worktree
   */
  async getOrCreateWorktree(
    userId: string,
    projectIdOrBaseBranch?: string,
    baseBranch?: string
  ): Promise<WorktreeInfo> {
    // 判断参数：如果第二个参数是 UUID 格式，则认为是 projectId
    const isProjectId = projectIdOrBaseBranch && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectIdOrBaseBranch);
    
    const projectId = isProjectId ? projectIdOrBaseBranch : undefined;
    const actualBaseBranch = isProjectId ? (baseBranch || 'master') : (projectIdOrBaseBranch || 'master');
    
    if (await this.worktreeExists(userId, projectId)) {
      return this.getWorktreeInfo(userId, projectId);
    }
    return this.createWorktree(userId, actualBaseBranch, projectId);
  }

  /**
   * 在用户 worktree 中创建对话分支
   */
  async createConversationBranch(
    userId: string,
    sessionId: string,
    _baseBranch?: string,
    projectId?: string
  ): Promise<{ branchName: string; worktreePath: string }> {
    const worktreeInfo = await this.getOrCreateWorktree(userId, projectId);

    // 生成分支名称
    const shortSessionId = sessionId.substring(0, 8);
    const timestamp = Date.now();
    const branchName = `conversation-${shortSessionId}-${timestamp}`;
    
    console.log(`[WorktreeManager] 创建对话分支: ${branchName}`);
    
    // 检查是否有未提交的变更，只在必要时 stash
    const statusResult = await this.executor.executeCommand(
      'git status --porcelain',
      worktreeInfo.worktreePath
    );
    
    if (statusResult.stdout.trim()) {
      // 有未提交变更，需要 stash
      await this.executor.executeCommand(
        'git stash push -m "auto-stash before creating conversation branch"',
        worktreeInfo.worktreePath
      );
    }

    // 直接创建新分支
    const createResult = await this.executor.executeCommand(
      `git checkout -b ${branchName}`,
      worktreeInfo.worktreePath
    );

    if (createResult.exitCode !== 0) {
      throw new Error(`创建分支失败: ${createResult.stderr}`);
    }

    console.log(`[WorktreeManager] 对话分支创建完成`);

    return {
      branchName,
      worktreePath: worktreeInfo.worktreePath,
    };
  }

  /**
   * 提交所有更改
   */
  async commitChanges(userId: string, message: string, projectId?: string): Promise<void> {
    const worktreeInfo = await this.getWorktreeInfo(userId, projectId);
    
    // 检查是否有变更
    const statusResult = await this.executor.executeCommand(
      'git status --porcelain',
      worktreeInfo.worktreePath
    );

    if (!statusResult.stdout.trim()) {
      return; // 无变更
    }

    // 添加所有更改（忽略 .gitignore 的警告）
    try {
      await this.executor.executeCommand(
        'git add -A',
        worktreeInfo.worktreePath
      );
    } catch (error) {
      // 如果 git add 失败，检查是否有文件被暂存
      const stagedResult = await this.executor.executeCommand(
        'git diff --cached --name-only',
        worktreeInfo.worktreePath
      );
      
      if (!stagedResult.stdout.trim()) {
        console.log(`[WorktreeManager] 没有文件被暂存，跳过提交`);
        return;
      }
    }

    // 提交
    try {
      await this.executor.executeCommand(
        `git commit -m "${message}"`,
        worktreeInfo.worktreePath
      );
      console.log(`[WorktreeManager] 已提交更改: ${message}`);
    } catch (error) {
      console.error(`[WorktreeManager] 提交失败:`, error);
    }
  }

  /**
   * 推送分支
   */
  async pushBranch(userId: string, branchName: string, projectId?: string): Promise<void> {
    const worktreeInfo = await this.getWorktreeInfo(userId, projectId);

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
   * 从当前 HEAD 创建新分支 (保留未提交更改)
   */
  async createBranchFromHead(userId: string, branchName: string, projectId?: string): Promise<void> {
    const worktreeInfo = await this.getWorktreeInfo(userId, projectId);
    
    console.log(`[WorktreeManager] 从当前 HEAD 创建分支: ${branchName}`);

    const result = await this.executor.executeCommand(
      `git checkout -b ${branchName}`,
      worktreeInfo.worktreePath
    );

    if (result.exitCode !== 0) {
      throw new Error(`创建分支失败: ${result.stderr}`);
    }
  }
  /**
   * 同步主仓库最新代码到用户 worktree
   */
  async syncWithMainRepo(userId: string, projectId?: string): Promise<{
    success: boolean;
    updated: boolean;
    conflicts?: string[];
    error?: string;
  }> {
    try {
      const worktreeInfo = await this.getWorktreeInfo(userId, projectId);
      const worktreePath = worktreeInfo.worktreePath;

      console.log(`[WorktreeManager] 同步主仓库代码到用户 worktree: ${userId}`);

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
      const mainBranch = worktreeInfo.mainBranch.startsWith('temp-worktree-') 
        ? 'master' // 如果是临时分支，使用 master 作为上游
        : worktreeInfo.mainBranch;

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
   * 强制重置 worktree 到主分支最新状态（丢弃所有本地更改）
   */
  async resetToMainBranch(userId: string, projectId?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const worktreeInfo = await this.getWorktreeInfo(userId, projectId);
      const worktreePath = worktreeInfo.worktreePath;

      console.log(`[WorktreeManager] 强制重置 worktree 到主分支最新状态: ${userId}`);

      // 1. 拉取最新代码
      await this.executor.executeCommand('git fetch origin', this.baseRepoPath);

      // 2. 获取主分支名
      const mainBranch = worktreeInfo.mainBranch.startsWith('temp-worktree-') 
        ? 'master' 
        : worktreeInfo.mainBranch;

      // 3. 强制重置到远程主分支
      const resetResult = await this.executor.executeCommand(
        `git reset --hard origin/${mainBranch}`,
        worktreePath
      );

      if (resetResult.exitCode !== 0) {
        return {
          success: false,
          error: `重置失败: ${resetResult.stderr}`
        };
      }

      // 4. 清理未跟踪的文件
      await this.executor.executeCommand(
        'git clean -fd',
        worktreePath
      );

      console.log(`[WorktreeManager] ✅ Worktree 已重置到最新状态`);
      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
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
