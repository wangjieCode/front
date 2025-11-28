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
   * 处理用户消息
   */
  async handleUserMessage(
    sessionId: string,
    content: string
  ): Promise<void> {
    const session = await this.conversationManager.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 如果会话正在执行中,先暂停
    if (session.status === ConversationStatus.EXECUTING) {
      await this.conversationManager.updateSessionStatus(
        sessionId,
        ConversationStatus.PAUSED
      );
    }

    // 添加用户消息
    await this.conversationManager.addMessage(
      sessionId,
      MessageRole.USER,
      content
    );

    // 如果有等待的响应,解决它
    const resolver = this.pendingResponses.get(sessionId);
    if (resolver) {
      resolver(content);
      this.pendingResponses.delete(sessionId);
    }
  }

  /**
   * 处理 AI 响应
   */
  async handleAIResponse(
    sessionId: string,
    response: AIResponse
  ): Promise<void> {
    const session = await this.conversationManager.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 添加 AI 消息
    await this.conversationManager.addMessage(
      sessionId,
      MessageRole.ASSISTANT,
      response.content,
      response.metadata
    );

    // 如果 AI 需要暂停等待用户输入，且当前不是暂停状态
    if (response.shouldPause && session.status !== ConversationStatus.PAUSED) {
      await this.conversationManager.updateSessionStatus(
        sessionId,
        ConversationStatus.PAUSED
      );
    }
  }

  /**
   * 暂停执行等待用户输入
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

    // 更新状态为暂停
    await this.conversationManager.updateSessionStatus(
      sessionId,
      ConversationStatus.PAUSED
    );

    // 等待用户响应
    return new Promise<string>((resolve) => {
      this.pendingResponses.set(sessionId, resolve);
    });
  }

  /**
   * 恢复执行
   */
  async resumeExecution(
    sessionId: string,
    userResponse: string
  ): Promise<void> {
    const session = await this.conversationManager.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 验证会话处于暂停状态
    if (session.status !== ConversationStatus.PAUSED) {
      throw new Error(`会话不在暂停状态: ${session.status}`);
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

    // 恢复执行状态
    await this.conversationManager.updateSessionStatus(
      sessionId,
      ConversationStatus.EXECUTING
    );
  }

  /**
   * 检查会话是否在等待用户输入
   */
  async isWaitingForInput(sessionId: string): Promise<boolean> {
    const session = await this.conversationManager.getSession(sessionId);
    if (!session) {
      return false;
    }

    if (session.status !== ConversationStatus.PAUSED) {
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
