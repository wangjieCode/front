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
import { newId } from '../utils/id';
import dayjs from 'dayjs';
import { convertToStoredPath, resolveStoredPath, BasePathType } from '../utils/PathUtils';
import path from 'path';

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
      userId: session.userId,
      projectId: session.projectId || session.context?.projectInfo?.projectId,
      status: session.status,
      visibility: session.visibility || 'private',
      title: session.title,
      summary: session.summary,
      projectName: session.projectName || session.context?.projectInfo?.projectName,
      updatedAt: session.updatedAt || dayjs().toDate(),
      completedAt: session.completedAt || null,
      error: session.error || null,
    };

    // 使用 onConflictDoUpdate 实现原子级 Upsert
    await db.insert(conversations)
      .values(conversationData)
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          status: conversationData.status,
          visibility: conversationData.visibility,
          title: conversationData.title,
          summary: conversationData.summary,
          projectId: conversationData.projectId,
          projectName: conversationData.projectName,
          updatedAt: conversationData.updatedAt,
          completedAt: conversationData.completedAt,
          error: conversationData.error,
        }
      });

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
      .where(eq(conversations.id, agentSessionId))
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
    * 列出所有会话
    */
  async listSessions(): Promise<any[]> {
    const db = this.getDb();

    const results = await db
      .select({
        id: conversations.id,
        userId: conversations.userId,
        visibility: conversations.visibility,
        status: conversations.status,
        title: conversations.title,
        projectId: conversations.projectId,
        projectName: conversations.projectName,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        projectNameJoined: projects.name,
        mode: conversationContexts.mode,
        taskDescription: conversationContexts.taskDescription,
        workDir: conversationContexts.workDir,
        variables: conversationContexts.variables,
      })
      .from(conversations)
      .leftJoin(projects, eq(conversations.projectId, projects.id))
      .leftJoin(conversationContexts, eq(conversations.id, conversationContexts.conversationId))
      .orderBy(desc(conversations.createdAt));

    return results.map(row => ({
      id: row.id,
      userId: row.userId,
      visibility: row.visibility || 'private',
      status: row.status,
      title: row.title,
      projectName: row.projectName || row.projectNameJoined || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      context: {
        mode: row.mode || 'edit',
        taskDescription: row.taskDescription || '',
        variables: row.variables || {}, // 确保变量始终是一个对象
        projectInfo: {
          workDir: resolveStoredPath(row.workDir),
          projectId: row.projectId || null,
          projectName: row.projectName || row.projectNameJoined || null,
          gitRepositoryUrl: '',
          gitBranch: null,
          relevantFiles: [],
        }
      }
    }));
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
        updatedAt: dayjs().toDate(),
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

    this.deleteCache(`messages:${message.conversationId}`);
    this.deleteCache(`messages_with_metadata:${message.conversationId}`);
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
   * 加载带元数据的消息列表（高性能版，单次查询）
   */
  async loadMessagesWithMetadata(
    conversationId: string
  ): Promise<any[]> {
    const cacheKey = `messages_with_metadata:${conversationId}`;

    const cached = this.getCached<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const db = this.getDb();

    // 使用 LEFT JOIN 一次性查出消息和元数据
    const results = await db
      .select({
        message: messages,
        metadata: messageMetadata,
      })
      .from(messages)
      .leftJoin(messageMetadata, eq(messages.id, messageMetadata.messageId))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.timestamp));

    const combined = results.map(row => ({
      ...row.message,
      metadata: row.metadata,
    }));

    this.setCache(cacheKey, combined);
    return combined;
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

    // 为了精确清除缓存，我们需要 conversationId
    const msgResult = await db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    
    const conversationId = msgResult[0]?.conversationId;

    await db
      .update(messages)
      .set({ content, isComplete })
      .where(eq(messages.id, messageId));

    // 清除精确缓存而不是 clearCache()
    if (conversationId) {
      this.deleteCache(`messages:${conversationId}`);
      this.deleteCache(`messages_with_metadata:${conversationId}`);
    }
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
    const rawWorkDir = context.projectInfo?.workDir || context.workDir;
    const rawWorktreePath = context.projectInfo?.worktreePath || context.worktreePath;
    
    const contextData = {
      workDir: convertToStoredPath(rawWorkDir) || '',
      worktreePath: convertToStoredPath(rawWorktreePath),
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
          updatedAt: dayjs().toDate(),
        })
        .where(eq(conversationContexts.conversationId, conversationId));
    } else {
      // 插入新上下文
      await db.insert(conversationContexts).values({
        id: newId(),
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
        workDir: resolveStoredPath(rawContext.workDir),
        worktreePath: rawContext.worktreePath ? resolveStoredPath(rawContext.worktreePath, BasePathType.WORKTREE_BASE_DIR) : null,
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

    // 为了精确清除缓存，我们需要 conversationId
    const msgResult = await db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    
    const conversationId = msgResult[0]?.conversationId;

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
        id: newId(),
        messageId,
        ...metadata,
      });
    }

    // 清除精确缓存
    this.deleteCache(`metadata:${messageId}`);
    if (conversationId) {
      this.deleteCache(`messages_with_metadata:${conversationId}`);
    }
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
