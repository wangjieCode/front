import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc } from 'drizzle-orm';
import { DatabaseManager } from '../db/DatabaseManager';
import { projects, projectMembers, users } from '../db/schema';
import {
  OperationResult,
  ValidationResult,
} from '../types';
import { GitOperationError, ValidationError } from '../errors/CustomErrors';
import { RepositoryService, CloneProgressCallback } from './RepositoryService';
import { ICommandExecutor } from '../types';

// 从schema导出类型
type Project = typeof projects.$inferSelect;
type NewProject = typeof projects.$inferInsert;
type ProjectMember = typeof projectMembers.$inferSelect;
type NewProjectMember = typeof projectMembers.$inferInsert;
type User = typeof users.$inferSelect;

/**
 * 项目成员角色枚举
 */
export enum MemberRole {
  OWNER = 'owner',    // 项目所有者：所有权限
  ADMIN = 'admin',    // 管理员：管理成员、修改项目
  MEMBER = 'member'   // 成员：查看项目、创建对话
}

/**
 * 创建项目请求接口
 */
export interface CreateProjectRequest {
  name: string;
  description?: string;
  gitRepositoryUrl: string;
  gitBranch?: string;
  gitlabProjectId?: string;
  gitlabUrl?: string;
  workDirectory?: string;
}

/**
 * 更新项目请求接口
 */
export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  gitRepositoryUrl?: string;
  gitBranch?: string;
  gitlabProjectId?: string;
  gitlabUrl?: string;
  workDirectory?: string;
  isActive?: boolean;
}

/**
 * 项目过滤器接口
 */
export interface ProjectFilters {
  isActive?: boolean;
  search?: string; // 搜索项目名称或描述
}

/**
 * 添加成员请求接口
 */
export interface AddMemberRequest {
  userId: string;
  role: MemberRole;
}

/**
 * 项目结果接口
 */
export interface ProjectResult extends OperationResult {
  project?: Project;
}

/**
 * 项目列表结果接口
 */
export interface ProjectListResult extends OperationResult {
  projects?: Project[];
  total?: number;
}

/**
 * 成员列表结果接口
 */
export interface MemberListResult extends OperationResult {
  members?: (ProjectMember & { user: User })[];
}

/**
 * 权限验证结果接口
 */
export interface PermissionResult {
  hasPermission: boolean;
  memberRole?: MemberRole;
  isOwner: boolean;
}

/**
 * 项目服务类
 * 负责项目的CRUD操作、成员管理和权限控制
 */
export class ProjectService {
  private db = DatabaseManager.getDb();
  private repositoryService: RepositoryService;

  constructor(
    private executor: ICommandExecutor
  ) {
    this.repositoryService = new RepositoryService(executor);
  }

  /**
   * 创建项目
   * @param data 项目数据
   * @param userId 创建者用户ID
   * @returns 创建结果
   */
  async createProject(data: CreateProjectRequest, userId: string): Promise<ProjectResult> {
    try {
      // 验证输入
      const validation = await this.validateCreateProjectData(data, userId);
      if (!validation.allowed) {
        return {
          success: false,
          error: validation.reason || '数据验证失败',
          message: validation.reason || '数据验证失败',
        };
      }

      // 生成工作目录（如果未提供）
      const workDirectory = data.workDirectory || this.generateWorkDirectory(data.name, data.gitRepositoryUrl);

      // 创建项目记录
      const newProject: NewProject = {
        id: uuidv4(),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        repoDir: workDirectory,
        gitBranch: 'master', // 固定为master
        isActive: true,
        createdBy: userId,
        gitRepositoryUrl: data.gitRepositoryUrl.trim(),
        gitlabProjectId: data.gitlab?.projectId?.trim() || null,
        gitlabUrl: data.gitlab?.url?.trim() || 'https://gitlab.com',
        workDirectory,
        ownerId: userId,
      };

      const [project] = await this.db.insert(projects).values(newProject).returning();

      // 添加创建者为项目所有者
      await this.addMember(project.id, userId, MemberRole.OWNER);

      // 异步触发仓库克隆（如果RepositoryService可用）
      if (this.repositoryService) {
        setImmediate(async () => {
          try {
            console.log(`[ProjectService] 开始为项目 ${project.id} 克隆仓库`);
            console.log(`[ProjectService] 仓库URL: ${project.gitRepositoryUrl}`);
            console.log(`[ProjectService] 工作目录: ${project.workDirectory}`);
            
            const result = await this.repositoryService.cloneRepository(project, (progress) => {
              console.log(`[ProjectService] 克隆进度 [${progress.stage}]: ${progress.message} (${progress.progress || 0}%)`);
            });
            
            if (result.success) {
              console.log(`[ProjectService] ✅ 项目 ${project.id} 仓库克隆完成`);
              console.log(`[ProjectService] 克隆结果:`, result);
            } else {
              console.error(`[ProjectService] ❌ 项目 ${project.id} 仓库克隆失败:`, result.error);
            }
          } catch (error) {
            console.error(`[ProjectService] ❌ 项目 ${project.id} 仓库克隆异常:`, error);
            console.error(`[ProjectService] 错误堆栈:`, error.stack);
            // 克隆失败不影响项目创建，只记录错误
          }
        });
      } else {
        console.warn(`[ProjectService] ⚠️ RepositoryService 未初始化，跳过仓库克隆`);
      }

      return {
        success: true,
        message: '项目创建成功',
        project,
      };
    } catch (error) {
      console.error('创建项目失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建项目失败',
        message: error instanceof Error ? error.message : '创建项目失败',
      };
    }
  }

  /**
   * 获取用户项目列表
   * @param userId 用户ID
   * @param filters 过滤条件
   * @returns 项目列表
   */
  async getProjects(userId: string, filters?: ProjectFilters): Promise<ProjectListResult> {
    try {
      // 构建查询条件
      const conditions = [
        eq(projectMembers.userId, userId),
      ];

      if (filters?.isActive !== undefined) {
        conditions.push(eq(projects.isActive, filters.isActive));
      }

      if (filters?.search) {
        // 这里可以使用 ILIKE 或其他搜索方式，暂时简化处理
        // 实际实现中应该使用数据库的全文搜索功能
      }

      // 查询用户有权限访问的项目
      const userProjects = await this.db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          gitRepositoryUrl: projects.gitRepositoryUrl,
          gitBranch: projects.gitBranch,
          gitlabProjectId: projects.gitlabProjectId,
          gitlabUrl: projects.gitlabUrl,
          workDirectory: projects.workDirectory,
          ownerId: projects.ownerId,
          isActive: projects.isActive,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
        })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(and(...conditions))
        .orderBy(desc(projects.createdAt));

      // 如果有搜索条件，进行内存过滤（实际项目中应该使用数据库搜索）
      let filteredProjects = userProjects;
      if (filters?.search) {
        const searchTerm = filters.search.toLowerCase();
        filteredProjects = userProjects.filter((project: Project) =>
          project.name.toLowerCase().includes(searchTerm) ||
          (project.description && project.description.toLowerCase().includes(searchTerm))
        );
      }

      return {
        success: true,
        message: '获取项目列表成功',
        projects: filteredProjects,
        total: filteredProjects.length,
      };
    } catch (error) {
      console.error('获取项目列表失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取项目列表失败',
      };
    }
  }

  /**
   * 获取项目详情
   * @param projectId 项目ID
   * @param userId 用户ID
   * @returns 项目详情
   */
  async getProject(projectId: string, userId: string): Promise<ProjectResult> {
    try {
      // 验证用户权限
      const permission = await this.checkPermission(projectId, userId, MemberRole.MEMBER);
      if (!permission.hasPermission) {
        return {
          success: false,
          error: '无权限访问该项目',
        };
      }

      const [project] = await this.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return {
          success: false,
          error: '项目不存在',
        };
      }

      return {
        success: true,
        message: '获取项目详情成功',
        project,
      };
    } catch (error) {
      console.error('获取项目详情失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取项目详情失败',
      };
    }
  }

  /**
   * 更新项目
   * @param projectId 项目ID
   * @param userId 用户ID
   * @param data 更新数据
   * @returns 更新结果
   */
  async updateProject(
    projectId: string,
    userId: string,
    data: UpdateProjectRequest
  ): Promise<ProjectResult> {
    try {
      // 验证用户权限（需要管理员或所有者权限）
      const permission = await this.checkPermission(projectId, userId, MemberRole.ADMIN);
      if (!permission.hasPermission) {
        return {
          success: false,
          error: '权限不足，需要管理员或所有者权限',
        };
      }

      // 验证项目存在
      const [existingProject] = await this.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!existingProject) {
        return {
          success: false,
          error: '项目不存在',
        };
      }

      // 构建更新数据
      const updateData: Partial<UpdateProjectRequest> = {};
      if (data.name !== undefined) updateData.name = data.name.trim();
      if (data.description !== undefined) updateData.description = data.description?.trim() || null;
      if (data.gitRepositoryUrl !== undefined) updateData.gitRepositoryUrl = data.gitRepositoryUrl.trim();
      if (data.gitBranch !== undefined) updateData.gitBranch = data.gitBranch?.trim() || 'main';
      if (data.gitlabProjectId !== undefined) updateData.gitlabProjectId = data.gitlabProjectId?.trim() || null;
      if (data.gitlabUrl !== undefined) updateData.gitlabUrl = data.gitlabUrl?.trim() || null;
      if (data.workDirectory !== undefined) updateData.workDirectory = data.workDirectory.trim();
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      // 执行更新
      const [updatedProject] = await this.db
        .update(projects)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(projects.id, projectId))
        .returning();

      return {
        success: true,
        message: '项目更新成功',
        project: updatedProject,
      };
    } catch (error) {
      console.error('更新项目失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新项目失败',
      };
    }
  }

  /**
   * 删除项目
   * @param projectId 项目ID
   * @param userId 用户ID
   * @returns 删除结果
   */
  async deleteProject(projectId: string, userId: string): Promise<OperationResult> {
    try {
      // 验证用户权限（只有所有者可以删除项目）
      const permission = await this.checkPermission(projectId, userId, MemberRole.OWNER);
      if (!permission.hasPermission) {
        return {
          success: false,
          error: '权限不足，只有项目所有者可以删除项目',
        };
      }

      // 验证项目存在
      const [existingProject] = await this.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!existingProject) {
        return {
          success: false,
          error: '项目不存在',
        };
      }

      // 删除项目成员
      await this.db.delete(projectMembers).where(eq(projectMembers.projectId, projectId));

      // 删除本地仓库目录（如果存在）
      if (existingProject.workDirectory) {
        try {
          const { execSync } = require('child_process');
          console.log(`[ProjectService] 删除本地仓库目录: ${existingProject.workDirectory}`);
          
          // 使用 rm -rf 删除目录
          execSync(`rm -rf "${existingProject.workDirectory}"`, { stdio: 'inherit' });
          console.log(`[ProjectService] ✅ 本地仓库目录删除成功`);
        } catch (deleteError) {
          console.error(`[ProjectService] ⚠️ 删除本地仓库目录失败:`, deleteError);
          // 即使删除目录失败，也继续删除数据库记录
        }
      }

      // 删除项目
      await this.db.delete(projects).where(eq(projects.id, projectId));

      return {
        success: true,
        message: '项目删除成功',
      };
    } catch (error) {
      console.error('删除项目失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除项目失败',
      };
    }
  }

  /**
   * 添加项目成员
   * @param projectId 项目ID
   * @param memberUserId 成员用户ID
   * @param role 成员角色
   * @returns 操作结果
   */
  async addMember(projectId: string, memberUserId: string, role: MemberRole): Promise<OperationResult> {
    try {
      // 验证项目存在
      const [project] = await this.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return {
          success: false,
          error: '项目不存在',
        };
      }

      // 验证用户存在
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, memberUserId))
        .limit(1);

      if (!user) {
        return {
          success: false,
          error: '用户不存在',
        };
      }

      // 检查成员是否已存在
      const [existingMember] = await this.db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, memberUserId)
          )
        )
        .limit(1);

      if (existingMember) {
        return {
          success: false,
          error: '用户已是项目成员',
        };
      }

      // 添加成员
      const newMember: NewProjectMember = {
        id: uuidv4(),
        projectId,
        userId: memberUserId,
        role,
      };

      await this.db.insert(projectMembers).values(newMember);

      return {
        success: true,
        message: '成员添加成功',
      };
    } catch (error) {
      console.error('添加成员失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '添加成员失败',
      };
    }
  }

  /**
   * 移除项目成员
   * @param projectId 项目ID
   * @param ownerUserId 操作者用户ID
   * @param memberUserId 要移除的成员用户ID
   * @returns 操作结果
   */
  async removeMember(projectId: string, ownerUserId: string, memberUserId: string): Promise<OperationResult> {
    try {
      // 验证操作者权限（需要管理员或所有者权限）
      const permission = await this.checkPermission(projectId, ownerUserId, MemberRole.ADMIN);
      if (!permission.hasPermission) {
        return {
          success: false,
          error: '权限不足，需要管理员或所有者权限',
        };
      }

      // 不能移除项目所有者
      const memberPermission = await this.checkPermission(projectId, memberUserId, MemberRole.OWNER);
      if (memberPermission.isOwner) {
        return {
          success: false,
          error: '不能移除项目所有者',
        };
      }

      // 删除成员
      const deleteResult = await this.db
        .delete(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, memberUserId)
          )
        );

      if (deleteResult.rowCount === 0) {
        return {
          success: false,
          error: '成员不存在',
        };
      }

      return {
        success: true,
        message: '成员移除成功',
      };
    } catch (error) {
      console.error('移除成员失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '移除成员失败',
      };
    }
  }

  /**
   * 获取项目成员列表
   * @param projectId 项目ID
   * @returns 成员列表
   */
  async getMembers(projectId: string): Promise<MemberListResult> {
    try {
      const members = await this.db
        .select({
          id: projectMembers.id,
          projectId: projectMembers.projectId,
          userId: projectMembers.userId,
          role: projectMembers.role,
          createdAt: projectMembers.createdAt,
          user: {
            id: users.id,
            username: users.username,
            createdAt: users.createdAt,
            lastLoginAt: users.lastLoginAt,
          },
        })
        .from(projectMembers)
        .innerJoin(users, eq(projectMembers.userId, users.id))
        .where(eq(projectMembers.projectId, projectId))
        .orderBy(users.username);

      return {
        success: true,
        message: '获取成员列表成功',
        members,
      };
    } catch (error) {
      console.error('获取成员列表失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取成员列表失败',
      };
    }
  }

  /**
   * 检查用户对项目的权限
   * @param projectId 项目ID
   * @param userId 用户ID
   * @param requiredRole 需要的最低角色
   * @returns 权限验证结果
   */
  async checkPermission(
    projectId: string,
    userId: string,
    requiredRole: MemberRole
  ): Promise<PermissionResult> {
    try {
      // 获取用户在项目中的角色
      const [member] = await this.db
        .select({
          role: projectMembers.role,
          ownerId: projects.ownerId,
        })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, userId)
          )
        )
        .limit(1);

      if (!member) {
        return {
          hasPermission: false,
          isOwner: false,
        };
      }

      const isOwner = member.ownerId === userId;
      const memberRole = member.role as MemberRole;

      // 权限层级：OWNER > ADMIN > MEMBER
      const roleHierarchy = {
        [MemberRole.MEMBER]: 1,
        [MemberRole.ADMIN]: 2,
        [MemberRole.OWNER]: 3,
      };

      const userLevel = roleHierarchy[memberRole];
      const requiredLevel = roleHierarchy[requiredRole];

      return {
        hasPermission: userLevel >= requiredLevel,
        memberRole,
        isOwner,
      };
    } catch (error) {
      console.error('检查权限失败:', error);
      return {
        hasPermission: false,
        isOwner: false,
      };
    }
  }

  /**
   * 验证创建项目数据
   * @param data 项目数据
   * @param userId 创建者用户ID
   * @returns 验证结果
   */
  private async validateCreateProjectData(
    data: CreateProjectRequest,
    userId: string
  ): Promise<ValidationResult> {
    // 验证必填字段
    if (!data.name?.trim()) {
      return {
        allowed: false,
        reason: '项目名称不能为空',
      };
    }

    if (!data.gitRepositoryUrl?.trim()) {
      return {
        allowed: false,
        reason: 'Git仓库URL不能为空',
      };
    }

    // 验证用户存在
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return {
        allowed: false,
        reason: '用户不存在',
      };
    }

    // 验证项目名称唯一性（同一用户下）
    const [existingProject] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.name, data.name.trim()),
          eq(projects.ownerId, userId),
          eq(projects.isActive, true)
        )
      )
      .limit(1);

    if (existingProject) {
      return {
        allowed: false,
        reason: '项目名称已存在',
      };
    }

    // 验证Git URL格式（简单验证）
    const gitUrlPattern = /^https?:\/\/.+|git@.+:.+\.git$/;
    if (!gitUrlPattern.test(data.gitRepositoryUrl.trim())) {
      return {
        allowed: false,
        reason: 'Git仓库URL格式不正确',
      };
    }

    return {
      allowed: true,
    };
  }

  /**
   * 生成工作目录路径
   * @param projectName 项目名称
   * @returns 工作目录路径
   */
  private generateWorkDirectory(projectName: string, gitRepositoryUrl: string): string {
    // 从Git仓库URL中提取项目名称
    const urlParts = gitRepositoryUrl.split('/');
    const repoName = urlParts[urlParts.length - 1]; // 获取最后一部分作为项目名
    
    // 清理项目名称
    const sanitizedName = repoName
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\-]/g, '')  // 保留字母、数字、中文和连字符
      .replace(/-+/g, '-')                          // 合并多个连字符为单个
      .replace(/^-|-$/g, '');                        // 移除开头和结尾的连字符
    
    // 获取配置的工作目录基础路径
    const runMode = process.env.RUN_MODE || 'local';
    const baseWorkDir = runMode === 'remote' 
      ? process.env.REMOTE_GIT_WORK_DIR || '/Users/admin/desktop/front-workspace'
      : process.env.LOCAL_GIT_WORK_DIR || '/Users/gangqiang/Desktop/front-intern/front-workspace';
    
    return `${baseWorkDir}/${sanitizedName}`;
  }
}