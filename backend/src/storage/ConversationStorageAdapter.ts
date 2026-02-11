import { DrizzleConversationStorage } from './DrizzleConversationStorage';
import {
  ConversationSession,
  ConversationMessage,
  ConversationContext,
  ConversationStatus,
  ConversationMode,
  MessageRole,
} from '../types';

/**
 * 对话存储接口
 */
export interface IConversationStorage {
  saveSession(session: ConversationSession): Promise<void>;
  loadSession(sessionId: string): Promise<ConversationSession | null>;
  listSessions(): Promise<ConversationSession[]>;
  saveMessage(message: ConversationMessage): Promise<void>;
  loadMessages(sessionId: string, since?: string): Promise<ConversationMessage[]>;
  loadMessage(sessionId: string, messageId: string): Promise<ConversationMessage | null>;
  saveContext(sessionId: string, context: ConversationContext): Promise<void>;
  loadContext(sessionId: string): Promise<ConversationContext | null>;
  deleteSession(sessionId: string): Promise<void>;
  getInactiveSessions(olderThanXDays: number, status?: string): Promise<{ id: string }[]>;
}

/**
 * DrizzleConversationStorage 适配器
 */
export class ConversationStorageAdapter implements IConversationStorage {
  private storage: DrizzleConversationStorage;

  constructor(storage: DrizzleConversationStorage) {
    this.storage = storage;
  }

  /**
   * 保存会话
   */
  async saveSession(session: ConversationSession): Promise<void> {
    const title = this.extractTitle(session.context.taskDescription);
    const summary = session.context.taskDescription;
    const projectName = session.context.projectInfo.projectName || '';

    await this.storage.saveSession({
      id: session.id,
      userId: session.userId,
      projectId: session.context.projectInfo.projectId,
      status: session.status,
      visibility: session.visibility,
      title,
      summary,
      projectName,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt || null,
      error: session.error || null,
    });

    await this.storage.saveContext(session.id, {
      workDir: session.context.projectInfo.workDir,
      worktreePath: session.context.projectInfo.worktreePath,
      gitBranch: session.context.projectInfo.gitBranch || null,
      relevantFiles: session.context.projectInfo.relevantFiles || [],
      taskDescription: session.context.taskDescription,
      variables: session.context.variables,
      mode: session.context.mode || 'edit',
      contextGitBranch: session.context.gitBranch || null,
      mrUrl: session.context.mrUrl || null,
      previewInfo: session.context.previewInfo || null,
    });
  }

  /**
   * 从任务描述中提取标题
   */
  private extractTitle(taskDescription: string): string {
    if (!taskDescription) return '';
    const title = taskDescription.substring(0, 50);
    if (taskDescription.length > 50) {
      return title + '...';
    }
    return title;
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<ConversationSession | null> {
    const dbSession = await this.storage.loadSession(sessionId);
    if (!dbSession) {
      return null;
    }

    if ((dbSession as any).context) {
      const existingContext = (dbSession as any).context as ConversationContext;
      const worktreePath = existingContext.projectInfo?.worktreePath;
      const projectInfo = {
        projectId: dbSession.projectId || existingContext.projectInfo?.projectId || '',
        projectName: dbSession.projectName || existingContext.projectInfo?.projectName || '',
        gitRepositoryUrl: existingContext.projectInfo?.gitRepositoryUrl || '',
        workDir: worktreePath || existingContext.projectInfo?.workDir || '',
        worktreePath,
        gitBranch: existingContext.projectInfo?.gitBranch || undefined,
        relevantFiles: existingContext.projectInfo?.relevantFiles || [],
      };

      return {
        id: dbSession.id,
        userId: dbSession.userId,
        status: dbSession.status as ConversationStatus,
        visibility: (dbSession as any).visibility || 'private',
        context: {
          ...existingContext,
          projectInfo,
        },
        createdAt: dbSession.createdAt,
        updatedAt: dbSession.updatedAt,
        completedAt: dbSession.completedAt || undefined,
        error: dbSession.error || undefined,
        title: dbSession.title || undefined,
      };
    }

    const dbContext = await this.storage.loadContext(sessionId);
    if (!dbContext) {
      return null;
    }

    const worktreePath = dbContext.projectInfo?.worktreePath;
    const context: ConversationContext = {
      projectInfo: {
        projectId: dbSession.projectId || '',
        projectName: dbSession.projectName || '',
        gitRepositoryUrl: '',
        workDir: worktreePath || dbContext.projectInfo?.workDir || '',
        worktreePath,
        gitBranch: dbContext.gitBranch || undefined,
        relevantFiles: dbContext.relevantFiles || [],
      },
      taskDescription: dbContext.taskDescription,
      messageHistory: [],
      variables: dbContext.variables || {},
      mode: (dbContext.mode as ConversationMode) || ConversationMode.EDIT,
      gitBranch: dbContext.contextGitBranch || undefined,
      mrUrl: dbContext.mrUrl || undefined,
      previewInfo: dbContext.previewInfo || undefined,
    };

    const messages = await this.storage.loadMessages(sessionId);
    context.messageHistory = messages.map((m) => m.id);

    return {
      id: dbSession.id,
      userId: dbSession.userId,
      status: dbSession.status as ConversationStatus,
      visibility: (dbSession as any).visibility || 'private',
      context,
      createdAt: dbSession.createdAt,
      updatedAt: dbSession.updatedAt,
      completedAt: dbSession.completedAt || undefined,
      error: dbSession.error || undefined,
    };
  }

  /**
   * 获取所有会话列表
   */
  async listSessions(): Promise<ConversationSession[]> {
    try {
      const dbSessions = await this.storage.listSessions();

      const sessions: ConversationSession[] = dbSessions.map(dbSession => ({
        id: dbSession.id,
        userId: dbSession.userId || undefined,
        status: dbSession.status as ConversationStatus,
        visibility: (dbSession as any).visibility || 'private',
        context: {
          projectInfo: {
            projectId: dbSession.projectId || undefined,
            projectName: dbSession.projectName || '',
            workDir: (dbSession as any).context?.projectInfo?.workDir || '',
            gitRepositoryUrl: '',
          },
          taskDescription: (dbSession as any).context?.taskDescription || dbSession.summary || '',
          mode: (dbSession as any).context?.mode || ConversationMode.EDIT,
          messageHistory: [],
          variables: (dbSession as any).context?.variables || {},
        } as ConversationContext,
        createdAt: dbSession.createdAt,
        updatedAt: dbSession.updatedAt,
        completedAt: dbSession.completedAt || undefined,
        error: dbSession.error || undefined,
        title: dbSession.title || '',
      }));
      return sessions;
    } catch (error) {
      console.error('[ConversationStorageAdapter] listSessions 错误:', error);
      throw error;
    }
  }

  /**
   * 保存消息
   */
  async saveMessage(message: ConversationMessage): Promise<void> {
    await this.storage.saveMessage({
      id: message.id,
      conversationId: message.sessionId,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      parentMessageId: message.parentMessageId || null,
      isComplete: true,
    });

    if (message.metadata) {
      await this.storage.saveMessageMetadata(message.id, {
        toolCalls: message.metadata.toolCalls || null,
        codeChanges: message.metadata.codeChanges || null,
        thinking: message.metadata.thinking || null,
        isQuestion: message.metadata.isQuestion || null,
        questionOptions: message.metadata.questionOptions || null,
        requiresResponse: message.metadata.requiresResponse || null,
        messageReferences: message.metadata.references || null,
        isInvalid: message.metadata.isInvalid || null,
        gitBranch: message.metadata.gitBranch || null,
        mrUrl: message.metadata.mrUrl || null,
        images: message.metadata.images || null,
        operationDenied: message.metadata.operationDenied || null,
      });
    }
  }

  /**
   * 加载消息列表
   */
  async loadMessages(sessionId: string, since?: string): Promise<ConversationMessage[]> {
    const dbMessagesWithMetadata = await this.storage.loadMessagesWithMetadata(sessionId, since);
    
    return dbMessagesWithMetadata.map(dbMsg => {
      const message: ConversationMessage = {
        id: dbMsg.id,
        sessionId: dbMsg.conversationId,
        role: dbMsg.role as MessageRole,
        content: dbMsg.content,
        timestamp: dbMsg.timestamp,
        parentMessageId: dbMsg.parentMessageId || undefined,
      };

      if (dbMsg.metadata) {
        const dbMetadata = dbMsg.metadata;
        message.metadata = {
          toolCalls: dbMetadata.toolCalls || undefined,
          codeChanges: dbMetadata.codeChanges || undefined,
          thinking: dbMetadata.thinking || undefined,
          isQuestion: dbMetadata.isQuestion || undefined,
          questionOptions: dbMetadata.questionOptions || undefined,
          requiresResponse: dbMetadata.requiresResponse || undefined,
          references: dbMetadata.messageReferences || undefined,
          isInvalid: dbMetadata.isInvalid || undefined,
          gitBranch: dbMetadata.gitBranch || undefined,
          mrUrl: dbMetadata.mrUrl || undefined,
          images: dbMetadata.images || undefined,
          operationDenied: dbMetadata.operationDenied || undefined,
        };
      }

      return message;
    });
  }

  /**
   * 加载单条消息
   */
  async loadMessage(sessionId: string, messageId: string): Promise<ConversationMessage | null> {
    const dbMsg = await this.storage.loadMessage(sessionId, messageId);
    if (!dbMsg) {
      return null;
    }

    const dbMetadata = await this.storage.loadMessageMetadata(dbMsg.id);

    const message: ConversationMessage = {
      id: dbMsg.id,
      sessionId: dbMsg.conversationId,
      role: dbMsg.role as MessageRole,
      content: dbMsg.content,
      timestamp: dbMsg.timestamp,
      parentMessageId: dbMsg.parentMessageId || undefined,
    };

    if (dbMetadata) {
      message.metadata = {
        toolCalls: dbMetadata.toolCalls || undefined,
        codeChanges: dbMetadata.codeChanges || undefined,
        thinking: dbMetadata.thinking || undefined,
        isQuestion: dbMetadata.isQuestion || undefined,
        questionOptions: dbMetadata.questionOptions || undefined,
        requiresResponse: dbMetadata.requiresResponse || undefined,
        references: dbMetadata.messageReferences || undefined,
        isInvalid: dbMetadata.isInvalid || undefined,
        gitBranch: dbMetadata.gitBranch || undefined,
        mrUrl: dbMetadata.mrUrl || undefined,
        images: dbMetadata.images || undefined,
        operationDenied: dbMetadata.operationDenied || undefined,
      };
    }

    return message;
  }

  /**
   * 保存上下文
   */
  async saveContext(sessionId: string, context: ConversationContext): Promise<void> {
    await this.storage.saveContext(sessionId, {
      workDir: context.projectInfo.workDir,
      gitBranch: context.projectInfo.gitBranch || null,
      relevantFiles: context.projectInfo.relevantFiles || [],
      taskDescription: context.taskDescription,
      variables: context.variables,
      mode: context.mode || 'edit',
      contextGitBranch: context.gitBranch || null,
      mrUrl: context.mrUrl || null,
      previewInfo: context.previewInfo || null,
    });
  }

  /**
   * 加载上下文
   */
  async loadContext(sessionId: string): Promise<ConversationContext | null> {
    const dbContext = await this.storage.loadContext(sessionId);
    if (!dbContext) {
      return null;
    }

    const dbSession = await this.storage.loadSession(sessionId);
    if (!dbSession) {
      return null;
    }

    const context: ConversationContext = {
      projectInfo: {
        projectId: dbSession.projectId || '',
        projectName: dbSession.projectName || '',
        workDir: dbContext.workDir,
        gitRepositoryUrl: '',
        gitBranch: dbContext.gitBranch || undefined,
        relevantFiles: dbContext.relevantFiles || [],
      },
      taskDescription: dbContext.taskDescription,
      messageHistory: [],
      variables: dbContext.variables || {},
      mode: (dbContext.mode as ConversationMode) || ConversationMode.EDIT,
      gitBranch: dbContext.contextGitBranch || undefined,
      mrUrl: dbContext.mrUrl || undefined,
      previewInfo: dbContext.previewInfo || undefined,
    };

    const messages = await this.storage.loadMessages(sessionId);
    context.messageHistory = messages.map((m) => m.id);

    return context;
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.storage.deleteSession(sessionId);
  }

  /**
   * 获取不活跃的会话 ID 列表
   */
  async getInactiveSessions(olderThanXDays: number, status: string = 'active'): Promise<{ id: string }[]> {
    return await this.storage.getInactiveSessions(olderThanXDays, status);
  }
}
