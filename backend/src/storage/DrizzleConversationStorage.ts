import { eq, and, desc, asc, lt, gt, inArray, ne, sql } from 'drizzle-orm';
import { DatabaseManager } from '../db/DatabaseManager';
import {
  conversations,
  conversationContexts,
  messages,
  messageMetadata,
  neovateSessions,
  reviewRounds,
  reviewFileChanges,
  reviewDiffBlobs,
  type Conversation,
  type NewConversation,
  type Message,
  type NewMessage,
} from '../db/schema';
import { newId } from '../utils/id';
import dayjs from 'dayjs';
import { convertToStoredPath, resolveStoredPath, BasePathType } from '../utils/PathUtils';
import { LruCacheService } from '../services/LruCacheService';
import { CacheStrategyManager } from '../services/CacheStrategyManager';
import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';

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

export interface SessionAccessInfo {
  id: string;
  userId: string;
  visibility: string;
}

export interface ReviewSidebarData {
  sessionId: string;
  totalRounds: number;
  rounds: Array<{
    roundId: string;
    status: string | null;
    summary: string | null;
    fileCount: number;
    createdAt: Date | null;
    updatedAt: Date | null;
  }>;
}

export interface ReviewDiffData {
  sessionId: string;
  filePath: string;
  roundId: string | null;
  items: Array<{
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
  }>;
}

export interface ReviewFilesData {
  sessionId: string;
  files: Array<{
    filePath: string;
    changeType: string | null;
    additions: number;
    deletions: number;
  }>;
}

export interface ReviewUpdatesData {
  sessionId: string;
  since: string;
  items: Array<{
    kind: 'round' | 'file';
    itemId: string;
    roundId: string;
    filePath: string | null;
    status: string | null;
    summary: string | null;
    updatedAt: Date | null;
  }>;
}

/**
 * 基于 Drizzle ORM 的对话存储实现
 */
export class DrizzleConversationStorage {
  private cache = new LruCacheService();
  private cacheStrategyManager = new CacheStrategyManager(this.cache);
  private cacheTtlSeconds = 0;
  private messageQuerySlowLogMs = Number(process.env.MESSAGE_QUERY_SLOW_LOG_MS || 800);
  private messageHistoryVersionCacheTtlSeconds = Number(process.env.MESSAGE_VERSION_CACHE_TTL_SECONDS || 0);

  private toDateOrNull(value: unknown): Date | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private toNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private hasImagePayload(metadata: any): boolean {
    if (!metadata) return false;
    const images = metadata.images;
    return Array.isArray(images) ? images.length > 0 : Boolean(images);
  }

  private hasImagesInCombinedMessages(messagesWithMetadata: any[]): boolean {
    return messagesWithMetadata.some(item => this.hasImagePayload(item?.metadata));
  }

  private normalizeReviewFileChanges(codeChanges: any): Array<{
    filePath: string;
    changeType: string;
    status: string;
    oldPath: string | null;
    diffText: string;
    additions: number;
    deletions: number;
  }> {
    if (!Array.isArray(codeChanges)) {
      return [];
    }

    return codeChanges
      .map((item) => {
        const filePath = item?.filePath || item?.path || item?.newPath;
        if (!filePath || typeof filePath !== 'string') {
          return null;
        }
        const additions = Number(item?.additions ?? 0);
        const deletions = Number(item?.deletions ?? 0);
        const diffText = String(
          item?.diff
          || item?.patch
          || item?.diffPatch
          || item?.content
          || item?.unifiedDiff
          || item?.unified_diff
          || ''
        );
        const counted = this.countDiffStats(diffText);
        return {
          filePath,
          changeType: String(item?.changeType || item?.type || item?.status || 'modified'),
          status: String(item?.changeType || item?.type || item?.status || 'modified'),
          oldPath: typeof item?.oldPath === 'string' ? item.oldPath : null,
          diffText,
          additions: Number.isFinite(additions) && additions > 0 ? additions : counted.additions,
          deletions: Number.isFinite(deletions) && deletions > 0 ? deletions : counted.deletions,
        };
      })
      .filter((item): item is {
        filePath: string;
        changeType: string;
        status: string;
        oldPath: string | null;
        diffText: string;
        additions: number;
        deletions: number;
      } => item !== null);
  }

  private countDiffStats(diffText: string): { additions: number; deletions: number } {
    if (!diffText) {
      return { additions: 0, deletions: 0 };
    }
    let additions = 0;
    let deletions = 0;
    for (const line of diffText.split('\n')) {
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+')) additions += 1;
      if (line.startsWith('-')) deletions += 1;
    }
    return { additions, deletions };
  }

  private buildDiffHash(diffText: string): string {
    return createHash('sha256').update(diffText).digest('hex');
  }

  private encodeDiff(diffText: string): string {
    return gzipSync(Buffer.from(diffText, 'utf8')).toString('base64');
  }

  private decodeDiff(diffGzipBase64: string): string {
    try {
      return gunzipSync(Buffer.from(diffGzipBase64, 'base64')).toString('utf8');
    } catch (_error) {
      return '';
    }
  }

  private extractReviewSummary(metadata: any, fileChangeCount: number): string {
    const explicitSummary = metadata?.reviewSummary || metadata?.summary;
    if (typeof explicitSummary === 'string' && explicitSummary.trim().length > 0) {
      return explicitSummary.trim();
    }
    return `Changed ${fileChangeCount} file${fileChangeCount > 1 ? 's' : ''}`;
  }

  private toLightweightMetadata(metadata: any): any {
    if (!metadata || typeof metadata !== 'object') {
      return metadata;
    }
    const lightweightCodeChanges = Array.isArray(metadata.codeChanges)
      ? metadata.codeChanges.map((change: any) => ({
          filePath: change?.filePath || change?.path || change?.newPath || '',
          changeType: String(change?.changeType || change?.type || change?.status || 'modified'),
        })).filter((item: any) => item.filePath)
      : metadata.codeChanges;

    return {
      ...metadata,
      isQuestion: metadata.isQuestion === true,
      requiresResponse: metadata.requiresResponse === true,
      isInvalid: metadata.isInvalid === true,
      codeChanges: lightweightCodeChanges,
    };
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
    await this.cacheStrategyManager.delByPattern('storage:*');
  }

  /**
   * 从缓存获取数据
   */
  private async getCached<T>(key: string): Promise<T | null> {
    return this.cacheStrategyManager.get<T>(`storage:${key}`);
  }

  /**
   * 设置缓存
   */
  private async setCache<T>(key: string, value: T, ttlSeconds: number = this.cacheTtlSeconds): Promise<void> {
    await this.cacheStrategyManager.set(`storage:${key}`, value, ttlSeconds);
  }

  /**
   * 删除缓存
   */
  private async deleteCache(key: string): Promise<void> {
    await this.cacheStrategyManager.del(`storage:${key}`);
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
   * 加载会话访问控制所需最小字段（用于权限校验热路径）
   */
  async loadSessionAccessInfo(sessionId: string): Promise<SessionAccessInfo | null> {
    const db = this.getDb();
    const result = await db
      .select({
        id: conversations.id,
        userId: conversations.userId,
        visibility: conversations.visibility,
      })
      .from(conversations)
      .where(eq(conversations.id, sessionId))
      .limit(1);

    const row = result[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      visibility: row.visibility || 'private',
    };
  }

  async getReviewSidebar(sessionId: string): Promise<ReviewSidebarData> {
    const db: any = this.getDb();
    try {
      const result = await db.execute(sql`
        SELECT
          rr.id AS round_id,
          rr.status AS round_status,
          rr.summary AS round_summary,
          rr.created_at AS round_created_at,
          rr.updated_at AS round_updated_at,
          COUNT(rfc.id)::int AS file_count
        FROM review_rounds rr
        LEFT JOIN review_file_changes rfc ON rfc.review_round_id = rr.id
        WHERE rr.conversation_id = ${sessionId}
        GROUP BY rr.id, rr.status, rr.summary, rr.created_at, rr.updated_at
        ORDER BY rr.created_at DESC
      `);

      const rows = (result?.rows || result || []) as any[];
      return {
        sessionId,
        totalRounds: rows.length,
        rounds: rows.map((row) => ({
          roundId: String(row.round_id || ''),
          status: row.round_status ? String(row.round_status) : null,
          summary: row.round_summary ? String(row.round_summary) : null,
          fileCount: this.toNumber(row.file_count),
          createdAt: this.toDateOrNull(row.round_created_at),
          updatedAt: this.toDateOrNull(row.round_updated_at),
        })),
      };
    } catch (error) {
      console.warn(`[Storage][review] getReviewSidebar failed, fallback empty. sessionId=${sessionId}`, error);
      return { sessionId, totalRounds: 0, rounds: [] };
    }
  }

  async getReviewFiles(sessionId: string): Promise<ReviewFilesData> {
    const db: any = this.getDb();
    try {
      const result = await db.execute(sql`
        WITH latest_round AS (
          SELECT rr.id
          FROM review_rounds rr
          WHERE rr.conversation_id = ${sessionId}
          ORDER BY rr.round_number DESC
          LIMIT 1
        )
        SELECT
          rfc.file_path,
          rfc.change_type,
          rfc.additions,
          rfc.deletions
        FROM review_file_changes rfc
        INNER JOIN latest_round lr ON lr.id = rfc.review_round_id
        ORDER BY rfc.updated_at DESC
      `);
      const rows = (result?.rows || result || []) as any[];
      return {
        sessionId,
        files: rows.map((row) => ({
          filePath: String(row.file_path || ''),
          changeType: row.change_type ? String(row.change_type) : null,
          additions: this.toNumber(row.additions),
          deletions: this.toNumber(row.deletions),
        })),
      };
    } catch (_errorWithOptionalColumns) {
      console.warn(`[Storage][review] getReviewFiles failed, fallback empty. sessionId=${sessionId}`, _errorWithOptionalColumns);
      return { sessionId, files: [] };
    }
  }

  async getReviewDiff(sessionId: string, filePath: string, roundId?: string): Promise<ReviewDiffData> {
    const db: any = this.getDb();
    try {
      const result = roundId
        ? await db.execute(sql`
          SELECT
            rfc.id AS change_id,
            rfc.review_round_id AS round_id,
            rfc.file_path,
            rfc.old_path,
            rfc.change_type,
            rdb.diff_gzip_base64,
            rfc.additions,
            rfc.deletions,
            rfc.created_at,
            rfc.updated_at
          FROM review_file_changes rfc
          INNER JOIN review_rounds rr ON rr.id = rfc.review_round_id
          INNER JOIN review_diff_blobs rdb ON rdb.id = rfc.diff_blob_id
          WHERE rr.conversation_id = ${sessionId}
            AND rfc.file_path = ${filePath}
            AND rr.id = ${roundId}
          ORDER BY rfc.updated_at DESC
        `)
        : await db.execute(sql`
          WITH latest_round AS (
            SELECT rr.id
            FROM review_rounds rr
            WHERE rr.conversation_id = ${sessionId}
            ORDER BY rr.round_number DESC
            LIMIT 1
          )
          SELECT
            rfc.id AS change_id,
            rfc.review_round_id AS round_id,
            rfc.file_path,
            rfc.old_path,
            rfc.change_type,
            rdb.diff_gzip_base64,
            rfc.additions,
            rfc.deletions,
            rfc.created_at,
            rfc.updated_at
          FROM review_file_changes rfc
          INNER JOIN latest_round lr ON lr.id = rfc.review_round_id
          INNER JOIN review_diff_blobs rdb ON rdb.id = rfc.diff_blob_id
          WHERE rfc.file_path = ${filePath}
          ORDER BY rfc.updated_at DESC
          LIMIT 1
        `);

      const rows = (result?.rows || result || []) as any[];
      return {
        sessionId,
        filePath,
        roundId: roundId || null,
        items: rows.map((row) => ({
          changeId: String(row.change_id || ''),
          roundId: String(row.round_id || ''),
          filePath: String(row.file_path || filePath),
          oldPath: row.old_path ? String(row.old_path) : null,
          status: row.change_type ? String(row.change_type) : null,
          patch: row.diff_gzip_base64 ? this.decodeDiff(String(row.diff_gzip_base64)) : null,
          additions: this.toNumber(row.additions),
          deletions: this.toNumber(row.deletions),
          createdAt: this.toDateOrNull(row.created_at),
          updatedAt: this.toDateOrNull(row.updated_at),
        })),
      };
    } catch (error) {
      console.warn(
        `[Storage][review] getReviewDiff failed, fallback empty. sessionId=${sessionId}, filePath=${filePath}`,
        error
      );
      return { sessionId, filePath, roundId: roundId || null, items: [] };
    }
  }

  async getReviewUpdates(sessionId: string, since: string): Promise<ReviewUpdatesData> {
    const db: any = this.getDb();
    const sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
      return { sessionId, since, items: [] };
    }

    try {
      const result = await db.execute(sql`
        SELECT
          'round'::text AS kind,
          rr.id AS item_id,
          rr.id AS round_id,
          NULL::text AS file_path,
          rr.status AS status,
          rr.summary AS summary,
          rr.updated_at AS updated_at
        FROM review_rounds rr
        WHERE rr.conversation_id = ${sessionId}
          AND rr.updated_at > ${sinceDate}
        UNION ALL
        SELECT
          'file'::text AS kind,
          rfc.id AS item_id,
          rfc.review_round_id AS round_id,
          rfc.file_path AS file_path,
          NULL::text AS status,
          NULL::text AS summary,
          rfc.updated_at AS updated_at
        FROM review_file_changes rfc
        INNER JOIN review_rounds rr ON rr.id = rfc.review_round_id
        WHERE rr.conversation_id = ${sessionId}
          AND rfc.updated_at > ${sinceDate}
        ORDER BY updated_at ASC
        LIMIT 200
      `);

      const rows = (result?.rows || result || []) as any[];
      return {
        sessionId,
        since,
        items: rows.map((row) => ({
          kind: row.kind === 'file' ? 'file' : 'round',
          itemId: String(row.item_id || ''),
          roundId: String(row.round_id || ''),
          filePath: row.file_path ? String(row.file_path) : null,
          status: row.status ? String(row.status) : null,
          summary: row.summary ? String(row.summary) : null,
          updatedAt: this.toDateOrNull(row.updated_at),
        })),
      };
    } catch (error) {
      console.warn(`[Storage][review] getReviewUpdates failed, fallback empty. sessionId=${sessionId}`, error);
      return { sessionId, since, items: [] };
    }
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
    const selectFields = {
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
    };

    const sessionRows = userId
      ? (
          await Promise.all([
            db
              .select(selectFields)
              .from(conversations)
              .where(eq(conversations.userId, userId))
              .orderBy(desc(conversations.createdAt)),
            db
              .select(selectFields)
              .from(conversations)
              .where(and(eq(conversations.visibility, 'public'), ne(conversations.userId, userId)))
              .orderBy(desc(conversations.createdAt)),
          ])
        )
          .flat()
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      : await db
          .select(selectFields)
          .from(conversations)
          .orderBy(desc(conversations.createdAt));

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

    const reviewRoundRows = await db
      .select({
        id: reviewRounds.id,
        conversationId: reviewRounds.conversationId,
        roundNumber: reviewRounds.roundNumber,
        summary: reviewRounds.summary,
        createdAt: reviewRounds.createdAt,
      })
      .from(reviewRounds)
      .where(inArray(reviewRounds.conversationId, sessionIds))
      .orderBy(desc(reviewRounds.createdAt));

    const latestRoundByConversationId = new Map<string, {
      id: string;
      roundNumber: number;
      summary: string | null;
      createdAt: Date;
    }>();
    for (const row of reviewRoundRows) {
      if (!latestRoundByConversationId.has(row.conversationId)) {
        latestRoundByConversationId.set(row.conversationId, {
          id: row.id,
          roundNumber: row.roundNumber,
          summary: row.summary,
          createdAt: row.createdAt,
        });
      }
    }

    const latestRoundIds = Array.from(latestRoundByConversationId.values()).map(row => row.id);
    const roundFileCountRows = latestRoundIds.length > 0
      ? await db
          .select({
            roundId: reviewFileChanges.reviewRoundId,
            count: sql<number>`count(*)`,
          })
          .from(reviewFileChanges)
          .where(inArray(reviewFileChanges.reviewRoundId, latestRoundIds))
          .groupBy(reviewFileChanges.reviewRoundId)
      : [];
    const roundFileCountMap = new Map(roundFileCountRows.map(row => [row.roundId, Number(row.count)]));

    return sessionRows
      .filter(row => contextByConversationId.has(row.id))
      .map(row => {
      const contextRow = contextByConversationId.get(row.id);
      const latestRound = latestRoundByConversationId.get(row.id);

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
        },
        review: latestRound
          ? {
              latestRoundNumber: latestRound.roundNumber,
              latestRoundSummary: latestRound.summary,
              changedFileCount: roundFileCountMap.get(latestRound.id) || 0,
              latestRoundCreatedAt: latestRound.createdAt,
            }
          : null,
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
      const messageIdsSubquery = tx
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.conversationId, sessionId));

      // 1. 删除消息元数据（集合删除，避免逐条循环）
      await tx.delete(messageMetadata).where(inArray(messageMetadata.messageId, messageIdsSubquery as any));

      // 2. 删除消息
      await tx.delete(messages).where(eq(messages.conversationId, sessionId));

      // 3. 删除上下文
      await tx.delete(conversationContexts).where(eq(conversationContexts.conversationId, sessionId));

      // 4. 删除 Neovate 会话映射
      await tx.delete(neovateSessions).where(eq(neovateSessions.conversationId, sessionId));

      // 5. 删除 review 文件变更与轮次投影
      await tx.delete(reviewFileChanges).where(eq(reviewFileChanges.conversationId, sessionId));
      await tx.delete(reviewRounds).where(eq(reviewRounds.conversationId, sessionId));

      // 6. 删除会话
      await tx.delete(conversations).where(eq(conversations.id, sessionId));
    });

    await this.cleanupOrphanReviewDiffBlobs();

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
      this.deleteCache(`message_history_version:${message.conversationId}`),
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

    const queryStart = process.hrtime.bigint();
    const rows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        isComplete: messages.isComplete,
        timestamp: messages.timestamp,
        parentMessageId: messages.parentMessageId,
        metadataId: messageMetadata.id,
        metadataMessageId: messageMetadata.messageId,
        metadataToolCalls: messageMetadata.toolCalls,
        metadataCodeChanges: messageMetadata.codeChanges,
        metadataThinking: messageMetadata.thinking,
        metadataIsQuestion: messageMetadata.isQuestion,
        metadataQuestionOptions: messageMetadata.questionOptions,
        metadataRequiresResponse: messageMetadata.requiresResponse,
        metadataMessageReferences: messageMetadata.messageReferences,
        metadataIsInvalid: messageMetadata.isInvalid,
        metadataGitBranch: messageMetadata.gitBranch,
        metadataMrUrl: messageMetadata.mrUrl,
        metadataImages: messageMetadata.images,
        metadataOperationDenied: messageMetadata.operationDenied,
        metadataCreatedAt: messageMetadata.createdAt,
        reviewRoundId: reviewRounds.id,
        reviewRoundNumber: reviewRounds.roundNumber,
        reviewRoundSummary: reviewRounds.summary,
      })
      .from(messages)
      .leftJoin(messageMetadata, eq(messageMetadata.messageId, messages.id))
      .leftJoin(reviewRounds, eq(reviewRounds.sourceMessageId, messages.id))
      .where(messageWhere)
      .orderBy(asc(messages.timestamp));
    const queryMs = Number(process.hrtime.bigint() - queryStart) / 1_000_000;

    const queryLog = [
      '[Storage][loadMessagesWithMetadata]',
      `conversationId=${conversationId}`,
      `since=${hasValidSince ? (since as string) : 'none'}`,
      `rows=${rows.length}`,
      `query=${queryMs.toFixed(2)}ms`,
    ].join(' ');
    if (queryMs >= this.messageQuerySlowLogMs) {
      console.warn(`${queryLog} slow_threshold=${this.messageQuerySlowLogMs}ms`);
    } else {
      console.log(queryLog);
    }

    if (rows.length === 0) {
      if (!hasValidSince) {
        await this.setCache(cacheKey, []);
      }
      return [];
    }

    const combined = rows.map(row => ({
      id: row.id,
      conversationId: row.conversationId,
      role: row.role,
      content: row.content,
      isComplete: row.isComplete,
      timestamp: row.timestamp,
      parentMessageId: row.parentMessageId,
      metadata: row.metadataId
        ? {
            id: row.metadataId,
            messageId: row.metadataMessageId,
            toolCalls: row.metadataToolCalls,
            codeChanges: row.metadataCodeChanges,
            thinking: row.metadataThinking,
            isQuestion: row.metadataIsQuestion,
            questionOptions: row.metadataQuestionOptions,
            requiresResponse: row.metadataRequiresResponse,
            messageReferences: row.metadataMessageReferences,
            isInvalid: row.metadataIsInvalid,
            gitBranch: row.metadataGitBranch,
            mrUrl: row.metadataMrUrl,
            images: row.metadataImages,
            operationDenied: row.metadataOperationDenied,
            createdAt: row.metadataCreatedAt,
            reviewRound: row.reviewRoundId
              ? {
                  id: row.reviewRoundId,
                  roundNumber: row.reviewRoundNumber,
                  summary: row.reviewRoundSummary,
                }
              : null,
          }
        : null,
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
        this.deleteCache(`message_history_version:${conversationId}`),
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
    const cacheKey = `message_history_version:${conversationId}`;
    const cached = await this.getCached<MessageHistoryVersion>(cacheKey);
    if (cached) {
      return cached;
    }

    const [summary] = await db
      .select({
        total: sql<number>`count(*)`,
        latestTimestamp: sql<Date | null>`max(${messages.timestamp})`,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    const version = {
      total: Number(summary?.total || 0),
      latestTimestamp: summary?.latestTimestamp || null,
    };
    await this.setCache(cacheKey, version, this.messageHistoryVersionCacheTtlSeconds);
    return version;
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

  private async upsertReviewProjection(messageId: string, conversationId: string, metadata: any): Promise<void> {
    const db = this.getDb();
    const fileChanges = this.normalizeReviewFileChanges(metadata?.codeChanges);
    const summary = this.extractReviewSummary(metadata, fileChanges.length);

    const existingRoundRows = await db
      .select()
      .from(reviewRounds)
      .where(eq(reviewRounds.sourceMessageId, messageId))
      .limit(1);
    const existingRound = existingRoundRows[0];

    if (fileChanges.length === 0) {
      if (existingRound) {
        await db.delete(reviewFileChanges).where(eq(reviewFileChanges.reviewRoundId, existingRound.id));
        await db.delete(reviewRounds).where(eq(reviewRounds.id, existingRound.id));
        await this.cleanupOrphanReviewDiffBlobs();
      }
      return;
    }

    let roundId = existingRound?.id;
    if (existingRound) {
      await db
        .update(reviewRounds)
        .set({
          status: 'completed',
          summary,
          updatedAt: dayjs().toDate(),
        })
        .where(eq(reviewRounds.id, existingRound.id));
      await db.delete(reviewFileChanges).where(eq(reviewFileChanges.reviewRoundId, existingRound.id));
      await this.cleanupOrphanReviewDiffBlobs();
    } else {
      const [maxRoundRow] = await db
        .select({
          maxRound: sql<number>`coalesce(max(${reviewRounds.roundNumber}), 0)`,
        })
        .from(reviewRounds)
        .where(eq(reviewRounds.conversationId, conversationId));
      const nextRoundNumber = Number(maxRoundRow?.maxRound || 0) + 1;
      roundId = newId();
      await db.insert(reviewRounds).values({
        id: roundId,
        conversationId,
        sourceMessageId: messageId,
        roundNumber: nextRoundNumber,
        status: 'completed',
        summary,
      });
    }

    const preparedRows: Array<{
      id: string;
      conversationId: string;
      reviewRoundId: string;
      messageId: string;
      filePath: string;
      changeType: string;
      status: string;
      oldPath: string | null;
      diffBlobId: string;
      additions: number;
      deletions: number;
    }> = [];

    for (const change of fileChanges) {
      const diffHash = this.buildDiffHash(change.diffText);
      let diffBlobId: string;

      const existingBlobRows = await db
        .select({ id: reviewDiffBlobs.id })
        .from(reviewDiffBlobs)
        .where(eq(reviewDiffBlobs.diffHash, diffHash))
        .limit(1);

      const existingBlob = existingBlobRows[0];
      if (existingBlob) {
        diffBlobId = existingBlob.id;
        await db
          .update(reviewDiffBlobs)
          .set({ lastAccessedAt: dayjs().toDate() })
          .where(eq(reviewDiffBlobs.id, diffBlobId));
      } else {
        diffBlobId = newId();
        await db.insert(reviewDiffBlobs).values({
          id: diffBlobId,
          diffHash,
          diffGzipBase64: this.encodeDiff(change.diffText),
          rawSize: Buffer.byteLength(change.diffText || '', 'utf8'),
          lastAccessedAt: dayjs().toDate(),
        });
      }

      preparedRows.push({
        id: newId(),
        conversationId,
        reviewRoundId: roundId as string,
        messageId,
        filePath: change.filePath,
        changeType: change.changeType,
        status: change.status,
        oldPath: change.oldPath,
        diffBlobId,
        additions: change.additions,
        deletions: change.deletions,
      });
    }

    await db.insert(reviewFileChanges).values(
      preparedRows
    );
  }

  private async cleanupOrphanReviewDiffBlobs(): Promise<void> {
    const db: any = this.getDb();
    await db.execute(sql`
      DELETE FROM review_diff_blobs rdb
      WHERE NOT EXISTS (
        SELECT 1 FROM review_file_changes rfc WHERE rfc.diff_blob_id = rdb.id
      )
    `);
  }

  /**
   * 保存消息元数据
   */
  async saveMessageMetadata(messageId: string, metadata: any): Promise<void> {
    const db = this.getDb();
    const projectionMetadata = metadata;
    const persistedMetadata = this.toLightweightMetadata(metadata);

    // 为了精确清除缓存，我们需要 conversationId
    const msgResult = await db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    
    const conversationId = msgResult[0]?.conversationId;
    if (!conversationId) {
      throw new Error(`Message ${messageId} not found`);
    }

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
        .set(persistedMetadata)
        .where(eq(messageMetadata.messageId, messageId));
    } else {
      // 插入新元数据
      await db.insert(messageMetadata).values({
        id: newId(),
        messageId,
        ...persistedMetadata,
      });
    }

    await this.upsertReviewProjection(messageId, conversationId, projectionMetadata);

    // 清除精确缓存
    await this.deleteCache(`metadata:${messageId}`);
    await Promise.all([
      this.deleteCache(`messages_with_metadata:${conversationId}`),
      this.deleteCache('sessions:list'),
    ]);
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
