/**
 * 认证服务
 * 负责用户登录、Token 管理和用户信息获取
 */

import { apiClient } from './api';

export interface User {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  lastLoginAt?: Date;
}

export interface LoginResponse {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  token: string;
}

/**
 * 认证服务类
 */
class AuthService {
  private static readonly TOKEN_KEY = 'auth_token';
  private static readonly USER_KEY = 'current_user';

  /**
   * 用户登录
   */
  async login(username: string): Promise<LoginResponse> {
    console.log('🔐 开始登录:', username);
    
    try {
      const response = await apiClient.post<{ success: boolean; data: LoginResponse }>('/auth/login', {
        username,
      });

      console.log('📡 登录响应:', response);

      if (!response.success) {
        console.error('❌ 登录失败 - 服务器返回失败状态');
        throw new Error('登录失败');
      }

      const loginData = response.data;
      console.log('✅ 登录成功:', loginData);

      // 保存 Token 和用户信息
      this.setToken(loginData.token);
      this.setUser({
        userId: loginData.userId,
        username: loginData.username,
        displayName: loginData.displayName,
        avatarUrl: loginData.avatarUrl,
      });

      return loginData;
    } catch (error) {
      console.error('❌ 登录异常:', error);
      throw error;
    }
  }

  /**
   * 获取当前用户信息（从服务器）
   */
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<{ success: boolean; data: User }>('/auth/me');

    if (!response.success) {
      throw new Error('获取用户信息失败');
    }

    return response.data;
  }

  /**
   * 用户登出
   */
  logout(): void {
    this.removeToken();
    this.removeUser();
  }

  /**
   * 保存 Token
   */
  setToken(token: string): void {
    localStorage.setItem(AuthService.TOKEN_KEY, token);
  }

  /**
   * 获取 Token
   */
  getToken(): string | null {
    return localStorage.getItem(AuthService.TOKEN_KEY);
  }

  /**
   * 移除 Token
   */
  removeToken(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
  }

  /**
   * 保存用户信息
   */
  setUser(user: User): void {
    localStorage.setItem(AuthService.USER_KEY, JSON.stringify(user));
  }

  /**
   * 获取用户信息（从本地存储）
   */
  getUser(): User | null {
    const userStr = localStorage.getItem(AuthService.USER_KEY);
    if (!userStr) return null;

    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  /**
   * 移除用户信息
   */
  removeUser(): void {
    localStorage.removeItem(AuthService.USER_KEY);
  }

  /**
   * 检查是否已登录
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

// 导出单例
export const authService = new AuthService();
