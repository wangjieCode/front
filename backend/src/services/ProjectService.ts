import { eq, and } from 'drizzle-orm';
import { DatabaseManager } from '../db/DatabaseManager';
import { projects, type Project, type NewProject } from '../db/schema';
import { ProjectConfigLoader, type ProjectConfig } from './ProjectConfigLoader';

/**
 * 项目配置状态
 */
export enum ProjectConfigStatus {
  COMPLETE = 'complete',
  INCOMPLETE = 'incomplete',
  ERROR = 'error',
}

/**
 * 项目信息（含配置状态）
 */
export interface ProjectWithStatus extends Project {
  configStatus: ProjectConfigStatus;
}

/**
 * 项目管理服务
 * 处理项目配置和验证
 */
export class ProjectService {
  /**
   * 获取所有激活的项目列表
   * @returns 项目列表（含配置状态）
   */
  async getAvailableProjects(): Promise<ProjectWithStatus[]> {
    const db = DatabaseManager.getDb();

    const projectList = await db
      .select()
      .from(projects)
      .where(eq(projects.isActive, true))
      .orderBy(projects.createdAt);

    // 为每个项目检查配置状态
    const projectsWithStatus: ProjectWithStatus[] = projectList.map((project) => {
      let configStatus: ProjectConfigStatus;

      // 跳过默认项目的配置检查
      if (project.projectKey === 'DEFAULT') {
        configStatus = ProjectConfigStatus.INCOMPLETE;
      } else {
        try {
          ProjectConfigLoader.loadConfig(project.projectKey);
          configStatus = ProjectConfigStatus.COMPLETE;
        } catch (error) {
          console.warn(`[ProjectService] 项目 ${project.projectKey} 配置不完整:`, error);
          configStatus = ProjectConfigStatus.INCOMPLETE;
        }
      }

      return {
        ...project,
        configStatus,
      };
    });

    return projectsWithStatus;
  }

  /**
   * 获取项目配置
   * @param projectKey 项目标识键
   * @returns 项目配置对象
   * @throws {Error} 如果配置不完整
   */
  async getProjectConfig(projectKey: string): Promise<ProjectConfig> {
    return ProjectConfigLoader.loadConfig(projectKey);
  }

  /**
   * 验证项目配置完整性
   * @param projectKey 项目标识键
   * @returns 是否配置完整
   */
  validateProjectConfig(projectKey: string): boolean {
    return ProjectConfigLoader.validateConfig(projectKey);
  }

  /**
   * 创建项目
   * @param projectData 项目数据
   * @returns 创建的项目
   */
  async createProject(projectData: Omit<NewProject, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const db = DatabaseManager.getDb();

    const newProject: NewProject = {
      ...projectData,
      isActive: projectData.isActive ?? true,
    };

    const insertedProjects = await db
      .insert(projects)
      .values(newProject)
      .returning();

    console.log(`[ProjectService] 创建项目: ${projectData.projectKey}`);
    return insertedProjects[0];
  }

  /**
   * 更新项目
   * @param projectId 项目 ID
   * @param projectData 更新的数据
   * @returns 更新后的项目
   */
  async updateProject(
    projectId: string,
    projectData: Partial<Omit<Project, 'id' | 'createdAt'>>
  ): Promise<Project | null> {
    const db = DatabaseManager.getDb();

    const updatedProjects = await db
      .update(projects)
      .set({
        ...projectData,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    if (updatedProjects.length === 0) {
      return null;
    }

    console.log(`[ProjectService] 更新项目: ${projectId}`);
    return updatedProjects[0];
  }

  /**
   * 停用项目（软删除）
   * @param projectId 项目 ID
   * @returns 是否成功
   */
  async deactivateProject(projectId: string): Promise<boolean> {
    const updated = await this.updateProject(projectId, { isActive: false });
    return updated !== null;
  }

  /**
   * 激活项目
   * @param projectId 项目 ID
   * @returns 是否成功
   */
  async activateProject(projectId: string): Promise<boolean> {
    const updated = await this.updateProject(projectId, { isActive: true });
    return updated !== null;
  }

  /**
   * 删除项目（硬删除）
   * 会同时清理该项目的所有对话和 Worktree
   * @param projectId 项目 ID
   * @returns 是否成功
   */
  async deleteProject(projectId: string): Promise<boolean> {
    const db = DatabaseManager.getDb();

    try {
      const project = await this.getProjectById(projectId);
      if (!project) {
        console.error(`[ProjectService] 项目不存在: ${projectId}`);
        return false;
      }

      const { conversations } = await import('../db/schema');
      const projectConversations = await db
        .select()
        .from(conversations)
        .where(eq(conversations.projectId, projectId));

      console.log(`[ProjectService] 找到 ${projectConversations.length} 个相关对话需要清理`);

      // 获取该项目的所有用户（去重）
      const uniqueUserIds = [...new Set(projectConversations.map(c => c.userId).filter(Boolean))];
      console.log(`[ProjectService] 找到 ${uniqueUserIds.length} 个用户需要清理 Worktree`);

      const { GitWorktreeService } = await import('./GitWorktreeService');
      const { LocalExecutor } = await import('./LocalExecutor');
      const { SSHExecutor } = await import('./SSHExecutor');
      const { users } = await import('../db/schema');
      
      const runMode = process.env.RUN_MODE || 'local';
      let executor;
      
      if (runMode === 'local') {
        executor = new LocalExecutor();
      } else {
        const { loadSSHConfig } = await import('../utils/config');
        const sshConfig = loadSSHConfig();
        executor = new SSHExecutor();
        await executor.connect(sshConfig);
      }

      const worktreeService = new GitWorktreeService(executor);

      // 按用户清理 Worktree
      for (const userId of uniqueUserIds) {
        try {
          const user = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.id, userId),
          });

          if (user) {
            const worktreePath = GitWorktreeService.generateWorktreePath(
              project.worktreeBaseDir,
              user.username
            );

            console.log(`[ProjectService] 清理用户 ${user.username} 的 Worktree: ${worktreePath}`);
            await worktreeService.removeWorktree(
              project.repoDir,
              worktreePath,
              true
            );
          }
        } catch (error) {
          console.error(`[ProjectService] 清理用户 Worktree 失败:`, error);
        }
      }

      // 删除所有对话记录
      for (const conversation of projectConversations) {
        try {
          await db
            .delete(conversations)
            .where(eq(conversations.id, conversation.id));
          console.log(`[ProjectService] 删除对话: ${conversation.id}`);
        } catch (error) {
          console.error(`[ProjectService] 删除对话失败:`, error);
        }
      }

      const deletedProjects = await db
        .delete(projects)
        .where(eq(projects.id, projectId))
        .returning();

      if (deletedProjects.length === 0) {
        return false;
      }

      console.log(`[ProjectService] ✅ 项目删除成功: ${projectId}`);
      return true;
    } catch (error) {
      console.error(`[ProjectService] ❌ 删除项目失败:`, error);
      return false;
    }
  }

  /**
   * 通过项目 ID 获取项目
   * @param projectId 项目 ID
   * @returns 项目信息
   */
  async getProjectById(projectId: string): Promise<Project | null> {
    const db = DatabaseManager.getDb();

    const result = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * 通过项目 Key 获取项目
   * @param projectKey 项目标识键
   * @returns 项目信息
   */
  async getProjectByKey(projectKey: string): Promise<Project | null> {
    const db = DatabaseManager.getDb();

    const result = await db
      .select()
      .from(projects)
      .where(eq(projects.projectKey, projectKey))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * 同步环境变量中的项目到数据库
   * 用于系统启动时自动初始化项目
   */
  async syncProjectsFromEnv(): Promise<void> {
    const configs = ProjectConfigLoader.loadAllConfigs();

    for (const config of configs) {
      try {
        // 检查项目是否已存在
        const existing = await this.getProjectByKey(config.projectKey);

        if (!existing) {
          // 创建新项目
          await this.createProject({
            projectKey: config.projectKey,
            projectName: config.projectKey.replace(/_/g, ' '), // 默认名称
            description: `自动创建的项目: ${config.projectKey}`,
            repoDir: config.repoDir,
            worktreeBaseDir: config.worktreeBaseDir,
            gitDefaultBranch: config.gitDefaultBranch,
            dockerHost: config.dockerConfig?.sshHost,
          });

          console.log(`[ProjectService] ✅ 同步项目: ${config.projectKey}`);
        } else {
          // 更新现有项目的配置
          await this.updateProject(existing.id, {
            repoDir: config.repoDir,
            worktreeBaseDir: config.worktreeBaseDir,
            gitDefaultBranch: config.gitDefaultBranch,
            dockerHost: config.dockerConfig?.sshHost,
          });

          console.log(`[ProjectService] 🔄 更新项目: ${config.projectKey}`);
        }
      } catch (error) {
        console.error(`[ProjectService] ❌ 同步项目 ${config.projectKey} 失败:`, error);
      }
    }
  }
}
