/**
 * 项目成员角色枚举
 */
export enum MemberRole {
  OWNER = 'owner',    // 项目所有者：所有权限
  ADMIN = 'admin',    // 管理员：管理成员、修改项目
  MEMBER = 'member'   // 成员：查看项目、创建对话
}

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
  ownerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 项目成员接口
 */
export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: MemberRole;
  createdAt: string;
  user?: {
    id: string;
    username: string;
    createdAt: string;
    lastLoginAt: string;
  };
}

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

/**
 * 添加成员请求接口
 */
export interface AddMemberRequest {
  userId: string;
  role: MemberRole;
}

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