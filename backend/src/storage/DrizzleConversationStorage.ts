import { eq, and, desc, asc } from 'drizzle-orm';
import { DatabaseManager } from '../db/DatabaseManager';
import {
  conversations,
  conversationContexts,
  messages,
  messageMetadata,
  projects,
  type Conversation,
  type NewConversation,
  type Message,
  type NewMessage,
} from '../db/schema';

/**
 * 分页选项
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * 基于 Drizzle ORM 的对话存储实现
 */
export class DrizzleConversationStorage {
  private cache: Map<string, any>;

  constructor() {
    this.cache = new Map();
  }

  /**
   * 获取数据库实例
   */
  private getDb() {
    return DatabaseManager.getDb();
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 从缓存获取数据
   */
  private getCached<T>(key: string): T | undefined {
    return this.cache.get(key);
  }

  /**
   * 设置缓存
   */
  private setCache<T>(key: string, value: T): void {
    this.cache.set(key, value);
  }

  /**
   * 删除缓存
   */
  private deleteCache(key: string): void {
    this.cache.delete(key);
  }

  // ==================== 会话管理方法 ====================

  /**
   * 保存会话（插入或更新）
   */
  async saveSession(session: any): Promise<void> {
    const db = this.getDb();

    if (!session.id) {
      throw new Error('Session ID is required');
    }

    // 1. 构建对话数据
    const conversationData = {
      id: session.id,
      sessionId: session.sessionId || session.id, // 确保有 sessionId
      taskId: session.taskId,
      userId: session.userId,
      projectId: session.projectId || session.context?.projectInfo?.projectId,
      status: session.status,
      title: session.title,
      summary: session.summary,
      projectName: session.projectName || session.context?.projectInfo?.projectName,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt,
      error: session.error,
    };

    // 检查会话是否已存在
    const existing = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, session.id))
      .limit(1);

    if (existing.length > 0) {
      // 更新现有会话
      await db
        .update(conversations)
        .set({
          status: conversationData.status,
          title: conversationData.title,
          summary: conversationData.summary,
          projectId: conversationData.projectId,
          projectName: conversationData.projectName,
          updatedAt: conversationData.updatedAt,
          completedAt: conversationData.completedAt,
          error: conversationData.error,
        })
        .where(eq(conversations.id, session.id));
    } else {
      // 插入新会话
      await db.insert(conversations).values(conversationData);
    }

    // 2. 保存上下文（如果存在）
    if (session.context) {
      await this.saveContext(session.id, session.context);
    }

    // 清除相关缓存
    this.deleteCache(`session:${session.id}`);
    this.deleteCache(`session:${session.sessionId || session.id}`);
    this.deleteCache('sessions:list');
  }

  /**
   * 通过 ID 加载会话
   */
  async loadSession(sessionId: string): Promise<Conversation | null> {
    const db = this.getDb();

    // Join with projects table to get project details
    const result = await db
      .select({
        conversation: conversations,
        projectRepoUrl: projects.gitRepositoryUrl,
        projectNameJoined: projects.name,
      })
      .from(conversations)
      .leftJoin(projects, eq(conversations.projectId, projects.id))
      .where(eq(conversations.id, sessionId))
      .limit(1);

    const row = result[0];

    if (row) {
      const rawSession = row.conversation;
      // Attach joined data to session object (as non-enumerable or just properties)
      // We cast to any to avoid type issues, but ideally we should extend the type
      const sessionWithExtra = {
        ...rawSession,
        projectRepoUrl: row.projectRepoUrl,
        projectNameJoined: row.projectNameJoined,
        projectName: rawSession.projectName || row.projectNameJoined || null, // Use joined name if saved name is missing
      };

      // 加载关联的上下文
      const context = await this.loadContext(sessionId);
      if (context) {
        // 创建一个新的session对象，确保包含context字段
        const session = {
          ...sessionWithExtra,
          context: context
        };
        return session as unknown as Conversation;
      } else {
        const session = {
          ...sessionWithExtra,
          context: null
        };
        return session as unknown as Conversation;
      }
    } else {
      return null;
    }
  }

  /**
   * 通过 Agent sessionId 加载会话
   */
  async loadSessionByAgentSessionId(agentSessionId: string): Promise<Conversation | null> {
    // 检查缓存
    const cached = this.getCached<Conversation>(`agent-session:${agentSessionId}`);
    if (cached) {
      return cached;
    }

    const db = this.getDb();

    const result = await db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, agentSessionId))
      .limit(1);

    const session = result[0] || null;

    // 缓存结果
    if (session) {
      this.setCache(`agent-session:${agentSessionId}`, session);
      this.setCache(`session:${session.id}`, session);
    }

    return session;
  }

  /**
   * 列出所有会话（优化版，包含项目名称和第一条消息）
   */
  async listSessions(): Promise<Conversation[]> {
    // 检查缓存
    const cached = this.getCached<Conversation[]>('sessions:list');
    if (cached) {
      return cached;
    }

    const db = this.getDb();

    // 直接查询 conversations 表，并关联 projects 表获取最新的项目名称，以及 conversationContexts 获取 mode 和其他必要信息
    const results = await db
      .select({
        conversation: conversations,
        projectNameJoined: projects.name,
        mode: conversationContexts.mode,
        taskDescription: conversationContexts.taskDescription,
        workDir: conversationContexts.workDir,
      })
      .from(conversations)
      .leftJoin(projects, eq(conversations.projectId, projects.id))
      .leftJoin(conversationContexts, eq(conversations.id, conversationContexts.conversationId))
      .orderBy(desc(conversations.createdAt));

    // 使用关联查询的项目名称作为备选，并构造 context 对象包含 mode
    const sessions = results.map(row => ({
      ...row.conversation,
      projectName: row.conversation.projectName || row.projectNameJoined || null,
      context: {
        mode: row.mode || 'edit', // Default to edit if missing
        taskDescription: row.taskDescription,
        projectInfo: {
          workDir: row.workDir
        }
      }
    }));

    // 缓存结果
    this.setCache('sessions:list', sessions);

    return sessions;
  }

  /**
   * 更新会话
   */
  async updateSession(sessionId: string, updates: Partial<NewConversation>): Promise<void> {
    const db = this.getDb();

    await db
      .update(conversations)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, sessionId));

    // 清除相关缓存
    this.deleteCache(`session:${sessionId}`);
    this.deleteCache('sessions:list');
  }

  /**
   * 删除会话（应用层级联删除）
   */
  async deleteSession(sessionId: string): Promise<void> {
    const db = this.getDb();

    // 使用事务确保数据一致性
    await db.transaction(async (tx) => {
      // 1. 删除消息元数据
      const messagesToDelete = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.conversationId, sessionId));

      for (const msg of messagesToDelete) {
        await tx.delete(messageMetadata).where(eq(messageMetadata.messageId, msg.id));
      }

      // 2. 删除消息
      await tx.delete(messages).where(eq(messages.conversationId, sessionId));

      // 3. 删除上下文
      await tx.delete(conversationContexts).where(eq(conversationContexts.conversationId, sessionId));

      // 4. 删除会话
      await tx.delete(conversations).where(eq(conversations.id, sessionId));
    });

    // 清除所有相关缓存
    this.clearCache();
  }

  // ==================== 消息管理方法 ====================

  /**
   * 保存消息
   */
  async saveMessage(message: NewMessage): Promise<void> {
    const db = this.getDb();

    await db.insert(messages).values(message);

    // 清除相关缓存
    this.deleteCache(`messages:${message.conversationId}`);
    this.deleteCache(`messages:${message.conversationId}:${message.branchId}`);
  }

  /**
   * 加载消息列表（支持分页）
   */
  async loadMessages(
    conversationId: string,
    options?: PaginationOptions
  ): Promise<Message[]> {
    const cacheKey = `messages:${conversationId}`;

    // 检查缓存（仅当没有分页时）
    if (!options) {
      const cached = this.getCached<Message[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const db = this.getDb();

    let query = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.timestamp));

    // 应用分页
    if (options?.limit) {
      query = query.limit(options.limit) as any;
    }
    if (options?.offset) {
      query = query.offset(options.offset) as any;
    }

    const result = await query;

    // 缓存结果（仅当没有分页时）
    if (!options) {
      this.setCache(cacheKey, result);
    }

    return result;
  }

  /**
   * 加载单条消息
   */
  async loadMessage(conversationId: string, messageId: string): Promise<Message | null> {
    const db = this.getDb();

    const result = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.id, messageId)
        )
      )
      .limit(1);

    return result[0] || null;
  }

  /**
   * 更新消息内容（用于流式响应）
   */
  async updateMessageContent(
    messageId: string,
    content: string,
    isComplete: boolean
  ): Promise<void> {
    const db = this.getDb();

    await db
      .update(messages)
      .set({ content, isComplete })
      .where(eq(messages.id, messageId));

    // 清除相关缓存
    this.clearCache();
  }

  /**
   * 获取消息数量
   */
  async getMessageCount(conversationId: string): Promise<number> {
    const db = this.getDb();

    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    return result.length;
  }

  // ==================== 上下文管理方法 ====================

  /**
   * 保存对话上下文
   */
  async saveContext(conversationId: string, context: any): Promise<void> {
    const db = this.getDb();

    // 提取上下文字段
    const contextData = {
      workDir: context.projectInfo?.workDir || context.workDir,
      worktreePath: context.projectInfo?.worktreePath || context.worktreePath,
      gitBranch: context.gitBranch || context.projectInfo?.gitBranch,
      relevantFiles: context.projectInfo?.relevantFiles || context.relevantFiles,
      taskDescription: context.taskDescription,
      variables: context.variables || {},
      mode: context.mode || 'edit',
      contextGitBranch: context.gitBranch,
      mrUrl: context.mrUrl,
      previewInfo: context.previewInfo,
    };

    // 检查是否已存在
    const existing = await db
      .select()
      .from(conversationContexts)
      .where(eq(conversationContexts.conversationId, conversationId))
      .limit(1);

    if (existing.length > 0) {
      // 更新现有上下文
      await db
        .update(conversationContexts)
        .set({
          ...contextData,
          updatedAt: new Date(),
        })
        .where(eq(conversationContexts.conversationId, conversationId));
    } else {
      // 插入新上下文
      await db.insert(conversationContexts).values({
        conversationId,
        ...contextData,
      });
    }

    // 清除缓存
    this.deleteCache(`context:${conversationId}`);
  }

  /**
   * 加载对话上下文
   */
  async loadContext(conversationId: string): Promise<any | null> {
    // 检查缓存
    const cached = this.getCached(`context:${conversationId}`);
    if (cached) {
      return cached;
    }

    const db = this.getDb();

    const result = await db
      .select()
      .from(conversationContexts)
      .where(eq(conversationContexts.conversationId, conversationId))
      .limit(1);

    const rawContext = result[0] || null;

    if (!rawContext) {
      return null;
    }

    // 转换为应用层期望的 ConversationContext 格式
    const context = {
      projectInfo: {
        workDir: rawContext.workDir,
        worktreePath: rawContext.worktreePath,
        gitBranch: rawContext.gitBranch,
        relevantFiles: rawContext.relevantFiles || [],
      },
      taskDescription: rawContext.taskDescription,
      messageHistory: [],
      variables: rawContext.variables || {},
      mode: rawContext.mode || 'edit',
      gitBranch: rawContext.contextGitBranch,
      mrUrl: rawContext.mrUrl,
      previewInfo: rawContext.previewInfo,
    };

    // 缓存结果
    this.setCache(`context:${conversationId}`, context);

    return context;
  }

  // ==================== 消息元数据管理方法 ====================

  /**
   * 保存消息元数据
   */
  async saveMessageMetadata(messageId: string, metadata: any): Promise<void> {
    const db = this.getDb();

    // 检查是否已存在
    const existing = await db
      .select()
      .from(messageMetadata)
      .where(eq(messageMetadata.messageId, messageId))
      .limit(1);

    if (existing.length > 0) {
      // 更新现有元数据
      await db
        .update(messageMetadata)
        .set(metadata)
        .where(eq(messageMetadata.messageId, messageId));
    } else {
      // 插入新元数据
      await db.insert(messageMetadata).values({
        messageId,
        ...metadata,
      });
    }

    // 清除缓存
    this.deleteCache(`metadata:${messageId}`);
  }

  /**
   * 加载消息元数据
   */
  async loadMessageMetadata(messageId: string): Promise<any | null> {
    // 检查缓存
    const cached = this.getCached(`metadata:${messageId}`);
    if (cached) {
      return cached;
    }

    const db = this.getDb();

    const result = await db
      .select()
      .from(messageMetadata)
      .where(eq(messageMetadata.messageId, messageId))
      .limit(1);

    const metadata = result[0] || null;

    // 缓存结果
    if (metadata) {
      this.setCache(`metadata:${messageId}`, metadata);
    }

    return metadata;
  }

  // ==================== 数据完整性维护方法 ====================

  /**
   * 清理孤立的消息（没有对应 conversation 的消息）
   */
  async cleanupOrphanedMessages(): Promise<number> {
    const db = this.getDb();

    // 查找所有孤立的消息
    const orphanedMessages = await db
      .select({ id: messages.id })
      .from(messages)
      .leftJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(eq(conversations.id, null as any));

    let count = 0;

    // 删除孤立的消息及其元数据
    for (const msg of orphanedMessages) {
      await db.delete(messageMetadata).where(eq(messageMetadata.messageId, msg.id));
      await db.delete(messages).where(eq(messages.id, msg.id));
      count++;
    }

    // 清除缓存
    this.clearCache();

    return count;
  }

  /**
   * 清理孤立的元数据
   */
  async cleanupOrphanedMetadata(): Promise<number> {
    const db = this.getDb();

    // 查找所有孤立的元数据
    const orphanedMetadata = await db
      .select({ id: messageMetadata.id })
      .from(messageMetadata)
      .leftJoin(messages, eq(messageMetadata.messageId, messages.id))
      .where(eq(messages.id, null as any));

    let count = 0;

    // 删除孤立的元数据
    for (const meta of orphanedMetadata) {
      await db.delete(messageMetadata).where(eq(messageMetadata.id, meta.id));
      count++;
    }

    // 清除缓存
    this.clearCache();

    return count;
  }

  /**
   * 验证数据完整性
   */
  async validateDataIntegrity(conversationId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // 1. 检查会话是否存在
    const conversation = await this.loadSession(conversationId);
    if (!conversation) {
      issues.push(`Conversation ${conversationId} not found`);
      return { valid: false, issues };
    }

    // 2. 检查上下文
    const context = await this.loadContext(conversationId);
    if (!context) {
      issues.push(`Context for conversation ${conversationId} not found`);
    }

    // 3. 检查消息
    const messageList = await this.loadMessages(conversationId);
    if (messageList.length === 0) {
      issues.push(`No messages found for conversation ${conversationId}`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
