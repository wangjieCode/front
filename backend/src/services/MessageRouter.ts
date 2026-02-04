import {
  ConversationStatus,
  MessageRole,
  AIResponse,
  MessageMetadata,
} from '../types';
import { ConversationManager } from './ConversationManager';

/**
 * 消息路由器类
 * 负责协调用户消息和 AI 响应的处理流程
 */
export class MessageRouter {
  private conversationManager: ConversationManager;
  private pendingResponses: Map<string, (response: string) => void> = new Map();

  constructor(conversationManager: ConversationManager) {
    this.conversationManager = conversationManager;
  }

  /**
   * 处理用户消息（简化版本）
   */
  async handleUserMessage(
    sessionId: string,
    content: string,
    metadata?: MessageMetadata,
    existingSession?: any, // 可选的已存在会话对象，避免重复查询
    asyncSave: boolean = false // 是否异步保存
  ): Promise<void> {
    const session = existingSession || await this.conversationManager.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 检查会话是否已归档
    if (session.status === ConversationStatus.ARCHIVED) {
      throw new Error('已归档的对话不能发送消息');
    }

    // 添加用户消息
    await this.conversationManager.addMessage(
      sessionId,
      MessageRole.USER,
      content,
      metadata,
      session,
      asyncSave
    );

    // 如果有等待的响应,解决它
    const resolver = this.pendingResponses.get(sessionId);
    if (resolver) {
      resolver(content);
      this.pendingResponses.delete(sessionId);
    }
  }

  /**
   * 处理 AI 响应（简化版本）
   */
  async handleAIResponse(
    sessionId: string,
    response: AIResponse,
    existingSession?: any
  ): Promise<void> {
    const session = existingSession || await this.conversationManager.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 检查会话是否已归档
    if (session.status === ConversationStatus.ARCHIVED) {
      throw new Error('已归档的对话不能生成响应');
    }

    // 添加 AI 消息
    await this.conversationManager.addMessage(
      sessionId,
      MessageRole.ASSISTANT,
      response.content,
      response.metadata,
      session
    );

    // Git 信息回写逻辑已移除，MR 创建作为独立操作处理
    // 简化状态模型下，不再需要 shouldPause 逻辑
  }

  /**
   * 暂停执行等待用户输入（简化版本）
   * 注意：简化状态模型下，此方法主要用于创建询问消息
   */
  async pauseForUserInput(
    sessionId: string,
    question: string,
    options?: string[]
  ): Promise<string> {
    const session = await this.conversationManager.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 检查会话是否已归档
    if (session.status === ConversationStatus.ARCHIVED) {
      throw new Error('已归档的对话不能询问');
    }

    // 创建询问消息的元数据
    const metadata: MessageMetadata = {
      isQuestion: true,
      questionOptions: options,
      requiresResponse: true,
    };

    // 添加询问消息
    await this.conversationManager.addMessage(
      sessionId,
      MessageRole.ASSISTANT,
      question,
      metadata
    );

    // 等待用户响应
    return new Promise<string>((resolve) => {
      this.pendingResponses.set(sessionId, resolve);
    });
  }

  /**
   * 恢复执行（简化版本）
   * 注意：简化状态模型下，此方法主要用于添加用户响应
   */
  async resumeExecution(
    sessionId: string,
    userResponse: string
  ): Promise<void> {
    const session = await this.conversationManager.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 检查会话是否已归档
    if (session.status === ConversationStatus.ARCHIVED) {
      throw new Error('已归档的对话不能恢复执行');
    }

    // 添加用户响应
    await this.conversationManager.addMessage(
      sessionId,
      MessageRole.USER,
      userResponse
    );

    // 将响应保存到上下文变量中
    const lastMessages = await this.conversationManager.getMessageHistory(sessionId);
    const lastQuestion = lastMessages
      .reverse()
      .find(m => m.role === MessageRole.ASSISTANT && m.metadata?.isQuestion);

    if (lastQuestion) {
      await this.conversationManager.updateContextVariable(
        sessionId,
        `answer_to_${lastQuestion.id}`,
        userResponse
      );
    }
  }

  /**
   * 检查会话是否在等待用户输入（简化版本）
   */
  async isWaitingForInput(sessionId: string): Promise<boolean> {
    const session = await this.conversationManager.getSession(sessionId);
    if (!session) {
      return false;
    }

    // 已归档的对话不等待输入
    if (session.status === ConversationStatus.ARCHIVED) {
      return false;
    }

    // 检查最后一条消息是否是询问
    const messages = await this.conversationManager.getMessageHistory(sessionId);
    if (messages.length === 0) {
      return false;
    }

    const lastMessage = messages[messages.length - 1];
    return (
      lastMessage.role === MessageRole.ASSISTANT &&
      lastMessage.metadata?.isQuestion === true
    );
  }

  /**
   * 获取待回答的问题
   */
  async getPendingQuestion(sessionId: string): Promise<{
    question: string;
    options?: string[];
  } | null> {
    const isWaiting = await this.isWaitingForInput(sessionId);
    if (!isWaiting) {
      return null;
    }

    const messages = await this.conversationManager.getMessageHistory(sessionId);
    const lastMessage = messages[messages.length - 1];

    if (lastMessage.metadata?.isQuestion) {
      return {
        question: lastMessage.content,
        options: lastMessage.metadata.questionOptions,
      };
    }

    return null;
  }

  /**
   * 取消等待的响应
   */
  cancelPendingResponse(sessionId: string): void {
    const resolver = this.pendingResponses.get(sessionId);
    if (resolver) {
      // 使用空字符串解决 Promise
      resolver('');
      this.pendingResponses.delete(sessionId);
    }
  }

  /**
   * 清理所有等待的响应
   */
  clearAllPendingResponses(): void {
    this.pendingResponses.forEach((resolver) => {
      resolver('');
    });
    this.pendingResponses.clear();
  }
}
