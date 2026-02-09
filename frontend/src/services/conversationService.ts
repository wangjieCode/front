import {
  ConversationSession,
  ConversationMessage,
  ConversationVisibility,
  ModelConfigResponse,
  PreviewResult,
  PreviewStatusResponse,
  SimplifiedConversation,
} from '../types/conversation';
import { DEFAULT_NEOVATE_MODEL, NEOVATE_MODEL_OPTIONS } from '../constants/neovateModels';
import { authUtils } from '../utils/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

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
 * 对话服务类
 * 负责与后端对话 API 通信
 */
class ConversationService {
  private baseUrl: string;
  private modelConfigCache: ModelConfigResponse | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }



  /**
   * 创建新的对话会话
   */
  async createSession(initialPrompt: string): Promise<ConversationSession> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/conversations`, {
      method: 'POST',
      body: JSON.stringify({ initialPrompt }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '创建会话失败' }));
      throw new Error(error.error || '创建会话失败');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * 获取对话会话详情
   */
  async getSession(sessionId: string): Promise<ConversationSession> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/conversations/${sessionId}`);

    if (!response.ok) {
      throw new Error('获取会话详情失败');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * 获取所有对话会话列表
   */
  async getSessions(): Promise<SimplifiedConversation[]> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/conversations`);

    if (!response.ok) {
      throw new Error('获取会话列表失败');
    }

    const result = await response.json();
    return result.data || [];
  }

  /**
   * 获取所有对话会话列表（别名）
   */
  async listConversations(): Promise<{ success: boolean; data: SimplifiedConversation[] }> {
    try {
      const data = await this.getSessions();
      return { success: true, data };
    } catch (error) {
      console.error('获取对话列表失败:', error);
      return { success: false, data: [] };
    }
  }

  /**
   * 创建新对话
   */
  async createConversation(params: {
    initialPrompt: string;
    projectId: string;
    baseBranch?: string;
    mode?: string;
    model?: string;
  }): Promise<{ success: boolean; data: ConversationSession }> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/conversations`, {
      method: 'POST',
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '创建对话失败' }));
      throw new Error(error.error || '创建对话失败');
    }

    const result = await response.json();
    return result;
  }

  async getGitBranches(projectId: string): Promise<{ branches: string[]; defaultBranch?: string }> {
    const response = await fetchWithAuth(
      `${this.baseUrl}/api/conversations/gitlab/branches?projectId=${encodeURIComponent(projectId)}`
    );
    if (!response.ok) {
      throw new Error('获取分支列表失败');
    }
    const result = await response.json();
    return result.data;
  }

  async getModelConfig(forceRefresh: boolean = false): Promise<ModelConfigResponse> {
    if (!forceRefresh && this.modelConfigCache) {
      return this.modelConfigCache;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/conversations/models`);
      if (!response.ok) {
        throw new Error('获取模型配置失败');
      }
      const result = await response.json();
      const data = result?.data;
      if (!data || !Array.isArray(data.options) || typeof data.defaultModel !== 'string') {
        throw new Error('模型配置格式不正确');
      }
      this.modelConfigCache = {
        defaultModel: data.defaultModel,
        options: data.options,
      };
      return this.modelConfigCache;
    } catch (error) {
      const fallback: ModelConfigResponse = {
        defaultModel: DEFAULT_NEOVATE_MODEL,
        options: NEOVATE_MODEL_OPTIONS.map(option => ({
          ...option,
          enabled: true,
        })),
      };
      this.modelConfigCache = fallback;
      return fallback;
    }
  }

  /**
   * 发送用户消息
   */
  async sendMessage(
    sessionId: string,
    content: string
  ): Promise<{ userMessage: ConversationMessage; aiMessage?: ConversationMessage }> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/conversations/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '发送消息失败' }));
      throw new Error(error.error || '发送消息失败');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * 获取对话历史（支持增量获取）
   */
  async getMessages(
    sessionId: string,
    since?: string
  ): Promise<ConversationMessage[]> {
    const params = new URLSearchParams();
    if (since) params.append('since', since);

    const url = `${this.baseUrl}/api/conversations/${sessionId}/messages${
      params.toString() ? '?' + params.toString() : ''
    }`;

    const response = await fetchWithAuth(url);

    if (!response.ok) {
      throw new Error('获取消息历史失败');
    }

    const result = await response.json();
    return result.data || [];
  }

  /**
   * 为会话创建 Merge Request
   */
  async createMergeRequest(sessionId: string): Promise<{ mrUrl: string }> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/conversations/${sessionId}/merge-request`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '创建 MR 失败' }));
      throw new Error(error.error || '创建 MR 失败');
    }

    const result = await response.json();
    return result.data;
  }

  // ==================== 预览相关 API ====================

  /**
   * 创建预览部署
   */
  async createPreview(
    sessionId: string,
    forceRebuild: boolean = false
  ): Promise<PreviewResult> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/conversations/${sessionId}/preview`, {
      method: 'POST',
      body: JSON.stringify({ forceRebuild }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '创建预览失败' }));
      throw new Error(error.error || '创建预览失败');
    }

    return await response.json();
  }

  /**
   * 获取预览状态
   */
  async getPreviewStatus(sessionId: string): Promise<PreviewStatusResponse> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/conversations/${sessionId}/preview/status`);

    if (!response.ok) {
      throw new Error('获取预览状态失败');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * 停止预览
   */
  async stopPreview(sessionId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/conversations/${sessionId}/preview`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '停止预览失败' }));
      throw new Error(error.error || '停止预览失败');
    }

    return await response.json();
  }

  /**
   * 删除对话
   */
  async deleteConversation(sessionId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetchWithAuth(`${this.baseUrl}/api/conversations/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || '删除失败' };
      }

      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '删除失败' };
    }
  }

  /**
   * 中断对话流式响应
   */
  async interruptConversation(sessionId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetchWithAuth(`${this.baseUrl}/api/conversations/${sessionId}/interrupt`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || '中断失败' };
      }

      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '中断失败' };
    }
  }

   /**
    * 归档对话
    */
   async archiveConversation(sessionId: string, reason?: string): Promise<void> {
     const response = await fetchWithAuth(`${this.baseUrl}/api/conversations/${sessionId}/archive`, {
       method: 'POST',
       body: JSON.stringify({ reason }),
     });

     if (!response.ok) {
       const error = await response.json().catch(() => ({ error: '归档失败' }));
       throw new Error(error.error || '归档失败');
     }
   }

   /**
    * 更新对话可见性
    */
  async updateVisibility(sessionId: string, visibility: ConversationVisibility): Promise<void> {
    const response = await fetchWithAuth(`${this.baseUrl}/api/conversations/${sessionId}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
    });

     if (!response.ok) {
       const error = await response.json().catch(() => ({ error: '更新可见性失败' }));
       throw new Error(error.error || '更新可见性失败');
    }
  }

 }

// 导出单例
export const conversationService = new ConversationService();
export default conversationService;
