import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { Pool } from 'pg';
import { userWorkspaces, projects, userProjects, conversations, conversationContexts } from '../db/schema';
import type { UserWorkspace, NewUserWorkspace, Project } from '../db/schema';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * 工作空间管理服务
 * 职责：为用户创建和管理独立的 Git worktree 工作空间
 */
export class WorkspaceManagementService {
  private db: ReturnType<typeof drizzle>;
  private pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.db = drizzle(this.pool);
  }

  /**
   * 获取或创建用户工作空间
   * @param userId 用户 ID
   * @param projectId 项目 ID
   * @returns 工作空间信息
   */
  async getOrCreateWorkspace(userId: string, projectId: string): Promise<UserWorkspace> {
    // 查询现有工作空间
    const existingWorkspaces = await this.db
      .select()
      .from(userWorkspaces)
      .where(
        and(
          eq(userWorkspaces.userId, userId),
          eq(userWorkspaces.projectId, projectId),
          eq(userWorkspaces.status, 'active')
        )
      )
      .limit(1);

    if (existingWorkspaces.length > 0) {
      const workspace = existingWorkspaces[0];
      // 更新最后使用时间
      await this.updateLastUsedTime(workspace.id);
      return workspace;
    }

    // 创建新工作空间
    return await this.createWorkspace(userId, projectId);
  }

  /**
   * 创建新的工作空间
   * @param userId 用户 ID
   * @param projectId 项目 ID
   * @returns 新创建的工作空间
   */
  private async createWorkspace(userId: string, projectId: string): Promise<UserWorkspace> {
    // 获取项目信息
    const projectList = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (projectList.length === 0) {
      throw new Error(`项目不存在：${projectId}`);
    }

    const project = projectList[0];

    // 验证用户已关联该项目
    const userProjectList = await this.db
      .select()
      .from(userProjects)
      .where(
        and(
          eq(userProjects.userId, userId),
          eq(userProjects.projectId, projectId)
        )
      )
      .limit(1);

    if (userProjectList.length === 0) {
      throw new Error(`用户未关联到该项目`);
    }

    // 计算工作空间路径
    const worktreePath = path.join(project.baseWorkDir, 'worktrees', userId);
    
    // 生成临时分支名称
    const worktreeBranch = `worktree/${userId}/${Date.now()}`;

    try {
      // 确保主仓库存在
      const mainRepoPath = path.join(project.baseWorkDir, 'main');
      await this.ensureMainRepository(mainRepoPath, project.gitlabUrl, project.defaultBranch);

      // 创建 Git worktree
      await this.createGitWorktree(mainRepoPath, worktreePath, worktreeBranch, project.defaultBranch);

      // 记录到数据库
      const newWorkspace: NewUserWorkspace = {
        userId,
        projectId,
        worktreePath,
        worktreeBranch,
        status: 'active',
        lastUsedAt: new Date(),
      };

      const createdWorkspaces = await this.db
        .insert(userWorkspaces)
        .values(newWorkspace)
        .returning();

      console.log(`✅ 工作空间创建成功：${worktreePath}`);
      return createdWorkspaces[0];
    } catch (error) {
      console.error(`❌ 创建工作空间失败：`, error);
      throw new Error(`创建工作空间失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 确保主仓库存在
   * @param mainRepoPath 主仓库路径
   * @param gitlabUrl GitLab 地址
   * @param defaultBranch 默认分支
   */
  private async ensureMainRepository(mainRepoPath: string, gitlabUrl: string, defaultBranch: string): Promise<void> {
    try {
      // 检查目录是否存在
      await fs.access(mainRepoPath);
      
      // 检查是否是 Git 仓库
      await execAsync(`git -C "${mainRepoPath}" rev-parse --git-dir`);
      
      // 更新主仓库
      console.log(`📦 更新主仓库：${mainRepoPath}`);
      await execAsync(`git -C "${mainRepoPath}" fetch origin`);
    } catch (error) {
      // 主仓库不存在，创建克隆
      console.log(`📦 克隆主仓库：${gitlabUrl} -> ${mainRepoPath}`);
      const parentDir = path.dirname(mainRepoPath);
      await fs.mkdir(parentDir, { recursive: true });
      await execAsync(`git clone --bare "${gitlabUrl}" "${mainRepoPath}"`);
    }
  }

  /**
   * 创建 Git worktree
   * @param mainRepoPath 主仓库路径
   * @param worktreePath worktree 路径
   * @param worktreeBranch worktree 分支名称
   * @param baseBranch 基础分支
   */
  private async createGitWorktree(
    mainRepoPath: string,
    worktreePath: string,
    worktreeBranch: string,
    baseBranch: string
  ): Promise<void> {
    try {
      // 确保父目录存在
      const parentDir = path.dirname(worktreePath);
      await fs.mkdir(parentDir, { recursive: true });

      // 删除已存在的目录（如果存在）
      try {
        await fs.rm(worktreePath, { recursive: true, force: true });
      } catch (error) {
        // 忽略删除错误
      }

      // 创建 worktree（基于基础分支创建新分支）
      console.log(`🌲 创建 Git worktree：${worktreePath}`);
      await execAsync(
        `git -C "${mainRepoPath}" worktree add -b "${worktreeBranch}" "${worktreePath}" "origin/${baseBranch}"`
      );

      console.log(`✅ Git worktree 创建成功`);
    } catch (error) {
      console.error(`❌ 创建 Git worktree 失败：`, error);
      throw error;
    }
  }

  /**
   * 更新工作空间最后使用时间
   * @param workspaceId 工作空间 ID
   */
  async updateLastUsedTime(workspaceId: string): Promise<void> {
    await this.db
      .update(userWorkspaces)
      .set({ lastUsedAt: new Date() })
      .where(eq(userWorkspaces.id, workspaceId));
  }

  /**
   * 清理工作空间
   * @param workspaceId 工作空间 ID
   * @param userId 用户 ID（用于权限验证）
   */
  async cleanupWorkspace(workspaceId: string, userId: string): Promise<void> {
    // 查询工作空间
    const workspaceList = await this.db
      .select()
      .from(userWorkspaces)
      .where(eq(userWorkspaces.id, workspaceId))
      .limit(1);

    if (workspaceList.length === 0) {
      throw new Error(`工作空间不存在：${workspaceId}`);
    }

    const workspace = workspaceList[0];

    // 验证权限
    if (workspace.userId !== userId) {
      throw new Error(`无权限清理此工作空间`);
    }

    // 检查是否有活跃会话
    const activeConversations = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.workspaceId, workspaceId),
          eq(conversations.status, 'active')
        )
      );

    if (activeConversations.length > 0) {
      throw new Error(`工作空间存在活跃会话，无法清理`);
    }

    // 执行清理
    await this.performCleanup(workspace);

    // 更新状态
    await this.db
      .update(userWorkspaces)
      .set({ status: 'cleanup' })
      .where(eq(userWorkspaces.id, workspaceId));

    console.log(`✅ 工作空间已清理：${workspace.worktreePath}`);
  }

  /**
   * 执行工作空间清理
   * @param workspace 工作空间信息
   */
  private async performCleanup(workspace: UserWorkspace): Promise<void> {
    const { worktreePath, projectId } = workspace;

    try {
      // 获取项目信息以找到主仓库路径
      const projectList = await this.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (projectList.length === 0) {
        console.warn(`项目不存在，跳过 worktree 移除：${projectId}`);
        return;
      }

      const project = projectList[0];
      const mainRepoPath = path.join(project.baseWorkDir, 'main');

      // 移除 Git worktree
      try {
        await execAsync(`git -C "${mainRepoPath}" worktree remove "${worktreePath}" --force`);
        console.log(`✅ Git worktree 已移除：${worktreePath}`);
      } catch (error) {
        console.warn(`⚠️ 移除 Git worktree 失败，尝试手动删除目录：`, error);
        // 手动删除目录
        await fs.rm(worktreePath, { recursive: true, force: true });
      }

      // 清理孤立的 worktree 配置
      try {
        await execAsync(`git -C "${mainRepoPath}" worktree prune`);
      } catch (error) {
        console.warn(`⚠️ 清理 worktree 配置失败：`, error);
      }
    } catch (error) {
      console.error(`❌ 清理工作空间时出错：`, error);
      throw error;
    }
  }

  /**
   * 清理过期工作空间（定时任务）
   * @param daysThreshold 超过多少天未使用视为过期（默认 7 天）
   * @returns 清理统计信息
   */
  async cleanupExpiredWorkspaces(daysThreshold: number = 7): Promise<{ cleaned: number; failed: number }> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - daysThreshold);

    console.log(`🧹 开始清理过期工作空间（超过 ${daysThreshold} 天未使用）...`);

    // 查询过期的工作空间
    const expiredWorkspaces = await this.db
      .select()
      .from(userWorkspaces)
      .where(
        and(
          eq(userWorkspaces.status, 'active'),
          // lastUsedAt < expiryDate 的条件需要手动处理
        )
      );

    // 过滤出真正过期的工作空间
    const reallyExpired = expiredWorkspaces.filter(
      ws => ws.lastUsedAt && ws.lastUsedAt < expiryDate
    );

    let cleaned = 0;
    let failed = 0;

    for (const workspace of reallyExpired) {
      try {
        // 检查是否有活跃会话
        const activeConversations = await this.db
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.workspaceId, workspace.id),
              eq(conversations.status, 'active')
            )
          );

        if (activeConversations.length > 0) {
          console.log(`⏭️ 跳过清理工作空间（有活跃会话）：${workspace.id}`);
          continue;
        }

        // 执行清理
        await this.performCleanup(workspace);

        // 更新状态
        await this.db
          .update(userWorkspaces)
          .set({ status: 'cleanup' })
          .where(eq(userWorkspaces.id, workspace.id));

        cleaned++;
        console.log(`✅ 已清理工作空间：${workspace.worktreePath}`);
      } catch (error) {
        failed++;
        console.error(`❌ 清理工作空间失败：${workspace.id}`, error);
      }
    }

    console.log(`🧹 清理完成：成功 ${cleaned} 个，失败 ${failed} 个`);
    return { cleaned, failed };
  }

  /**
   * 获取用户的工作空间列表
   * @param userId 用户 ID
   * @param projectId 可选的项目 ID 过滤
   * @returns 工作空间列表（包含项目信息）
   */
  async getUserWorkspaces(userId: string, projectId?: string): Promise<any[]> {
    let query = this.db
      .select({
        workspace: userWorkspaces,
        project: projects,
      })
      .from(userWorkspaces)
      .leftJoin(projects, eq(userWorkspaces.projectId, projects.id))
      .where(eq(userWorkspaces.userId, userId));

    // 如果指定了项目 ID，添加过滤
    if (projectId) {
      const results = await query;
      return results.filter(r => r.workspace.projectId === projectId);
    }

    const results = await query;
    
    return results.map(r => ({
      id: r.workspace.id,
      projectId: r.workspace.projectId,
      projectName: r.project?.name || 'Unknown',
      worktreePath: r.workspace.worktreePath,
      worktreeBranch: r.workspace.worktreeBranch,
      status: r.workspace.status,
      lastUsedAt: r.workspace.lastUsedAt,
      createdAt: r.workspace.createdAt,
    }));
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
