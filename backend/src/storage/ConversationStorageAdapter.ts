import { DrizzleConversationStorage } from './DrizzleConversationStorage';
import type {
  ListSessionsOptions,
  MessageHistoryVersion,
  SessionAccessInfo,
} from './DrizzleConversationStorage';
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
  loadSessionAccessInfo(sessionId: string): Promise<SessionAccessInfo | null>;
  listSessions(options?: ListSessionsOptions): Promise<ConversationSession[]>;
  getMessageHistoryVersion(sessionId: string): Promise<MessageHistoryVersion>;
  saveMessage(message: ConversationMessage): Promise<void>;
  loadMessages(sessionId: string, since?: string): Promise<ConversationMessage[]>;
  loadMessage(sessionId: string, messageId: string): Promise<ConversationMessage | null>;
  saveContext(sessionId: string, context: ConversationContext): Promise<void>;
  loadContext(sessionId: string): Promise<ConversationContext | null>;
  deleteSession(sessionId: string): Promise<void>;
  getInactiveSessions(olderThanXDays: number, status?: string): Promise<{ id: string }[]>;
  getReviewSidebar(sessionId: string): Promise<ReviewSidebarData>;
  getReviewFiles(sessionId: string): Promise<ReviewFilesData>;
  getReviewDiff(sessionId: string, filePath: string, roundId?: string): Promise<ReviewDiffData>;
  getReviewUpdates(sessionId: string, since: string): Promise<ReviewUpdatesData>;
}

export interface ReviewSidebarItem {
  roundId: string;
  status: string | null;
  summary: string | null;
  fileCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ReviewSidebarData {
  sessionId: string;
  totalRounds: number;
  rounds: ReviewSidebarItem[];
}

export interface ReviewDiffItem {
  changeId: string;
  roundId: string;
  filePath: string;
  oldPath: string | null;
  status: string | null;
  patch: string | null;
  additions: number;
  deletions: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ReviewDiffData {
  sessionId: string;
  filePath: string;
  roundId: string | null;
  items: ReviewDiffItem[];
}

export interface ReviewFileItem {
  filePath: string;
  changeType: string | null;
  additions: number;
  deletions: number;
}

export interface ReviewFilesData {
  sessionId: string;
  files: ReviewFileItem[];
}

export interface ReviewUpdateItem {
  kind: 'round' | 'file';
  itemId: string;
  roundId: string;
  filePath: string | null;
  status: string | null;
  summary: string | null;
  updatedAt: Date | null;
}

export interface ReviewUpdatesData {
  sessionId: string;
  since: string;
  items: ReviewUpdateItem[];
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

  async loadSessionAccessInfo(sessionId: string): Promise<SessionAccessInfo | null> {
    return this.storage.loadSessionAccessInfo(sessionId);
  }

  /**
   * 获取所有会话列表
   */
  async listSessions(options?: ListSessionsOptions): Promise<ConversationSession[]> {
    try {
      const dbSessions = await this.storage.listSessions(options);

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
   * 保存消息（D1：元数据随消息一起单次 INSERT，不再分两步）
   */
  async saveMessage(message: ConversationMessage): Promise<void> {
    const meta = message.metadata;
    await this.storage.saveMessage({
      id: message.id,
      conversationId: message.sessionId,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      parentMessageId: message.parentMessageId || null,
      toolCalls: meta?.toolCalls ?? null,
      codeChanges: meta?.codeChanges ?? null,
      thinking: meta?.thinking ?? null,
      isQuestion: meta?.isQuestion ?? false,
      questionOptions: meta?.questionOptions ?? null,
      requiresResponse: meta?.requiresResponse ?? false,
      messageReferences: meta?.references ?? null,
      isInvalid: meta?.isInvalid ?? false,
      gitBranch: meta?.gitBranch ?? null,
      mrUrl: meta?.mrUrl ?? null,
      images: meta?.images ?? null,
      operationDenied: meta?.operationDenied ?? null,
    });
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
          isQuestion: dbMetadata.isQuestion ?? undefined,
          questionOptions: dbMetadata.questionOptions || undefined,
          requiresResponse: dbMetadata.requiresResponse ?? undefined,
          references: dbMetadata.messageReferences || undefined,
          isInvalid: dbMetadata.isInvalid ?? undefined,
          gitBranch: dbMetadata.gitBranch || undefined,
          mrUrl: dbMetadata.mrUrl || undefined,
          images: dbMetadata.images || undefined,
          operationDenied: dbMetadata.operationDenied || undefined,
        };
      }

      return message;
    });
  }

  async getMessageHistoryVersion(sessionId: string): Promise<MessageHistoryVersion> {
    return this.storage.getMessageHistoryVersion(sessionId);
  }

  async getReviewSidebar(sessionId: string): Promise<ReviewSidebarData> {
    return this.storage.getReviewSidebar(sessionId);
  }

  async getReviewFiles(sessionId: string): Promise<ReviewFilesData> {
    return this.storage.getReviewFiles(sessionId);
  }

  async getReviewDiff(sessionId: string, filePath: string, roundId?: string): Promise<ReviewDiffData> {
    return this.storage.getReviewDiff(sessionId, filePath, roundId);
  }

  async getReviewUpdates(sessionId: string, since: string): Promise<ReviewUpdatesData> {
    return this.storage.getReviewUpdates(sessionId, since);
  }

  /**
   * 加载单条消息（D1：元数据直接从 messages 列读取，无需单独查 message_metadata）
   */
  async loadMessage(sessionId: string, messageId: string): Promise<ConversationMessage | null> {
    const dbMsg = await this.storage.loadMessage(sessionId, messageId);
    if (!dbMsg) return null;

    const message: ConversationMessage = {
      id: dbMsg.id,
      sessionId: dbMsg.conversationId,
      role: dbMsg.role as MessageRole,
      content: dbMsg.content,
      timestamp: dbMsg.timestamp,
      parentMessageId: dbMsg.parentMessageId || undefined,
    };

    const hasMetadata = !!(
      dbMsg.toolCalls || dbMsg.codeChanges || dbMsg.thinking ||
      dbMsg.isQuestion || dbMsg.requiresResponse || dbMsg.isInvalid ||
      dbMsg.gitBranch || dbMsg.mrUrl || dbMsg.images || dbMsg.operationDenied ||
      dbMsg.messageReferences || dbMsg.questionOptions
    );
    if (hasMetadata) {
      message.metadata = {
        toolCalls: (dbMsg.toolCalls as any) || undefined,
        codeChanges: (dbMsg.codeChanges as any) || undefined,
        thinking: dbMsg.thinking || undefined,
        isQuestion: dbMsg.isQuestion ?? undefined,
        questionOptions: (dbMsg.questionOptions as any) || undefined,
        requiresResponse: dbMsg.requiresResponse ?? undefined,
        references: (dbMsg.messageReferences as any) || undefined,
        isInvalid: dbMsg.isInvalid ?? undefined,
        gitBranch: dbMsg.gitBranch || undefined,
        mrUrl: dbMsg.mrUrl || undefined,
        images: (dbMsg.images as any) || undefined,
        operationDenied: (dbMsg.operationDenied as any) || undefined,
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
