import {
  ConversationSession,
  ConversationMessage,
  ConversationStatus,
  ConversationBranch,
} from '../types/conversation';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * 轮询配置
 */
interface PollingConfig {
  activeInterval: number;    // 活跃轮询间隔（毫秒）
  reducedInterval: number;   // 降频轮询间隔（毫秒）
  inactiveThreshold: number; // 无活动阈值（毫秒）
  maxRetries: number;        // 最大重试次数
}

const DEFAULT_POLLING_CONFIG: PollingConfig = {
  activeInterval: 2000,      // 2 秒
  reducedInterval: 5000,     // 5 秒
  inactiveThreshold: 30000,  // 30 秒
  maxRetries: 3,
};

/**
 * 会话状态响应
 */
interface SessionStatusResponse {
  status: ConversationStatus;
  lastMessageId: string;
  hasNewMessages: boolean;
  pendingQuestion?: {
    question: string;
    options?: string[];
  };
}

/**
 * 对话服务类
 * 负责与后端对话 API 通信，实现智能轮询策略
 */
class ConversationService {
  private baseUrl: string;
  private pollingConfig: PollingConfig;
  private pollingTimers: Map<string, number>;
  private lastActivityTime: Map<string, number>;
  private retryCount: Map<string, number>;

  constructor(baseUrl: string = API_BASE_URL, config: Partial<PollingConfig> = {}) {
    this.baseUrl = baseUrl;
    this.pollingConfig = { ...DEFAULT_POLLING_CONFIG, ...config };
    this.pollingTimers = new Map();
    this.lastActivityTime = new Map();
    this.retryCount = new Map();
  }

  /**
   * 创建新的对话会话
   */
  async createSession(taskId: string, initialPrompt: string): Promise<ConversationSession> {
    const response = await fetch(`${this.baseUrl}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskId, initialPrompt }),
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
    const response = await fetch(`${this.baseUrl}/api/conversations/${sessionId}`);

    if (!response.ok) {
      throw new Error('获取会话详情失败');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * 获取所有对话会话列表
   */
  async getSessions(): Promise<ConversationSession[]> {
    const response = await fetch(`${this.baseUrl}/api/conversations`);

    if (!response.ok) {
      throw new Error('获取会话列表失败');
    }

    const result = await response.json();
    return result.data || [];
  }

  /**
   * 发送用户消息
   */
  async sendMessage(
    sessionId: string,
    content: string,
    branchId?: string
  ): Promise<{ userMessage: ConversationMessage; aiMessage?: ConversationMessage }> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content, branchId }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '发送消息失败' }));
      throw new Error(error.error || '发送消息失败');
    }

    const result = await response.json();
    
    // 更新最后活动时间
    this.lastActivityTime.set(sessionId, Date.now());
    
    return result.data;
  }

  /**
   * 获取对话历史（支持增量获取）
   */
  async getMessages(
    sessionId: string,
    branchId?: string,
    since?: string
  ): Promise<ConversationMessage[]> {
    const params = new URLSearchParams();
    if (branchId) params.append('branchId', branchId);
    if (since) params.append('since', since);

    const url = `${this.baseUrl}/api/conversations/${sessionId}/messages${
      params.toString() ? '?' + params.toString() : ''
    }`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('获取消息历史失败');
    }

    const result = await response.json();
    return result.data || [];
  }

  /**
   * 获取单条消息详情
   */
  async getMessage(sessionId: string, messageId: string): Promise<ConversationMessage> {
    const response = await fetch(
      `${this.baseUrl}/api/conversations/${sessionId}/messages/${messageId}`
    );

    if (!response.ok) {
      throw new Error('获取消息详情失败');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * 获取会话当前状态（用于轮询）
   */
  async getSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${sessionId}/status`);

    if (!response.ok) {
      throw new Error('获取会话状态失败');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * 创建新分支
   */
  async createBranch(
    sessionId: string,
    fromMessageId: string,
    branchName: string
  ): Promise<ConversationBranch> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${sessionId}/branches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fromMessageId, branchName }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '创建分支失败' }));
      throw new Error(error.error || '创建分支失败');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * 切换到指定分支
   */
  async switchBranch(sessionId: string, branchId: string): Promise<ConversationSession> {
    const response = await fetch(
      `${this.baseUrl}/api/conversations/${sessionId}/branches/${branchId}/activate`,
      {
        method: 'PUT',
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '切换分支失败' }));
      throw new Error(error.error || '切换分支失败');
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * 获取所有分支
   */
  async getBranches(sessionId: string): Promise<ConversationBranch[]> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${sessionId}/branches`);

    if (!response.ok) {
      throw new Error('获取分支列表失败');
    }

    const result = await response.json();
    return result.data || [];
  }

  /**
   * 开始轮询会话状态
   */
  startPolling(
    sessionId: string,
    onUpdate: (status: SessionStatusResponse) => void,
    onError?: (error: Error) => void
  ): void {
    // 如果已经在轮询，先停止
    this.stopPolling(sessionId);

    // 初始化最后活动时间
    if (!this.lastActivityTime.has(sessionId)) {
      this.lastActivityTime.set(sessionId, Date.now());
    }

    // 初始化重试计数
    this.retryCount.set(sessionId, 0);

    // 开始轮询
    this.poll(sessionId, onUpdate, onError);
  }

  /**
   * 停止轮询会话状态
   */
  stopPolling(sessionId: string): void {
    const timer = this.pollingTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.pollingTimers.delete(sessionId);
    }
    this.lastActivityTime.delete(sessionId);
    this.retryCount.delete(sessionId);
  }

  /**
   * 执行轮询
   */
  private async poll(
    sessionId: string,
    onUpdate: (status: SessionStatusResponse) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      // 获取会话状态
      const status = await this.getSessionStatus(sessionId);

      // 重置重试计数
      this.retryCount.set(sessionId, 0);

      // 调用更新回调
      onUpdate(status);

      // 如果有新消息，更新最后活动时间
      if (status.hasNewMessages) {
        this.lastActivityTime.set(sessionId, Date.now());
      }

      // 根据状态决定是否继续轮询
      if (this.shouldContinuePolling(status.status)) {
        const interval = this.getPollingInterval(sessionId, status.status);
        const timer = setTimeout(() => {
          this.poll(sessionId, onUpdate, onError);
        }, interval);
        this.pollingTimers.set(sessionId, timer);
      } else {
        // 停止轮询
        this.stopPolling(sessionId);
      }
    } catch (error) {
      // 处理错误
      const retryCount = this.retryCount.get(sessionId) || 0;
      
      if (retryCount < this.pollingConfig.maxRetries) {
        // 增加重试计数
        this.retryCount.set(sessionId, retryCount + 1);
        
        // 使用指数退避策略重试
        const retryDelay = Math.min(
          this.pollingConfig.activeInterval * Math.pow(2, retryCount),
          this.pollingConfig.reducedInterval
        );
        
        const timer = setTimeout(() => {
          this.poll(sessionId, onUpdate, onError);
        }, retryDelay);
        this.pollingTimers.set(sessionId, timer);
      } else {
        // 达到最大重试次数，停止轮询并通知错误
        this.stopPolling(sessionId);
        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }

  /**
   * 判断是否应该继续轮询
   */
  private shouldContinuePolling(status: ConversationStatus): boolean {
    // 已完成或失败的会话停止轮询
    return status !== ConversationStatus.COMPLETED && status !== ConversationStatus.FAILED;
  }

  /**
   * 获取轮询间隔
   */
  private getPollingInterval(sessionId: string, status: ConversationStatus): number {
    // 如果状态是 EXECUTING 或 PAUSED，使用活跃轮询间隔
    if (status === ConversationStatus.EXECUTING || status === ConversationStatus.PAUSED) {
      return this.pollingConfig.activeInterval;
    }

    // 检查最后活动时间
    const lastActivity = this.lastActivityTime.get(sessionId) || Date.now();
    const timeSinceLastActivity = Date.now() - lastActivity;

    // 如果超过无活动阈值，使用降频轮询间隔
    if (timeSinceLastActivity > this.pollingConfig.inactiveThreshold) {
      return this.pollingConfig.reducedInterval;
    }

    // 否则使用活跃轮询间隔
    return this.pollingConfig.activeInterval;
  }

  /**
   * 清理所有轮询
   */
  cleanup(): void {
    for (const sessionId of this.pollingTimers.keys()) {
      this.stopPolling(sessionId);
    }
  }
}

// 导出单例
export const conversationService = new ConversationService();
export default conversationService;
