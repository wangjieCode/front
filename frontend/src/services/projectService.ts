import {
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectFilters,
  ApiResponse,
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
    ...authUtils.getAuthHeaders(),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 处理 401 错误
  if (response.status === 401) {
    // 清除本地存储的用户信息
    authUtils.clearUserInfo();
    
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
   * 更新项目代码（git pull）
   * @param projectId 项目ID
   * @returns 更新结果
   */
  async pullRepository(projectId: string): Promise<ApiResponse> {
    try {
      const response = await fetchWithAuth(`${this.baseUrl}/${projectId}/pull`, {
        method: 'POST',
      });

      const result: ApiResponse = await response.json();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新代码失败',
      };
    }
  }

  // 移除所有成员管理方法
}

// 创建单例实例
export const projectService = new ProjectService();
