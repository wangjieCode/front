import {
  Project,
  ProjectMember,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectFilters,
  AddMemberRequest,
  ApiResponse,
  MemberRole,
} from '../types/project';
import { authUtils } from '../utils/auth';

// 全局登录状态管理
let showLoginModalCallback: (() => void) | null = null;

/**
 * 设置登录模态框回调
 */
export const setLoginModalCallback = (callback: () => void) => {
  showLoginModalCallback = callback;
};

/**
 * 统一的 fetch 包装器，处理认证和错误
 */
const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
  // 添加认证头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  
  const userId = localStorage.getItem('user_id');
  if (userId) {
    headers['x-user-id'] = userId;
    
    const username = localStorage.getItem('username');
    if (username) {
      headers['x-username'] = username;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 处理 401 错误
  if (response.status === 401) {
    // 清除本地存储的用户信息
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    
    // 触发登录模态框
    if (showLoginModalCallback) {
      showLoginModalCallback();
    }
    
    throw new Error('请先登录');
  }

  return response;
};

/**
 * 项目服务类
 * 负责项目管理相关的API调用
 */
class ProjectService {
  private baseUrl = '/api/projects';

  /**
   * 创建项目
   * @param data 项目数据
   * @returns 创建结果
   */
  async createProject(data: CreateProjectRequest): Promise<ApiResponse<Project>> {
    try {
      const response = await fetchWithAuth(this.baseUrl, {
        method: 'POST',
        body: JSON.stringify(data),
      });

      const result: ApiResponse<Project> = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建项目失败',
      };
    }
  }

  /**
   * 获取项目列表
   * @param filters 过滤条件
   * @returns 项目列表
   */
  async getProjects(filters?: ProjectFilters): Promise<ApiResponse<Project[]>> {
    try {
      const params = new URLSearchParams();
      if (filters?.isActive !== undefined) {
        params.append('isActive', filters.isActive.toString());
      }
      if (filters?.search) {
        params.append('search', filters.search);
      }

      const url = params.toString() ? `${this.baseUrl}?${params}` : this.baseUrl;
      const response = await fetchWithAuth(url);

      const result: ApiResponse<Project[]> = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取项目列表失败',
      };
    }
  }

  /**
   * 获取项目详情
   * @param projectId 项目ID
   * @returns 项目详情
   */
  async getProject(projectId: string): Promise<ApiResponse<Project>> {
    try {
      const response = await fetchWithAuth(`${this.baseUrl}/${projectId}`);

      const result: ApiResponse<Project> = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取项目详情失败',
      };
    }
  }

  /**
   * 更新项目
   * @param projectId 项目ID
   * @param data 更新数据
   * @returns 更新结果
   */
  async updateProject(
    projectId: string,
    data: UpdateProjectRequest
  ): Promise<ApiResponse<Project>> {
    try {
      const response = await fetchWithAuth(`${this.baseUrl}/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });

      const result: ApiResponse<Project> = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新项目失败',
      };
    }
  }

  /**
   * 删除项目
   * @param projectId 项目ID
   * @returns 删除结果
   */
  async deleteProject(projectId: string): Promise<ApiResponse> {
    try {
      const response = await fetchWithAuth(`${this.baseUrl}/${projectId}`, {
        method: 'DELETE',
      });

      const result: ApiResponse = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除项目失败',
      };
    }
  }

  /**
   * 获取项目成员列表
   * @param projectId 项目ID
   * @returns 成员列表
   */
  async getMembers(projectId: string): Promise<ApiResponse<ProjectMember[]>> {
    try {
      const response = await fetchWithAuth(`${this.baseUrl}/${projectId}/members`);

      const result: ApiResponse<ProjectMember[]> = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取成员列表失败',
      };
    }
  }

  /**
   * 添加项目成员
   * @param projectId 项目ID
   * @param data 成员数据
   * @returns 添加结果
   */
  async addMember(projectId: string, data: AddMemberRequest): Promise<ApiResponse> {
    try {
      const response = await fetchWithAuth(`${this.baseUrl}/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify(data),
      });

      const result: ApiResponse = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '添加成员失败',
      };
    }
  }

  /**
   * 移除项目成员
   * @param projectId 项目ID
   * @param userId 用户ID
   * @returns 移除结果
   */
  async removeMember(projectId: string, userId: string): Promise<ApiResponse> {
    try {
      const response = await fetchWithAuth(`${this.baseUrl}/${projectId}/members/${userId}`, {
        method: 'DELETE',
      });

      const result: ApiResponse = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '移除成员失败',
      };
    }
  }

  /**
   * 更新成员角色
   * @param projectId 项目ID
   * @param userId 用户ID
   * @param role 新角色
   * @returns 更新结果
   */
  async updateMemberRole(
    projectId: string,
    userId: string,
    role: MemberRole
  ): Promise<ApiResponse> {
    try {
      const response = await fetchWithAuth(`${this.baseUrl}/${projectId}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      });

      const result: ApiResponse = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新成员角色失败',
      };
    }
  }

  /**
   * 检查用户权限
   * @param projectId 项目ID
   * @param requiredRole 需要的角色
   * @returns 权限检查结果
   */
  async checkPermission(
    projectId: string,
    requiredRole: MemberRole
  ): Promise<ApiResponse<{ hasPermission: boolean; memberRole?: MemberRole; isOwner: boolean }>> {
    try {
      const response = await fetchWithAuth(`${this.baseUrl}/${projectId}/permissions/${requiredRole}`);

      const result: ApiResponse<{ hasPermission: boolean; memberRole?: MemberRole; isOwner: boolean }> = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '权限检查失败',
      };
    }
  }
}

// 创建单例实例
export const projectService = new ProjectService();