import { Task, LogEntry } from '../types';
import { authUtils } from '../utils/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
 * API 服务类
 * 处理与后端的 HTTP 通信
 */
class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 创建新任务
   */
  async createTask(prompt: string, type: 'code_change' | 'query' = 'code_change'): Promise<Task> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/tasks`, {
      method: 'POST',
      body: JSON.stringify({ prompt, type }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '创建任务失败' }));
      throw new Error(error.error || '创建任务失败');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * 获取所有任务列表
   */
  async getTasks(): Promise<Task[]> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/tasks`);

    if (!response.ok) {
      throw new Error('获取任务列表失败');
    }

    const result = await response.json();
    return result.data || [];
  }

  /**
   * 获取单个任务详情
   */
  async getTask(taskId: string): Promise<Task> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/tasks/${taskId}`);

    if (!response.ok) {
      throw new Error('获取任务详情失败');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * 获取任务日志
   */
  async getTaskLogs(taskId: string): Promise<LogEntry[]> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/tasks/${taskId}/logs`);

    if (!response.ok) {
      throw new Error('获取任务日志失败');
    }

    const result = await response.json();
    return result.data || [];
  }
}

// 导出单例
export const apiService = new ApiService();
export default apiService;
