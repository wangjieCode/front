import { eq, and, desc, asc, lt, gt, inArray, or, sql } from 'drizzle-orm';
import { DatabaseManager } from '../db/DatabaseManager';
import {
  conversations,
  conversationContexts,
  messages,
  messageMetadata,
  type Conversation,
  type NewConversation,
  type Message,
  type NewMessage,
} from '../db/schema';
import { newId } from '../utils/id';
import dayjs from 'dayjs';
import { convertToStoredPath, resolveStoredPath, BasePathType } from '../utils/PathUtils';
import { RedisCacheService } from '../services/RedisCacheService';

/**
 * 分页选项
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface ListSessionsOptions {
  userId?: string;
  environment?: string;
}

export interface MessageHistoryVersion {
  total: number;
  latestTimestamp: Date | null;
}

/**
 * 基于 Drizzle ORM 的对话存储实现
 */
export class DrizzleConversationStorage {
  private cache = new RedisCacheService();
  private cacheTtlSeconds = 60;

  private hasImagePayload(metadata: any): boolean {
    if (!metadata) return false;
    const images = metadata.images;
    return Array.isArray(images) ? images.length > 0 : Boolean(images);
  }

  private hasImagesInCombinedMessages(messagesWithMetadata: any[]): boolean {
    return messagesWithMetadata.some(item => this.hasImagePayload(item?.metadata));
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
  async clearCache(): Promise<void> {
    await this.cache.delByPattern('storage:*');
  }

  /**
   * 从缓存获取数据
   */
  private async getCached<T>(key: string): Promise<T | null> {
    return this.cache.getJson<T>(`storage:${key}`);
  }

  /**
   * 设置缓存
   */
  private async setCache<T>(key: string, value: T, ttlSeconds: number = this.cacheTtlSeconds): Promise<void> {
    await this.cache.setJson(`storage:${key}`, value, ttlSeconds);
  }

  /**
   * 删除缓存
   */
  private async deleteCache(key: string): Promise<void> {
    await this.cache.del(`storage:${key}`);
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
    await Promise.all([
      this.deleteCache(`session:${session.id}`),
      this.deleteCache(`session:${session.sessionId || session.id}`),
      this.deleteCache('sessions:list'),
    ]);
  }

  /**
   * 通过 ID 加载会话
   */
  async loadSession(sessionId: string): Promise<Conversation | null> {
    const db = this.getDb();
    const [sessionRows, contextRows] = await Promise.all([
      db
        .select()
        .from(conversations)
        .where(eq(conversations.id, sessionId))
        .limit(1),
      db
        .select()
        .from(conversationContexts)
        .where(eq(conversationContexts.conversationId, sessionId))
        .limit(1),
    ]);

    const rawSession = sessionRows[0];
    if (!rawSession) {
      return null;
    }

    const rawContext = contextRows[0] || null;
    const context = rawContext
      ? {
          projectInfo: {
            workDir: resolveStoredPath(rawContext.workDir),
            worktreePath: rawContext.worktreePath
              ? resolveStoredPath(rawContext.worktreePath, BasePathType.WORKTREE_BASE_DIR)
              : null,
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
        }
      : null;

    return {
      ...rawSession,
      context: context || null,
    } as unknown as Conversation;
  }

  /**
   * 通过 Agent sessionId 加载会话
   */
  async loadSessionByAgentSessionId(agentSessionId: string): Promise<Conversation | null> {
    // 检查缓存
    const cached = await this.getCached<Conversation>(`agent-session:${agentSessionId}`);
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
      await Promise.all([
        this.setCache(`agent-session:${agentSessionId}`, session),
        this.setCache(`session:${session.id}`, session),
      ]);
    }

    return session;
  }

   /**
    * 列出所有会话
    */
  async listSessions(options: ListSessionsOptions = {}): Promise<any[]> {
    const db = this.getDb();
    const { userId, environment } = options;
    const visibilityScope = userId
      ? or(eq(conversations.userId, userId), eq(conversations.visibility, 'public'))
      : undefined;

    const sessionQuery = db
      .select({
        id: conversations.id,
        userId: conversations.userId,
        visibility: conversations.visibility,
        status: conversations.status,
        title: conversations.title,
        summary: conversations.summary,
        projectId: conversations.projectId,
        projectName: conversations.projectName,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .orderBy(desc(conversations.createdAt));
    const sessionRows = visibilityScope
      ? await sessionQuery.where(visibilityScope)
      : await sessionQuery;

    if (sessionRows.length === 0) {
      return [];
    }

    const sessionIds = sessionRows.map(row => row.id);
    const contextFilters = [inArray(conversationContexts.conversationId, sessionIds)];
    if (environment) {
      contextFilters.push(
        sql`${conversationContexts.variables} ->> 'environment' = ${environment}`
      );
    }

    const contextRows = await db
      .select({
        conversationId: conversationContexts.conversationId,
        mode: conversationContexts.mode,
        taskDescription: conversationContexts.taskDescription,
        workDir: conversationContexts.workDir,
        environment: sql<string | null>`${conversationContexts.variables} ->> 'environment'`,
      })
      .from(conversationContexts)
      .where(and(...contextFilters));

    const contextByConversationId = new Map(
      contextRows.map(row => [row.conversationId, row])
    );

    return sessionRows
      .filter(row => contextByConversationId.has(row.id))
      .map(row => {
      const contextRow = contextByConversationId.get(row.id);

      return {
        id: row.id,
        userId: row.userId,
        visibility: row.visibility || 'private',
        status: row.status,
        title: row.title,
        summary: row.summary,
        projectName: row.projectName || null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        context: {
          mode: contextRow?.mode || 'edit',
          taskDescription: contextRow?.taskDescription || '',
          variables: {
            environment: contextRow?.environment || null,
          },
          projectInfo: {
            workDir: resolveStoredPath(contextRow?.workDir || null),
            projectId: row.projectId || null,
            projectName: row.projectName || null,
            gitRepositoryUrl: '',
            gitBranch: null,
            relevantFiles: [],
          }
        }
      };
    });
  }

  /**
   * 获取不活跃的会话
   * @param olderThanXDays 多少天前
   * @param status 状态（默认为 ACTIVE）
   */
  async getInactiveSessions(olderThanXDays: number, status: string = 'active'): Promise<any[]> {
    const db = this.getDb();
    const thresholdDate = dayjs().subtract(olderThanXDays, 'day').toDate();

    return await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.status, status),
          lt(conversations.updatedAt, thresholdDate)
        )
      );
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
    await Promise.all([
      this.deleteCache(`session:${sessionId}`),
      this.deleteCache('sessions:list'),
    ]);
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
    await this.clearCache();
  }

  // ==================== 消息管理方法 ====================

  /**
   * 保存消息
   */
  async saveMessage(message: NewMessage): Promise<void> {
    const db = this.getDb();

    await db.insert(messages).values(message);

    await Promise.all([
      this.deleteCache(`messages:${message.conversationId}`),
      this.deleteCache(`messages_with_metadata:${message.conversationId}`),
    ]);
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
      const cached = await this.getCached<Message[]>(cacheKey);
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
      await this.setCache(cacheKey, result);
    }

    return result;
  }

  /**
   * 加载带元数据的消息列表（高性能版，单次查询）
   */
  async loadMessagesWithMetadata(
    conversationId: string,
    since?: string
  ): Promise<any[]> {
    const sinceDate = since ? new Date(since) : null;
    const hasValidSince = !!sinceDate && !Number.isNaN(sinceDate.getTime());
    const cacheKey = `messages_with_metadata:${conversationId}`;

    if (!hasValidSince) {
      const cached = await this.getCached<any[]>(cacheKey);
      if (cached) {
        // 历史缓存可能包含图片 payload，发现后立即清理并回源数据库
        if (this.hasImagesInCombinedMessages(cached)) {
          await this.deleteCache(cacheKey);
        } else {
          return cached;
        }
      }
    }

    const db = this.getDb();

    const messageWhere = hasValidSince
      ? and(
          eq(messages.conversationId, conversationId),
          gt(messages.timestamp, sinceDate as Date)
        )
      : eq(messages.conversationId, conversationId);

    const messageRows = await db
      .select()
      .from(messages)
      .where(messageWhere)
      .orderBy(asc(messages.timestamp));

    if (messageRows.length === 0) {
      if (!hasValidSince) {
        await this.setCache(cacheKey, []);
      }
      return [];
    }

    const messageIds = messageRows.map(row => row.id);
    const metadataRows = await db
      .select()
      .from(messageMetadata)
      .where(inArray(messageMetadata.messageId, messageIds));

    const metadataByMessageId = new Map(
      metadataRows.map(row => [row.messageId, row])
    );

    const combined = messageRows.map(row => ({
      ...row,
      metadata: metadataByMessageId.get(row.id) || null,
    }));

    // 图片附件体积大且含二进制/BASE64，不写入 Redis 缓存
    if (!hasValidSince && !this.hasImagesInCombinedMessages(combined)) {
      await this.setCache(cacheKey, combined);
    } else if (!hasValidSince) {
      await this.deleteCache(cacheKey);
    }

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
      await Promise.all([
        this.deleteCache(`messages:${conversationId}`),
        this.deleteCache(`messages_with_metadata:${conversationId}`),
      ]);
    }
  }

  /**
   * 获取消息数量
   */
  async getMessageCount(conversationId: string): Promise<number> {
    const db = this.getDb();

    const result = await db
      .select({ total: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    return Number(result[0]?.total || 0);
  }

  /**
   * 获取消息历史版本（用于 ETag 快速校验）
   */
  async getMessageHistoryVersion(conversationId: string): Promise<MessageHistoryVersion> {
    const db = this.getDb();

    const [summary] = await db
      .select({
        total: sql<number>`count(*)`,
        latestTimestamp: sql<Date | null>`max(${messages.timestamp})`,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    return {
      total: Number(summary?.total || 0),
      latestTimestamp: summary?.latestTimestamp || null,
    };
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
    await this.deleteCache(`context:${conversationId}`);
  }

  /**
   * 加载对话上下文
   */
  async loadContext(conversationId: string): Promise<any | null> {
    // 检查缓存
    const cached = await this.getCached(`context:${conversationId}`);
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
    await this.setCache(`context:${conversationId}`, context);

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
    await this.deleteCache(`metadata:${messageId}`);
    if (conversationId) {
      await this.deleteCache(`messages_with_metadata:${conversationId}`);
    }
  }

  /**
   * 加载消息元数据
   */
  async loadMessageMetadata(messageId: string): Promise<any | null> {
    // 检查缓存
    const cached = await this.getCached(`metadata:${messageId}`);
    if (cached) {
      if (this.hasImagePayload(cached)) {
        await this.deleteCache(`metadata:${messageId}`);
      } else {
        return cached;
      }
    }

    const db = this.getDb();

    const result = await db
      .select()
      .from(messageMetadata)
      .where(eq(messageMetadata.messageId, messageId))
      .limit(1);

    const metadata = result[0] || null;

    // 缓存结果
    if (metadata && !this.hasImagePayload(metadata)) {
      await this.setCache(`metadata:${messageId}`, metadata);
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
    await this.clearCache();

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
    await this.clearCache();

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
