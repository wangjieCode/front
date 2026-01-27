import { ConversationManager } from '../services/ConversationManager';
import { MessageRouter } from '../services/MessageRouter';
import { ConversationStatus } from '../types';
import dayjs from 'dayjs';

/**
 * 超时配置
 */
export interface TimeoutConfig {
  aiResponseTimeout: number;      // AI 响应超时(毫秒)
  userInputTimeout: number;        // 用户输入超时(毫秒)
  maxRetries: number;              // 最大重试次数
  retryDelay: number;              // 重试延迟(毫秒)
}

/**
 * 默认超时配置
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  aiResponseTimeout: 60000,        // 60 秒
  userInputTimeout: 300000,        // 5 分钟
  maxRetries: 3,
  retryDelay: 1000,                // 1 秒
};

/**
 * 超时处理器类
 */
export class TimeoutHandler {
  private config: TimeoutConfig;
  private conversationManager: ConversationManager;
  private messageRouter: MessageRouter;
  private timeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    conversationManager: ConversationManager,
    messageRouter: MessageRouter,
    config: TimeoutConfig = DEFAULT_TIMEOUT_CONFIG
  ) {
    this.config = config;
    this.conversationManager = conversationManager;
    this.messageRouter = messageRouter;
  }

  /**
   * 设置 AI 响应超时
   */
  setAIResponseTimeout(sessionId: string, onTimeout: () => void): void {
    this.clearTimeout(sessionId);

    const timeout = setTimeout(() => {
      onTimeout();
      this.handleAIResponseTimeout(sessionId);
    }, this.config.aiResponseTimeout);

    this.timeouts.set(sessionId, timeout);
  }

  /**
   * 设置用户输入超时
   */
  setUserInputTimeout(sessionId: string, onTimeout: () => void): void {
    this.clearTimeout(sessionId);

    const timeout = setTimeout(() => {
      onTimeout();
      this.handleUserInputTimeout(sessionId);
    }, this.config.userInputTimeout);

    this.timeouts.set(sessionId, timeout);
  }

  /**
   * 清除超时
   */
  clearTimeout(sessionId: string): void {
    const timeout = this.timeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(sessionId);
    }
  }

  /**
   * 处理 AI 响应超时
   */
  private async handleAIResponseTimeout(sessionId: string): Promise<void> {
    try {
      const session = await this.conversationManager.getSession(sessionId);
      if (!session) {
        return;
      }

      // 更新会话状态为失败
      await this.conversationManager.updateSessionStatus(
        sessionId,
        ConversationStatus.FAILED,
        'AI 响应超时'
      );

      console.error(`会话 ${sessionId} AI 响应超时`);
    } catch (error) {
      console.error('处理 AI 响应超时失败:', error);
    }
  }

  /**
   * 处理用户输入超时
   */
  private async handleUserInputTimeout(sessionId: string): Promise<void> {
    try {
      const session = await this.conversationManager.getSession(sessionId);
      if (!session) {
        return;
      }

      // 如果会话处于暂停状态,使用默认选项或标记为需要介入
      if (session.status === ConversationStatus.PAUSED) {
        const pendingQuestion = await this.messageRouter.getPendingQuestion(sessionId);

        if (pendingQuestion && pendingQuestion.options && pendingQuestion.options.length > 0) {
          // 使用第一个选项作为默认选项
          const defaultOption = pendingQuestion.options[0];
          await this.messageRouter.resumeExecution(sessionId, defaultOption);
          console.log(`会话 ${sessionId} 用户输入超时,使用默认选项: ${defaultOption}`);
        } else {
          // 标记为需要用户介入
          await this.conversationManager.updateSessionStatus(
            sessionId,
            ConversationStatus.FAILED,
            '等待用户输入超时'
          );
          console.error(`会话 ${sessionId} 用户输入超时`);
        }
      }
    } catch (error) {
      console.error('处理用户输入超时失败:', error);
    }
  }

  /**
   * 带重试的异步操作
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string = '操作'
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`${operationName} 失败 (尝试 ${attempt}/${this.config.maxRetries}):`, lastError.message);

        if (attempt < this.config.maxRetries) {
          // 等待后重试
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt));
        }
      }
    }

    throw new Error(`${operationName} 失败,已重试 ${this.config.maxRetries} 次: ${lastError?.message}`);
  }

  /**
   * 带超时的异步操作
   */
  async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string = '操作'
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${operationName} 超时 (${timeoutMs}ms)`)), timeoutMs)
      ),
    ]);
  }

  /**
   * 清理所有超时
   */
  clearAll(): void {
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();
  }
}

/**
 * 错误恢复策略
 */
export class ErrorRecoveryStrategy {
  /**
   * 判断错误是否可恢复
   */
  static isRecoverable(error: Error): boolean {
    // 网络错误、超时错误等通常可以重试
    const recoverablePatterns = [
      /timeout/i,
      /network/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /ENOTFOUND/i,
    ];

    return recoverablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * 获取错误的用户友好消息
   */
  static getUserFriendlyMessage(error: Error): string {
    if (/timeout/i.test(error.message)) {
      return '操作超时,请稍后重试';
    }

    if (/network/i.test(error.message) || /ECONNREFUSED/i.test(error.message)) {
      return '网络连接失败,请检查网络设置';
    }

    if (/not found/i.test(error.message) || /ENOENT/i.test(error.message)) {
      return '请求的资源不存在';
    }

    if (/permission/i.test(error.message) || /EACCES/i.test(error.message)) {
      return '权限不足,无法执行操作';
    }

    // 默认消息
    return '操作失败,请重试';
  }

  /**
   * 记录错误日志
   */
  static logError(error: Error, context: string): void {
    console.error(`[${context}] 错误:`, {
      message: error.message,
      stack: error.stack,
      timestamp: dayjs().toISOString(),
    });
  }
}
