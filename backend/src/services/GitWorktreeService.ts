import { ICommandExecutor } from '../types';

/**
 * Git Worktree 操作结果接口
 */
export interface WorktreeOperationResult {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
}

/**
 * Worktree 信息接口
 */
export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
}

/**
 * Git Worktree 管理服务
 * 负责 Worktree 的创建、删除和维护
 */
export class GitWorktreeService {
  constructor(private executor: ICommandExecutor) {}

  /**
   * 创建新的 Worktree
   * @param repoDir Git 主仓库目录
   * @param worktreePath Worktree 路径
   * @param branchName 分支名称
   * @param baseBranch 基础分支（从哪个分支创建）
   * @param maxRetries 最大重试次数
   * @returns 操作结果
   */
  async createWorktree(
    repoDir: string,
    worktreePath: string,
    branchName: string,
    baseBranch: string = 'main',
    maxRetries: number = 3
  ): Promise<WorktreeOperationResult> {
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;

      try {
        // 检查 worktree 路径是否已存在
        const existsResult = await this.executor.executeCommand(
          `test -d "${worktreePath}" && echo "exists" || echo "not_exists"`
        );

        if (existsResult.stdout.trim() === 'exists') {
          console.log(`[GitWorktreeService] Worktree 路径已存在，尝试清理: ${worktreePath}`);
          // 尝试清理旧的 worktree
          await this.removeWorktree(repoDir, worktreePath, true);
        }

        // 确保父目录存在
        const parentDir = worktreePath.substring(0, worktreePath.lastIndexOf('/'));
        await this.executor.executeCommand(`mkdir -p "${parentDir}"`);

        // 创建 worktree
        // 使用 -B 选项：如果分支已存在则重置，否则创建新分支
        const createCommand = `cd "${repoDir}" && git worktree add "${worktreePath}" -B "${branchName}" "${baseBranch}"`;
        const result = await this.executor.executeCommand(createCommand);

        if (result.exitCode === 0) {
          console.log(`[GitWorktreeService] ✅ Worktree 创建成功: ${worktreePath}`);
          return {
            success: true,
            message: `成功创建 Worktree: ${worktreePath}`,
            output: result.stdout,
          };
        } else {
          console.error(`[GitWorktreeService] ❌ Worktree 创建失败 (尝试 ${attempt}/${maxRetries}):`, result.stderr);
          
          if (attempt < maxRetries) {
            // 等待一段时间后重试
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }

          return {
            success: false,
            message: `创建 Worktree 失败`,
            error: result.stderr,
          };
        }
      } catch (error) {
        console.error(`[GitWorktreeService] ❌ 创建 Worktree 异常 (尝试 ${attempt}/${maxRetries}):`, error);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        return {
          success: false,
          message: '创建 Worktree 时发生异常',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return {
      success: false,
      message: `创建 Worktree 失败，已重试 ${maxRetries} 次`,
    };
  }

  /**
   * 删除 Worktree
   * @param repoDir Git 主仓库目录
   * @param worktreePath Worktree 路径
   * @param force 是否强制删除
   * @returns 操作结果
   */
  async removeWorktree(
    repoDir: string,
    worktreePath: string,
    force: boolean = false
  ): Promise<WorktreeOperationResult> {
    try {
      const forceFlag = force ? '--force' : '';
      const removeCommand = `cd "${repoDir}" && git worktree remove ${forceFlag} "${worktreePath}"`;
      const result = await this.executor.executeCommand(removeCommand);

      if (result.exitCode === 0) {
        console.log(`[GitWorktreeService] ✅ Worktree 删除成功: ${worktreePath}`);
        return {
          success: true,
          message: `成功删除 Worktree: ${worktreePath}`,
          output: result.stdout,
        };
      } else {
        // 如果删除失败，尝试手动删除目录
        if (force) {
          console.log(`[GitWorktreeService] Git 删除失败，尝试手动删除目录`);
          const rmResult = await this.executor.executeCommand(`rm -rf "${worktreePath}"`);
          if (rmResult.exitCode === 0) {
            // 手动删除后，执行 prune 清理 git 记录
            await this.pruneWorktrees(repoDir);
            return {
              success: true,
              message: `强制删除 Worktree 目录: ${worktreePath}`,
            };
          }
        }

        return {
          success: false,
          message: `删除 Worktree 失败: ${worktreePath}`,
          error: result.stderr,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '删除 Worktree 时发生异常',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 列出所有 Worktree
   * @param repoDir Git 主仓库目录
   * @returns Worktree 列表
   */
  async listWorktrees(repoDir: string): Promise<WorktreeInfo[]> {
    try {
      const result = await this.executor.executeCommand(
        `cd "${repoDir}" && git worktree list --porcelain`
      );

      if (result.exitCode !== 0) {
        console.error(`[GitWorktreeService] 列出 Worktree 失败:`, result.stderr);
        return [];
      }

      const worktrees: WorktreeInfo[] = [];
      const lines = result.stdout.split('\n');
      let currentWorktree: Partial<WorktreeInfo> = {};

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (currentWorktree.path) {
            worktrees.push(currentWorktree as WorktreeInfo);
          }
          currentWorktree = { path: line.substring(9).trim() };
        } else if (line.startsWith('branch ')) {
          currentWorktree.branch = line.substring(7).trim();
        } else if (line.startsWith('HEAD ')) {
          currentWorktree.commit = line.substring(5).trim();
        } else if (line.trim() === '') {
          if (currentWorktree.path) {
            worktrees.push(currentWorktree as WorktreeInfo);
            currentWorktree = {};
          }
        }
      }

      if (currentWorktree.path) {
        worktrees.push(currentWorktree as WorktreeInfo);
      }

      return worktrees;
    } catch (error) {
      console.error(`[GitWorktreeService] 列出 Worktree 异常:`, error);
      return [];
    }
  }

  /**
   * 清理无效的 Worktree 引用
   * @param repoDir Git 主仓库目录
   * @returns 操作结果
   */
  async pruneWorktrees(repoDir: string): Promise<WorktreeOperationResult> {
    try {
      const result = await this.executor.executeCommand(
        `cd "${repoDir}" && git worktree prune`
      );

      if (result.exitCode === 0) {
        return {
          success: true,
          message: '成功清理无效的 Worktree 引用',
          output: result.stdout,
        };
      } else {
        return {
          success: false,
          message: '清理 Worktree 引用失败',
          error: result.stderr,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '清理 Worktree 引用时发生异常',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 检查 Worktree 是否存在
   * @param worktreePath Worktree 路径
   * @returns 是否存在
   */
  async worktreeExists(worktreePath: string): Promise<boolean> {
    try {
      const result = await this.executor.executeCommand(
        `test -d "${worktreePath}" && echo "exists" || echo "not_exists"`
      );
      return result.stdout.trim() === 'exists';
    } catch (error) {
      return false;
    }
  }

  /**
   * 生成 Worktree 路径
   * @param baseDir Worktree 基础目录
   * @param username 用户名
   * @param conversationId 对话 ID
   * @returns Worktree 路径
   */
  static generateWorktreePath(
    baseDir: string,
    username: string,
    conversationId: string
  ): string {
    return `${baseDir}/${username}/${conversationId}`;
  }

  /**
   * 生成分支名称
   * @param username 用户名
   * @param conversationId 对话 ID
   * @returns 分支名称
   */
  static generateBranchName(username: string, conversationId: string): string {
    // 格式: {username}-conversation-{conversationId前8位}-{时间戳}
    const shortId = conversationId.substring(0, 8);
    const timestamp = Date.now();
    return `${username}-conversation-${shortId}-${timestamp}`;
  }
}
