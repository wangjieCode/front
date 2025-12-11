import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { projects, userProjects, Project, NewProject, UserProject } from '../db/schema';

/**
 * 创建项目请求
 */
export interface CreateProjectRequest {
  name: string;
  description?: string;
  gitlabUrl: string;
  gitlabToken: string;
  gitlabProjectId: string;
  baseWorkDir: string;
  defaultBranch?: string;
  sshConfig?: any;
  dockerComposeConfig?: any;
  createdBy: string; // 用户ID
}

/**
 * 更新项目请求
 */
export interface UpdateProjectRequest {
  description?: string;
  gitlabUrl?: string;
  gitlabToken?: string;
  gitlabProjectId?: string;
  baseWorkDir?: string;
  defaultBranch?: string;
  sshConfig?: any;
  dockerComposeConfig?: any;
  status?: string;
}

/**
 * 项目查询参数
 */
export interface ProjectQueryParams {
  userId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 项目管理服务
 * 负责项目的创建、配置、关联管理
 */
export class ProjectManagementService {
  private client: postgres.Sql;
  private db: ReturnType<typeof drizzle>;

  constructor(databaseUrl: string) {
    this.client = postgres(databaseUrl);
    this.db = drizzle(this.client);
  }

  /**
   * 创建项目
   */
  async createProject(request: CreateProjectRequest): Promise<Project> {
    try {
      console.log(`[ProjectManagementService] 创建项目: ${request.name}`);

      // 检查项目名称是否已存在
      const existingProjects = await this.db
        .select()
        .from(projects)
        .where(eq(projects.name, request.name))
        .limit(1);

      if (existingProjects.length > 0) {
        throw new Error(`项目名称 "${request.name}" 已存在`);
      }

      // 创建项目
      const newProject: NewProject = {
        name: request.name,
        description: request.description || null,
        gitlabUrl: request.gitlabUrl,
        gitlabToken: request.gitlabToken,
        gitlabProjectId: request.gitlabProjectId,
        baseWorkDir: request.baseWorkDir,
        defaultBranch: request.defaultBranch || 'main',
        sshConfig: request.sshConfig || null,
        dockerComposeConfig: request.dockerComposeConfig || null,
        createdBy: request.createdBy,
      };

      const createdProjects = await this.db
        .insert(projects)
        .values(newProject)
        .returning();

      const project = createdProjects[0];

      // 自动关联创建者到项目
      await this.addUserToProject(project.id, request.createdBy);

      console.log(`[ProjectManagementService] ✅ 项目创建成功: ${project.id}`);
      return project;
    } catch (error) {
      console.error(`[ProjectManagementService] ❌ 创建项目失败:`, error);
      throw error;
    }
  }

  /**
   * 更新项目配置
   */
  async updateProject(
    projectId: string,
    userId: string,
    request: UpdateProjectRequest
  ): Promise<Project> {
    try {
      console.log(`[ProjectManagementService] 更新项目: ${projectId}`);

      // 验证用户是否有权限访问该项目
      const hasAccess = await this.checkUserProjectAccess(userId, projectId);
      if (!hasAccess) {
        throw new Error('无权访问该项目');
      }

      // 更新项目
      const updatedProjects = await this.db
        .update(projects)
        .set({
          ...request,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      if (updatedProjects.length === 0) {
        throw new Error('项目不存在');
      }

      console.log(`[ProjectManagementService] ✅ 项目更新成功: ${projectId}`);
      return updatedProjects[0];
    } catch (error) {
      console.error(`[ProjectManagementService] ❌ 更新项目失败:`, error);
      throw error;
    }
  }

  /**
   * 删除项目（归档）
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    try {
      console.log(`[ProjectManagementService] 删除项目: ${projectId}`);

      // 验证用户是否有权限访问该项目
      const hasAccess = await this.checkUserProjectAccess(userId, projectId);
      if (!hasAccess) {
        throw new Error('无权访问该项目');
      }

      // 归档项目而不是删除
      await this.db
        .update(projects)
        .set({
          status: 'archived',
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));

      console.log(`[ProjectManagementService] ✅ 项目已归档: ${projectId}`);
    } catch (error) {
      console.error(`[ProjectManagementService] ❌ 删除项目失败:`, error);
      throw error;
    }
  }

  /**
   * 获取项目详情
   */
  async getProject(projectId: string, userId?: string): Promise<Project | null> {
    try {
      // 如果提供了用户ID，验证访问权限
      if (userId) {
        const hasAccess = await this.checkUserProjectAccess(userId, projectId);
        if (!hasAccess) {
          throw new Error('无权访问该项目');
        }
      }

      const projectList = await this.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      return projectList.length > 0 ? projectList[0] : null;
    } catch (error) {
      console.error(`[ProjectManagementService] ❌ 获取项目失败:`, error);
      throw error;
    }
  }

  /**
   * 查询用户的项目列表
   */
  async listUserProjects(params: ProjectQueryParams): Promise<{
    projects: Project[];
    total: number;
  }> {
    try {
      const { userId, status, page = 1, pageSize = 20 } = params;

      if (!userId) {
        throw new Error('用户ID不能为空');
      }

      // 查询用户关联的项目ID
      const userProjectList = await this.db
        .select()
        .from(userProjects)
        .where(eq(userProjects.userId, userId));

      const projectIds = userProjectList.map(up => up.projectId);

      if (projectIds.length === 0) {
        return { projects: [], total: 0 };
      }

      // 构建查询条件
      const conditions = [inArray(projects.id, projectIds)];
      if (status) {
        conditions.push(eq(projects.status, status));
      }

      // 查询项目列表
      const projectList = await this.db
        .select()
        .from(projects)
        .where(and(...conditions))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      // 查询总数
      const totalList = await this.db
        .select()
        .from(projects)
        .where(and(...conditions));

      return {
        projects: projectList,
        total: totalList.length,
      };
    } catch (error) {
      console.error(`[ProjectManagementService] ❌ 查询项目列表失败:`, error);
      throw error;
    }
  }

  /**
   * 添加用户到项目
   */
  async addUserToProject(projectId: string, userId: string): Promise<UserProject> {
    try {
      console.log(`[ProjectManagementService] 添加用户到项目: user=${userId}, project=${projectId}`);

      // 检查是否已关联
      const existing = await this.db
        .select()
        .from(userProjects)
        .where(
          and(
            eq(userProjects.userId, userId),
            eq(userProjects.projectId, projectId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        console.log(`[ProjectManagementService] 用户已关联到该项目`);
        return existing[0];
      }

      // 创建关联
      const newUserProjects = await this.db
        .insert(userProjects)
        .values({
          userId,
          projectId,
        })
        .returning();

      console.log(`[ProjectManagementService] ✅ 用户已添加到项目`);
      return newUserProjects[0];
    } catch (error) {
      console.error(`[ProjectManagementService] ❌ 添加用户到项目失败:`, error);
      throw error;
    }
  }

  /**
   * 移除用户与项目的关联
   */
  async removeUserFromProject(projectId: string, userId: string): Promise<void> {
    try {
      console.log(`[ProjectManagementService] 移除用户项目关联: user=${userId}, project=${projectId}`);

      await this.db
        .delete(userProjects)
        .where(
          and(
            eq(userProjects.userId, userId),
            eq(userProjects.projectId, projectId)
          )
        );

      console.log(`[ProjectManagementService] ✅ 用户项目关联已移除`);
    } catch (error) {
      console.error(`[ProjectManagementService] ❌ 移除用户项目关联失败:`, error);
      throw error;
    }
  }

  /**
   * 检查用户是否有权限访问项目
   */
  async checkUserProjectAccess(userId: string, projectId: string): Promise<boolean> {
    try {
      const result = await this.db
        .select()
        .from(userProjects)
        .where(
          and(
            eq(userProjects.userId, userId),
            eq(userProjects.projectId, projectId)
          )
        )
        .limit(1);

      return result.length > 0;
    } catch (error) {
      console.error(`[ProjectManagementService] ❌ 检查项目访问权限失败:`, error);
      return false;
    }
  }

  /**
   * 获取项目的所有关联用户
   */
  async getProjectUsers(projectId: string): Promise<string[]> {
    try {
      const result = await this.db
        .select()
        .from(userProjects)
        .where(eq(userProjects.projectId, projectId));

      return result.map(up => up.userId);
    } catch (error) {
      console.error(`[ProjectManagementService] ❌ 获取项目用户列表失败:`, error);
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    await this.client.end();
  }
}
