import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc } from 'drizzle-orm';
import { DatabaseManager } from '../db/DatabaseManager';
import { projects, users } from '../db/schema';
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
type User = typeof users.$inferSelect;

// 移除角色枚举，简化权限控制

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

// 移除成员管理相关接口

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

// 移除成员列表结果接口

// 移除权限验证结果接口

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
        ownerId: userId, // 保持数据库字段名一致
      };

      const [project] = await this.db.insert(projects).values(newProject).returning();

      // 移除成员管理逻辑

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
   * 获取用户项目列表（简化版）
   * @param userId 用户ID
   * @param filters 过滤条件
   * @returns 项目列表
   */
  async getProjects(userId: string, filters?: ProjectFilters): Promise<ProjectListResult> {
    try {
      // 构建查询条件
      const conditions = [];

      if (filters?.isActive !== undefined) {
        conditions.push(eq(projects.isActive, filters.isActive));
      }

      // 查询所有项目（移除成员限制）
      const allProjects = await this.db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          gitRepositoryUrl: projects.gitRepositoryUrl,
          gitBranch: projects.gitBranch,
          gitlabProjectId: projects.gitlabProjectId,
          gitlabUrl: projects.gitlabUrl,
          workDirectory: projects.workDirectory,
          createdBy: projects.createdBy,
          isActive: projects.isActive,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(projects.createdAt));

      // 如果有搜索条件，进行内存过滤
      let filteredProjects = allProjects;
      if (filters?.search) {
        const searchTerm = filters.search.toLowerCase();
        filteredProjects = allProjects.filter((project: Project) =>
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
   * 获取项目详情（简化版）
   * @param projectId 项目ID
   * @param userId 用户ID
   * @returns 项目详情
   */
  async getProject(projectId: string, userId: string): Promise<ProjectResult> {
    try {
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
   * 更新项目（简化版）
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
   * 删除项目（简化版）
   * @param projectId 项目ID
   * @param userId 用户ID
   * @returns 删除结果
   */
  async deleteProject(projectId: string, userId: string): Promise<OperationResult> {
    try {
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

      // 删除本地仓库目录（如果存在）
      if (existingProject.workDirectory) {
        try {
          const { execSync } = require('child_process');
          console.log(`[ProjectService] 删除本地仓库目录: ${existingProject.workDirectory}`);
          
          execSync(`rm -rf "${existingProject.workDirectory}"`, { stdio: 'inherit' });
          console.log(`[ProjectService] ✅ 本地仓库目录删除成功`);
        } catch (deleteError) {
          console.error(`[ProjectService] ⚠️ 删除本地仓库目录失败:`, deleteError);
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

  // 移除所有成员管理和权限检查方法

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
          eq(projects.createdBy, userId), // 使用createdBy字段
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