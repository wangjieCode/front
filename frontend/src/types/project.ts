// 移除复杂的角色枚举，简化权限控制

/**
 * 项目接口
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  gitRepositoryUrl: string;
  gitBranch: string;
  gitlabProjectId?: string;
  gitlabUrl?: string;
  workDirectory: string;
  createdBy: string; // 项目创建者
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastPulledAt?: string; // 最后更新时间
}

// 移除项目成员相关接口

/**
 * 创建项目请求接口
 */
export interface CreateProjectRequest {
  name: string;
  description?: string;
  gitRepositoryUrl: string;
  gitlab?: {
    projectId: string;
    url: string;
  };
}

/**
 * 更新项目请求接口
 */
export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  gitRepositoryUrl?: string;
  gitlab?: {
    projectId?: string;
    url?: string;
  };
  isActive?: boolean;
}

/**
 * 项目过滤器接口
 */
export interface ProjectFilters {
  isActive?: boolean;
  search?: string;
}

// 移除成员管理相关接口

/**
 * API响应接口
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  total?: number;
}

/**
 * 仓库状态枚举
 */
export enum RepositoryStatus {
  PENDING = 'pending',      // 等待克隆
  CLONING = 'cloning',      // 正在克隆
  SUCCESS = 'success',      // 克隆成功
  FAILED = 'failed',        // 克隆失败
  UPDATING = 'updating'     // 正在更新
}

/**
 * 仓库克隆进度接口
 */
export interface CloneProgress {
  stage: 'cloning' | 'checking_out' | 'completed' | 'error';
  progress?: number;
  message: string;
  details?: string;
}