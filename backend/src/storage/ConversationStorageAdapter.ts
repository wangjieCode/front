import { DrizzleConversationStorage } from './DrizzleConversationStorage';
import {
  ConversationSession,
  ConversationMessage,
  ConversationContext,
  ConversationBranch,
  ConversationStatus,
  ConversationMode,
  MessageRole,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * 对话存储接口
 * 定义对话存储的标准接口
 */
export interface IConversationStorage {
  saveSession(session: ConversationSession): Promise<void>;
  loadSession(sessionId: string): Promise<ConversationSession | null>;
  listSessions(): Promise<ConversationSession[]>;
  saveMessage(message: ConversationMessage): Promise<void>;
  loadMessages(sessionId: string, branchId?: string): Promise<ConversationMessage[]>;
  loadMessage(sessionId: string, messageId: string): Promise<ConversationMessage | null>;
  saveContext(sessionId: string, context: ConversationContext): Promise<void>;
  loadContext(sessionId: string): Promise<ConversationContext | null>;
  saveBranch(sessionId: string, branch: ConversationBranch): Promise<void>;
  loadBranch(sessionId: string, branchId: string): Promise<ConversationBranch | null>;
  deleteSession(sessionId: string): Promise<void>;
}

/**
 * DrizzleConversationStorage 适配器
 * 将 DrizzleConversationStorage 适配为 IConversationStorage 接口
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
    // 转换为数据库格式
    await this.storage.saveSession({
      id: session.id,
      sessionId: session.id, // 使用 id 作为 sessionId
      taskId: session.taskId,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt || null,
      error: session.error || null,
    });

    // 先保存分支（因为 context 需要引用 branch ID）
    for (const branch of session.context.branches) {
      // 确保分支 ID 是有效的 UUID
      const branchId = branch.id || uuidv4();
      await this.storage.saveBranch(session.id, {
        id: branchId,
        name: branch.name,
        parentMessageId: branch.parentMessageId && branch.parentMessageId !== '' ? branch.parentMessageId : null,
        isActive: branch.isActive,
        createdAt: branch.createdAt,
      });
    }

    // 然后保存上下文
    await this.storage.saveContext(session.id, {
      workDir: session.context.projectInfo.workDir,
      gitBranch: session.context.projectInfo.gitBranch || null,
      relevantFiles: session.context.projectInfo.relevantFiles || [],
      taskDescription: session.context.taskDescription,
      currentBranchId: session.context.currentBranchId,
      variables: session.context.variables,
      mode: session.context.mode || 'edit',
      contextGitBranch: session.context.gitBranch || null,
      mrUrl: session.context.mrUrl || null,
      previewInfo: session.context.previewInfo || null,
    });
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<ConversationSession | null> {
    const dbSession = await this.storage.loadSession(sessionId);
    if (!dbSession) {
      return null;
    }

    // 加载上下文
    const dbContext = await this.storage.loadContext(sessionId);
    if (!dbContext) {
      return null;
    }

    // 加载分支
    const dbBranches = await this.storage.listBranches(sessionId);

    // 转换为应用格式
    const branches: ConversationBranch[] = dbBranches.map((b) => ({
      id: b.id,
      name: b.name,
      parentMessageId: b.parentMessageId || '',
      messageIds: [], // 需要从消息中获取
      createdAt: b.createdAt,
      isActive: b.isActive,
    }));

    // 获取每个分支的消息 ID 列表
    for (const branch of branches) {
      const messages = await this.storage.loadMessages(sessionId, branch.id);
      branch.messageIds = messages.map((m) => m.id);
    }

    const context: ConversationContext = {
      projectInfo: {
        workDir: dbContext.workDir,
        gitBranch: dbContext.gitBranch || undefined,
        relevantFiles: dbContext.relevantFiles || [],
      },
      taskDescription: dbContext.taskDescription,
      messageHistory: [], // 需要从当前分支获取
      currentBranchId: dbContext.currentBranchId,
      branches,
      variables: dbContext.variables || {},
      mode: (dbContext.mode as ConversationMode) || ConversationMode.EDIT,
      gitBranch: dbContext.contextGitBranch || undefined,
      mrUrl: dbContext.mrUrl || undefined,
      previewInfo: dbContext.previewInfo || undefined,
    };

    // 获取当前分支的消息历史
    const currentBranch = branches.find((b) => b.id === context.currentBranchId);
    if (currentBranch) {
      context.messageHistory = currentBranch.messageIds;
    }

    return {
      id: dbSession.id,
      taskId: dbSession.taskId,
      userId: dbSession.userId,
      status: dbSession.status as ConversationStatus,
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
    const dbSessions = await this.storage.listSessions();
    const sessions: ConversationSession[] = [];

    for (const dbSession of dbSessions) {
      const session = await this.loadSession(dbSession.id);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * 保存消息
   */
  async saveMessage(message: ConversationMessage): Promise<void> {
    await this.storage.saveMessage({
      id: message.id,
      conversationId: message.sessionId,
      branchId: message.branchId,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      parentMessageId: message.parentMessageId || null,
      isComplete: true, // 默认完成
    });

    // 保存元数据
    if (message.metadata) {
      await this.storage.saveMessageMetadata(message.id, {
        toolCalls: message.metadata.toolCalls || null,
        codeChanges: message.metadata.codeChanges || null,
        thinking: message.metadata.thinking || null,
        isQuestion: message.metadata.isQuestion || false,
        questionOptions: message.metadata.questionOptions || null,
        requiresResponse: message.metadata.requiresResponse || false,
      });
    }
  }

  /**
   * 加载消息历史
   */
  async loadMessages(
    sessionId: string,
    branchId?: string
  ): Promise<ConversationMessage[]> {
    const dbMessages = await this.storage.loadMessages(sessionId, branchId);
    const messages: ConversationMessage[] = [];

    for (const dbMsg of dbMessages) {
      // 加载元数据
      const dbMetadata = await this.storage.loadMessageMetadata(dbMsg.id);

      const message: ConversationMessage = {
        id: dbMsg.id,
        sessionId: dbMsg.conversationId,
        branchId: dbMsg.branchId,
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
        };
      }

      messages.push(message);
    }

    return messages;
  }

  /**
   * 加载单条消息
   */
  async loadMessage(
    sessionId: string,
    messageId: string
  ): Promise<ConversationMessage | null> {
    const dbMsg = await this.storage.loadMessage(sessionId, messageId);
    if (!dbMsg) {
      return null;
    }

    // 加载元数据
    const dbMetadata = await this.storage.loadMessageMetadata(dbMsg.id);

    const message: ConversationMessage = {
      id: dbMsg.id,
      sessionId: dbMsg.conversationId,
      branchId: dbMsg.branchId,
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
      };
    }

    return message;
  }

  /**
   * 保存上下文
   */
  async saveContext(
    sessionId: string,
    context: ConversationContext
  ): Promise<void> {
    await this.storage.saveContext(sessionId, {
      workDir: context.projectInfo.workDir,
      gitBranch: context.projectInfo.gitBranch || null,
      relevantFiles: context.projectInfo.relevantFiles || [],
      taskDescription: context.taskDescription,
      currentBranchId: context.currentBranchId,
      variables: context.variables,
      mode: context.mode || 'edit',
      contextGitBranch: context.gitBranch || null,
      mrUrl: context.mrUrl || null,
      previewInfo: context.previewInfo || null,
    });

    // 保存所有分支
    for (const branch of context.branches) {
      await this.storage.saveBranch(sessionId, {
        id: branch.id,
        name: branch.name,
        parentMessageId: branch.parentMessageId || null,
        isActive: branch.isActive,
        createdAt: branch.createdAt,
      });
    }
  }

  /**
   * 加载上下文
   */
  async loadContext(sessionId: string): Promise<ConversationContext | null> {
    const dbContext = await this.storage.loadContext(sessionId);
    if (!dbContext) {
      return null;
    }

    // 加载分支
    const dbBranches = await this.storage.listBranches(sessionId);

    const branches: ConversationBranch[] = dbBranches.map((b) => ({
      id: b.id,
      name: b.name,
      parentMessageId: b.parentMessageId || '',
      messageIds: [],
      createdAt: b.createdAt,
      isActive: b.isActive,
    }));

    // 获取每个分支的消息 ID 列表
    for (const branch of branches) {
      const messages = await this.storage.loadMessages(sessionId, branch.id);
      branch.messageIds = messages.map((m) => m.id);
    }

    const context: ConversationContext = {
      projectInfo: {
        workDir: dbContext.workDir,
        gitBranch: dbContext.gitBranch || undefined,
        relevantFiles: dbContext.relevantFiles || [],
      },
      taskDescription: dbContext.taskDescription,
      messageHistory: [],
      currentBranchId: dbContext.currentBranchId,
      branches,
      variables: dbContext.variables || {},
      mode: (dbContext.mode as ConversationMode) || ConversationMode.EDIT,
      gitBranch: dbContext.contextGitBranch || undefined,
      mrUrl: dbContext.mrUrl || undefined,
      previewInfo: dbContext.previewInfo || undefined,
    };

    // 获取当前分支的消息历史
    const currentBranch = branches.find((b) => b.id === context.currentBranchId);
    if (currentBranch) {
      context.messageHistory = currentBranch.messageIds;
    }

    return context;
  }

  /**
   * 保存分支
   */
  async saveBranch(sessionId: string, branch: ConversationBranch): Promise<void> {
    await this.storage.saveBranch(sessionId, {
      id: branch.id,
      name: branch.name,
      parentMessageId: branch.parentMessageId && branch.parentMessageId !== '' ? branch.parentMessageId : null,
      isActive: branch.isActive,
      createdAt: branch.createdAt,
    });
  }

  /**
   * 加载分支
   */
  async loadBranch(
    sessionId: string,
    branchId: string
  ): Promise<ConversationBranch | null> {
    const dbBranch = await this.storage.loadBranch(sessionId, branchId);
    if (!dbBranch) {
      return null;
    }

    // 获取该分支的消息 ID 列表
    const messages = await this.storage.loadMessages(sessionId, branchId);

    return {
      id: dbBranch.id,
      name: dbBranch.name,
      parentMessageId: dbBranch.parentMessageId || '',
      messageIds: messages.map((m) => m.id),
      createdAt: dbBranch.createdAt,
      isActive: dbBranch.isActive,
    };
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.storage.deleteSession(sessionId);
  }
}
