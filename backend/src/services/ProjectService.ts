import { eq, and, desc, ilike, or } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';
import { DatabaseManager } from '../db/DatabaseManager';
import { projects } from '../db/schema';
import { RedisManager } from '../db/RedisManager';
import {
  OperationResult,
  ValidationResult,
} from '../types';
import { GitOperationError, ValidationError } from '../errors/CustomErrors';
import { RepositoryService, CloneProgressCallback } from './RepositoryService';
import { ICommandExecutor } from '../types';
import { newId } from '../utils/id';
import dayjs from 'dayjs';
import path from 'path';
import { resolveStoredPath, convertToStoredPath, BasePathType } from '../utils/PathUtils';
import { getGitWorkDir } from '../utils/config';
import { resolve } from 'path';

// 从schema导出类型
type Project = typeof projects.$inferSelect;
type NewProject = typeof projects.$inferInsert;

/**
 * 创建项目请求接口
 */
export interface CreateProjectRequest {
  name: string;
  description?: string;
  gitRepositoryUrl: string;
  gitBranch?: string;
  gitlab?: {
    projectId?: string;
    url?: string;
  };
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
 * 项目服务类
 * 负责项目的CRUD操作、成员管理和权限控制
 */
export class ProjectService {
  private db = DatabaseManager.getDb();
  private repositoryService: RepositoryService;
  private listCacheTtlSeconds = 30;
  
  // 本地二级缓存，减少对 Redis 的请求压力
  private listLocalCache = new LRUCache<string, ProjectListResult>({
    max: 100,
    ttl: 1000 * 15, // 本地只缓存 15 秒，比 Redis 短一些以保证一致性
  });

  private getRedis() {
    return RedisManager.getInstanceSafe();
  }

  private async invalidateProjectListCache(userId: string): Promise<void> {
    // 同时清除本地缓存
    this.listLocalCache.clear();

    const redis = this.getRedis();
    if (!redis) return;
    try {
      const pattern = `projects:list:${userId}:*`;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
        cursor = nextCursor;
      } while (cursor !== '0');
    } catch (error) {
      console.warn('[ProjectService] 缓存清理失败 (Redis 可能达到限制):', error);
    }
  }

  constructor(
    private executor: ICommandExecutor
  ) {
    this.repositoryService = new RepositoryService(executor);
  }

  /**
   * 解析路径为绝对路径
   * @param targetPath 目标路径
   * @returns 绝对路径
   */
  public resolvePath(targetPath: string | null): string {
    return resolveStoredPath(targetPath, BasePathType.GIT_WORK_DIR);
  }

  /**
   * 将路径转换为变量占位符格式
   * @param absPath 绝对路径
   * @returns 变量占位符格式的路径
   */
  public convertToStoredPath(absPath: string | null): string | null {
    return convertToStoredPath(absPath);
  }

  /**
   * 将项目中的路径解析为绝对路径
   * @param project 项目对象
   * @returns 解析后的项目对象
   */
  private resolveProjectPaths(project: Project): Project {
    const storedRepoDir = project.workDirectory || project.repoDir;
    let resolvedRepoDir = resolveStoredPath(storedRepoDir, BasePathType.GIT_WORK_DIR);
    if (!resolvedRepoDir) {
      const repoName = this.generateWorkDirectory(project.name, project.gitRepositoryUrl);
      const baseDir = getGitWorkDir();
      resolvedRepoDir = resolve(baseDir, repoName);
    }
    return {
      ...project,
      repoDir: resolvedRepoDir,
      workDirectory: resolvedRepoDir,
    };
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

      // 生成工作目录（如果未提供，生成的是相对路径）
      const workDirectory = data.workDirectory || this.generateWorkDirectory(data.name, data.gitRepositoryUrl);

      // 格式化路径为变量占位符格式后再存入数据库
      const storedRepoDir = this.convertToStoredPath(workDirectory) || workDirectory;
      const storedWorkDir = this.convertToStoredPath(workDirectory) || workDirectory;

      // 创建项目记录
      const newProject: NewProject = {
        id: newId(),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        repoDir: storedRepoDir,
        gitBranch: data.gitBranch || 'master',
        isActive: true,
        createdBy: userId,
        gitRepositoryUrl: data.gitRepositoryUrl.trim(),
        gitlabProjectId: data.gitlab?.projectId?.trim() || null,
        gitlabUrl: data.gitlab?.url?.trim() || 'https://gitlab.com',
        workDirectory: storedWorkDir,
        ownerId: userId,
      };

      const [project] = await this.db.insert(projects).values(newProject).returning();

      // 解析路径用于后续操作
      const resolvedProject = this.resolveProjectPaths(project);

      // 异步触发仓库克隆
      if (this.repositoryService) {
        setImmediate(async () => {
          try {
            console.log(`[ProjectService] 开始为项目 ${resolvedProject.id} 克隆仓库`);
            console.log(`[ProjectService] 工作目录: ${resolvedProject.workDirectory}`);
            
            const result = await this.repositoryService.cloneRepository(resolvedProject, (progress) => {
              console.log(`[ProjectService] 克隆进度 [${progress.stage}]: ${progress.message} (${progress.progress || 0}%)`);
            });
            
            if (result.success) {
              console.log(`[ProjectService] ✅ 项目 ${resolvedProject.id} 仓库克隆完成`);
            } else {
              console.error(`[ProjectService] ❌ 项目 ${resolvedProject.id} 仓库克隆失败:`, result.error);
            }
          } catch (error) {
            console.error(`[ProjectService] ❌ 项目 ${resolvedProject.id} 仓库克隆异常:`, error);
          }
        });
      }

      await this.invalidateProjectListCache(userId);

      return {
        success: true,
        message: '项目创建成功',
        project: resolvedProject,
      };
    } catch (error) {
      console.error('创建项目失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建项目失败',
        message: '创建项目失败',
      };
    }
  }

  /**
   * 获取用户项目列表
   */
  async getProjects(userId: string, filters?: ProjectFilters): Promise<ProjectListResult> {
    try {
      const searchTerm = filters?.search?.trim().toLowerCase() || '';
      const isActiveKey = filters?.isActive === undefined ? 'all' : filters.isActive ? 'active' : 'inactive';
      const cacheKey = `projects:list:${userId}:${isActiveKey}:${searchTerm || 'all'}`;
      
      // 1. 检查本地缓存
      const localCached = this.listLocalCache.get(cacheKey);
      if (localCached) {
        return localCached;
      }

      // 2. 检查 Redis 缓存
      const redis = this.getRedis();
      if (redis) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            try {
              const result = JSON.parse(cached) as ProjectListResult;
              // 存入本地缓存
              this.listLocalCache.set(cacheKey, result);
              return result;
            } catch (error) {
              console.warn('[ProjectService] 项目列表缓存解析失败，已忽略');
            }
          }
        } catch (error) {
          console.warn('[ProjectService] Redis 查询失败 (可能达到额度限制):', error);
          // 继续向下走，从数据库读取
        }
      }

      const conditions: any[] = [eq(projects.ownerId, userId)];
      if (filters?.isActive !== undefined) {
        conditions.push(eq(projects.isActive, filters.isActive));
      }
      if (searchTerm) {
        conditions.push(
          or(
            ilike(projects.name, `%${searchTerm}%`),
            ilike(projects.description, `%${searchTerm}%`)
          )
        );
      }

      const filteredProjects = await this.db
        .select()
        .from(projects)
        .where(and(...conditions))
        .orderBy(desc(projects.createdAt));

      const result: ProjectListResult = {
        success: true,
        message: '获取项目列表成功',
        projects: filteredProjects.map(p => this.resolveProjectPaths(p)),
        total: filteredProjects.length,
      };

      // 存入本地缓存
      this.listLocalCache.set(cacheKey, result);

      if (redis) {
        try {
          await redis.set(cacheKey, JSON.stringify(result), 'EX', this.listCacheTtlSeconds);
        } catch (error) {
          console.warn('[ProjectService] Redis 写入失败 (可能达到额度限制):', error);
        }
      }

      return result;
    } catch (error) {
      console.error('获取项目列表失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取项目列表失败',
        message: '获取项目列表失败',
      };
    }
  }

  /**
   * 获取项目详情
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
          message: '项目不存在',
        };
      }

      return {
        success: true,
        message: '获取项目详情成功',
        project: this.resolveProjectPaths(project),
      };
    } catch (error) {
      console.error('获取项目详情失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取项目详情失败',
        message: '获取项目详情失败',
      };
    }
  }

  /**
   * 更新项目
   */
  async updateProject(
    projectId: string,
    userId: string,
    data: UpdateProjectRequest
  ): Promise<ProjectResult> {
    try {
      const [existingProject] = await this.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!existingProject) {
        return {
          success: false,
          error: '项目不存在',
          message: '项目不存在',
        };
      }

      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name.trim();
      if (data.description !== undefined) updateData.description = data.description?.trim() || null;
      if (data.gitRepositoryUrl !== undefined) updateData.gitRepositoryUrl = data.gitRepositoryUrl.trim();
      if (data.gitBranch !== undefined) updateData.gitBranch = data.gitBranch?.trim() || 'master';
      if (data.gitlabProjectId !== undefined) updateData.gitlabProjectId = data.gitlabProjectId?.trim() || null;
      if (data.gitlabUrl !== undefined) updateData.gitlabUrl = data.gitlabUrl?.trim() || null;
      if (data.workDirectory !== undefined) {
        updateData.workDirectory = this.convertToStoredPath(data.workDirectory.trim());
        updateData.repoDir = updateData.workDirectory; // 通常保持一致
      }
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      const [updatedProject] = await this.db
        .update(projects)
        .set({ ...updateData, updatedAt: dayjs().toDate() })
        .where(eq(projects.id, projectId))
        .returning();

      await this.invalidateProjectListCache(userId);

      return {
        success: true,
        message: '项目更新成功',
        project: this.resolveProjectPaths(updatedProject),
      };
    } catch (error) {
      console.error('更新项目失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新项目失败',
        message: '更新项目失败',
      };
    }
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string, userId: string): Promise<OperationResult> {
    try {
      const [existingProject] = await this.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!existingProject) {
        return {
          success: false,
          error: '项目不存在',
          message: '项目不存在',
        };
      }

      const resolvedProject = this.resolveProjectPaths(existingProject);
      if (resolvedProject.workDirectory) {
        try {
          const { execSync } = require('child_process');
          console.log(`[ProjectService] 删除本地仓库目录: ${resolvedProject.workDirectory}`);
          execSync(`rm -rf "${resolvedProject.workDirectory}"`, { stdio: 'inherit' });
        } catch (deleteError) {
          console.error(`[ProjectService] ⚠️ 删除本地仓库目录失败:`, deleteError);
        }
      }

      await this.db.delete(projects).where(eq(projects.id, projectId));

      await this.invalidateProjectListCache(userId);

      return {
        success: true,
        message: '项目删除成功',
      };
    } catch (error) {
      console.error('删除项目失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除项目失败',
        message: '删除项目失败',
      };
    }
  }

  /**
   * 更新项目代码
   */
  async pullRepository(projectId: string, userId: string): Promise<OperationResult> {
    try {
      const [project] = await this.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return { success: false, error: '项目不存在', message: '项目不存在' };
      }

      const resolvedProject = this.resolveProjectPaths(project);
      if (!resolvedProject.workDirectory) {
        return { success: false, error: '未配置工作目录', message: '未配置工作目录' };
      }

      console.log(`[ProjectService] 开始更新项目代码: ${resolvedProject.name}`);

      const dirCheckResult = await this.executor.executeCommand(
        `test -d "${resolvedProject.workDirectory}" && echo "exists" || echo "not exists"`,
        '.'
      );

      if (dirCheckResult.stdout.trim() !== 'exists') {
        const cloneResult = await this.repositoryService.cloneRepository(resolvedProject);
        if (!cloneResult.success) return { success: false, error: cloneResult.error, message: '克隆失败' };
        return { success: true, message: '克隆成功' };
      }

      // 执行 pull 逻辑
      const gitCheckResult = await this.executor.executeCommand(`git rev-parse --git-dir`, resolvedProject.workDirectory);
      if (gitCheckResult.exitCode !== 0) {
        await this.executor.executeCommand(`rm -rf "${resolvedProject.workDirectory}"`, '.');
        const cloneResult = await this.repositoryService.cloneRepository(resolvedProject);
        return cloneResult.success ? { success: true, message: '重新克隆成功' } : { success: false, error: cloneResult.error, message: '重新克隆失败' };
      }

      const authUrl = this.repositoryService.getAuthUrl(resolvedProject.gitRepositoryUrl);
      await this.executor.executeCommand(`git remote set-url origin "${authUrl}"`, resolvedProject.workDirectory);
      await this.executor.executeCommand(`git fetch origin ${resolvedProject.gitBranch}`, resolvedProject.workDirectory);
      const mergeResult = await this.executor.executeCommand(`git merge origin/${resolvedProject.gitBranch} --no-edit`, resolvedProject.workDirectory);

      if (mergeResult.exitCode !== 0) {
        await this.executor.executeCommand(`git merge --abort`, resolvedProject.workDirectory).catch(() => {});
        return { success: false, error: '合并代码失败，可能存在冲突', message: '合并代码失败' };
      }

      await this.db.update(projects).set({ lastPulledAt: dayjs().toDate() }).where(eq(projects.id, projectId));
      return { success: true, message: '代码更新成功' };
    } catch (error) {
      console.error('更新代码失败:', error);
      return { success: false, error: String(error), message: '更新代码失败' };
    }
  }

  private async validateCreateProjectData(data: CreateProjectRequest, userId: string): Promise<ValidationResult> {
    if (!data.name?.trim()) return { allowed: false, reason: '项目名称不能为空' };
    if (!data.gitRepositoryUrl?.trim()) return { allowed: false, reason: 'Git仓库URL不能为空' };
    
    // 验证名称唯一性
    const [existing] = await this.db.select().from(projects).where(and(eq(projects.name, data.name.trim()), eq(projects.createdBy, userId), eq(projects.isActive, true))).limit(1);
    if (existing) return { allowed: false, reason: '项目名称已存在' };

    return { allowed: true };
  }

  private generateWorkDirectory(projectName: string, gitRepositoryUrl: string): string {
    const urlParts = gitRepositoryUrl.split('/');
    const lastPart = urlParts[urlParts.length - 1]; 
    const repoName = lastPart.endsWith('.git') ? lastPart.substring(0, lastPart.length - 4) : lastPart;
    const sanitizedName = repoName.toLowerCase().replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return sanitizedName;
  }
}
