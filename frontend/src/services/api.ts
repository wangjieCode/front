import { Task, LogEntry } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * HTTP 客户端类
 * 封装 fetch API，支持 Token 认证
 */
class HttpClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 获取认证 Token
   */
  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  /**
   * 获取请求头
   */
  private getHeaders(customHeaders?: HeadersInit): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * GET 请求
   */
  async get<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api${path}`, {
      method: 'GET',
      headers: this.getHeaders(options?.headers),
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '请求失败' }));
      throw new Error(error.error || '请求失败');
    }

    return response.json();
  }

  /**
   * POST 请求
   */
  async post<T>(path: string, data?: any, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api${path}`, {
      method: 'POST',
      headers: this.getHeaders(options?.headers),
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '请求失败' }));
      throw new Error(error.error || '请求失败');
    }

    return response.json();
  }

  /**
   * PUT 请求
   */
  async put<T>(path: string, data?: any, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api${path}`, {
      method: 'PUT',
      headers: this.getHeaders(options?.headers),
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '请求失败' }));
      throw new Error(error.error || '请求失败');
    }

    return response.json();
  }

  /**
   * DELETE 请求
   */
  async delete<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(options?.headers),
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '请求失败' }));
      throw new Error(error.error || '请求失败');
    }

    return response.json();
  }
}

// 导出 HTTP 客户端单例
export const apiClient = new HttpClient();

/**
 * API 服务类
 * 处理与后端的 HTTP 通信（保留原有接口以兼容现有代码）
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
    const response = await fetch(`${this.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
   * 创建新任务
   */
  async createTask(prompt: string, type: 'code_change' | 'query' = 'code_change'): Promise<Task> {
    const response = await apiClient.post<{ success: boolean; data: Task }>('/tasks', { prompt, type });
    return response.data;
  }

  /**
   * 获取所有任务列表
   */
  async getTasks(): Promise<Task[]> {
    const response = await apiClient.get<{ success: boolean; data: Task[] }>('/tasks');
    return response.data || [];
  }

  /**
   * 获取单个任务详情
   */
  async getTask(taskId: string): Promise<Task> {
    const response = await apiClient.get<{ success: boolean; data: Task }>(`/tasks/${taskId}`);
    return response.data;
  }

  /**
   * 获取任务日志
   */
  async getTaskLogs(taskId: string): Promise<LogEntry[]> {
    const response = await apiClient.get<{ success: boolean; data: LogEntry[] }>(`/tasks/${taskId}/logs`);
    return response.data || [];
  }
}

// 导出单例
export const apiService = new ApiService();
export default apiService;
