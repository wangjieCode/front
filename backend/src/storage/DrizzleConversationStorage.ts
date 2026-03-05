import { eq, and, desc, asc, lt, gt, inArray, ne, sql } from 'drizzle-orm';
import { DatabaseManager } from '../db/DatabaseManager';
import {
  conversations,
  conversationContexts,
  messages,
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
import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';

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

export class DrizzleConversationStorage {
  private messageQuerySlowLogMs = Number(process.env.MESSAGE_QUERY_SLOW_LOG_MS || 800);

  private getDb() {
    return DatabaseManager.getDb();
  }

  // ==================== 型转换工具 ====================

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

  // ==================== diff 工具 ====================

  // D2: 返回 Buffer，直接写入 bytea，消除 base64 编解码
  private encodeDiff(diffText: string): Buffer {
    return gzipSync(Buffer.from(diffText, 'utf8'));
  }

  private decodeDiff(diffBlob: Buffer): string {
    try {
      return gunzipSync(diffBlob).toString('utf8');
    } catch {
      return '';
    }
  }

  private buildDiffHash(diffText: string): string {
    return createHash('sha256').update(diffText).digest('hex');
  }

  private countDiffStats(diffText: string): { additions: number; deletions: number } {
    if (!diffText) return { additions: 0, deletions: 0 };
    let additions = 0;
    let deletions = 0;
    for (const line of diffText.split('\n')) {
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+')) additions++;
      if (line.startsWith('-')) deletions++;
    }
    return { additions, deletions };
  }

  // ==================== metadata 处理 ====================

  // D1: 存储时 codeChanges 只保留 filePath + changeType，去掉大体积 diff 文本
  private toLightweightCodeChanges(codeChanges: any): any {
    if (!Array.isArray(codeChanges)) return codeChanges;
    return codeChanges
      .map((change: any) => ({
        filePath: change?.filePath || change?.path || change?.newPath || '',
        changeType: String(change?.changeType || change?.type || change?.status || 'modified'),
      }))
      .filter((item: any) => item.filePath);
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
    if (!Array.isArray(codeChanges)) return [];
    return codeChanges
      .map((item) => {
        const filePath = item?.filePath || item?.path || item?.newPath;
        if (!filePath || typeof filePath !== 'string') return null;
        const additions = Number(item?.additions ?? 0);
        const deletions = Number(item?.deletions ?? 0);
        const diffText = String(
          item?.diff || item?.patch || item?.diffPatch ||
          item?.content || item?.unifiedDiff || item?.unified_diff || ''
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
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  private extractReviewSummary(metadata: any, fileChangeCount: number): string {
    const explicitSummary = metadata?.reviewSummary || metadata?.summary;
    if (typeof explicitSummary === 'string' && explicitSummary.trim().length > 0) {
      return explicitSummary.trim();
    }
    return `Changed ${fileChangeCount} file${fileChangeCount > 1 ? 's' : ''}`;
  }

  // ==================== 会话管理 ====================

  async saveSession(session: any): Promise<void> {
    const db = this.getDb();
    if (!session.id) throw new Error('Session ID is required');

    const conversationData = {
      id: session.id,
      userId: session.userId,
      projectId: session.projectId || session.context?.projectInfo?.projectId,
      status: session.status,
      visibility: session.visibility || 'private',
      title: session.title,
      projectName: session.projectName || session.context?.projectInfo?.projectName,
      updatedAt: session.updatedAt || dayjs().toDate(),
      completedAt: session.completedAt || null,
      error: session.error || null,
    };

    await db.insert(conversations)
      .values(conversationData)
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          status: conversationData.status,
          visibility: conversationData.visibility,
          title: conversationData.title,
          projectId: conversationData.projectId,
          projectName: conversationData.projectName,
          updatedAt: conversationData.updatedAt,
          completedAt: conversationData.completedAt,
          error: conversationData.error,
        },
      });

    if (session.context) {
      await this.saveContext(session.id, session.context);
    }
  }

  async loadSession(sessionId: string): Promise<Conversation | null> {
    const db = this.getDb();
    const [sessionRows, contextRows] = await Promise.all([
      db.select().from(conversations).where(eq(conversations.id, sessionId)).limit(1),
      db.select().from(conversationContexts).where(eq(conversationContexts.conversationId, sessionId)).limit(1),
    ]);

    const rawSession = sessionRows[0];
    if (!rawSession) return null;

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

    return { ...rawSession, context: context || null } as unknown as Conversation;
  }

  async loadSessionAccessInfo(sessionId: string): Promise<SessionAccessInfo | null> {
    const db = this.getDb();
    const result = await db
      .select({ id: conversations.id, userId: conversations.userId, visibility: conversations.visibility })
      .from(conversations)
      .where(eq(conversations.id, sessionId))
      .limit(1);
    const row = result[0];
    if (!row) return null;
    return { id: row.id, userId: row.userId, visibility: row.visibility || 'private' };
  }

  // ==================== Review 查询 ====================

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
      console.warn(`[Storage][review] getReviewSidebar failed. sessionId=${sessionId}`, error);
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
    } catch (error) {
      console.warn(`[Storage][review] getReviewFiles failed. sessionId=${sessionId}`, error);
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
            rdb.diff_blob,
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
            rdb.diff_blob,
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
          // D2: diff_blob 是 Buffer，直接 gunzip，不需要 base64 decode
          patch: row.diff_blob ? this.decodeDiff(row.diff_blob) : null,
          additions: this.toNumber(row.additions),
          deletions: this.toNumber(row.deletions),
          createdAt: this.toDateOrNull(row.created_at),
          updatedAt: this.toDateOrNull(row.updated_at),
        })),
      };
    } catch (error) {
      console.warn(`[Storage][review] getReviewDiff failed. sessionId=${sessionId}, filePath=${filePath}`, error);
      return { sessionId, filePath, roundId: roundId || null, items: [] };
    }
  }

  async getReviewUpdates(sessionId: string, since: string): Promise<ReviewUpdatesData> {
    const db: any = this.getDb();
    const sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) return { sessionId, since, items: [] };

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
      console.warn(`[Storage][review] getReviewUpdates failed. sessionId=${sessionId}`, error);
      return { sessionId, since, items: [] };
    }
  }

  async loadSessionByAgentSessionId(agentSessionId: string): Promise<Conversation | null> {
    const db = this.getDb();
    const result = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, agentSessionId))
      .limit(1);
    return result[0] || null;
  }

  // ==================== 会话列表 ====================

  /**
   * D10: 4 次串行查询 → 单 SQL（WITH latest_rounds + file_counts）
   */
  async listSessions(options: ListSessionsOptions = {}): Promise<any[]> {
    const db: any = this.getDb();
    const { userId, environment } = options;

    const whereClause = userId && environment
      ? sql`WHERE (c.user_id = ${userId} OR (c.visibility = 'public' AND c.user_id != ${userId})) AND cc.variables ->> 'environment' = ${environment}`
      : userId
      ? sql`WHERE c.user_id = ${userId} OR (c.visibility = 'public' AND c.user_id != ${userId})`
      : environment
      ? sql`WHERE cc.variables ->> 'environment' = ${environment}`
      : sql``;

    try {
      const result = await db.execute(sql`
        WITH latest_rounds AS (
          SELECT DISTINCT ON (conversation_id)
            id, conversation_id, round_number, summary, created_at
          FROM review_rounds
          ORDER BY conversation_id, round_number DESC
        ),
        file_counts AS (
          SELECT review_round_id, COUNT(*)::int AS file_count
          FROM review_file_changes
          WHERE review_round_id IN (SELECT id FROM latest_rounds)
          GROUP BY review_round_id
        )
        SELECT
          c.id, c.user_id, c.visibility, c.status, c.title,
          c.project_id, c.project_name, c.created_at, c.updated_at,
          cc.mode, cc.task_description, cc.work_dir,
          cc.variables ->> 'environment' AS environment,
          lr.id AS review_round_id, lr.round_number,
          lr.summary AS round_summary, lr.created_at AS round_created_at,
          COALESCE(fc.file_count, 0) AS file_count
        FROM conversations c
        INNER JOIN conversation_contexts cc ON cc.conversation_id = c.id
        LEFT JOIN latest_rounds lr ON lr.conversation_id = c.id
        LEFT JOIN file_counts fc ON fc.review_round_id = lr.id
        ${whereClause}
        ORDER BY c.created_at DESC
      `);

      const rows = (result?.rows || result || []) as any[];
      return rows.map((row) => ({
        id: String(row.id || ''),
        userId: String(row.user_id || ''),
        visibility: String(row.visibility || 'private'),
        status: String(row.status || 'active'),
        title: row.title ? String(row.title) : '',
        projectId: row.project_id ? String(row.project_id) : null,
        projectName: row.project_name ? String(row.project_name) : null,
        createdAt: this.toDateOrNull(row.created_at) || new Date(),
        updatedAt: this.toDateOrNull(row.updated_at) || new Date(),
        context: {
          mode: row.mode || 'edit',
          taskDescription: row.task_description || '',
          variables: { environment: row.environment || null },
          projectInfo: {
            workDir: resolveStoredPath(row.work_dir || null),
            projectId: row.project_id || null,
            projectName: row.project_name || null,
            gitRepositoryUrl: '',
            gitBranch: null,
            relevantFiles: [],
          },
        },
        review: row.review_round_id
          ? {
              latestRoundNumber: this.toNumber(row.round_number),
              latestRoundSummary: row.round_summary ? String(row.round_summary) : null,
              changedFileCount: this.toNumber(row.file_count),
              latestRoundCreatedAt: this.toDateOrNull(row.round_created_at),
            }
          : null,
      }));
    } catch (error) {
      console.error('[Storage] listSessions 错误:', error);
      throw error;
    }
  }

  async getInactiveSessions(olderThanXDays: number, status: string = 'active'): Promise<any[]> {
    const db = this.getDb();
    const thresholdDate = dayjs().subtract(olderThanXDays, 'day').toDate();
    return await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.status, status), lt(conversations.updatedAt, thresholdDate)));
  }

  async updateSession(sessionId: string, updates: Partial<NewConversation>): Promise<void> {
    const db = this.getDb();
    await db
      .update(conversations)
      .set({ ...updates, updatedAt: dayjs().toDate() })
      .where(eq(conversations.id, sessionId));
  }

  /**
   * D6: FK CASCADE 生效后，只需删除 conversations 行，子表全部级联删除
   * 仍需手动清理孤立 diff blobs（无 CASCADE，用 ON DELETE RESTRICT）
   */
  async deleteSession(sessionId: string): Promise<void> {
    const db = this.getDb();
    await db.delete(conversations).where(eq(conversations.id, sessionId));
    await this.cleanupOrphanReviewDiffBlobs();
  }

  // ==================== 消息管理 ====================

  /**
   * D1: 单次 INSERT 包含所有元数据字段；同时触发 review projection
   */
  async saveMessage(message: NewMessage): Promise<void> {
    const db = this.getDb();

    // 存储时 codeChanges 只保留轻量版（去掉 diff 文本），避免大 JSONB 膨胀
    const codeChangesForReview = message.codeChanges;
    const messageToStore: NewMessage = {
      ...message,
      codeChanges: this.toLightweightCodeChanges(message.codeChanges as any),
    };

    await db.insert(messages).values(messageToStore);

    // 全量 codeChanges 用于构建 review projection
    if (codeChangesForReview && message.conversationId) {
      await this.upsertReviewProjection(message.id, message.conversationId, { codeChanges: codeChangesForReview });
    }
  }

  async loadMessages(conversationId: string, options?: PaginationOptions): Promise<Message[]> {
    const db = this.getDb();
    let query = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.timestamp));
    if (options?.limit) query = query.limit(options.limit) as any;
    if (options?.offset) query = query.offset(options.offset) as any;
    return query;
  }

  /**
   * D1: 消除 message_metadata LEFT JOIN，直接从 messages 列读取元数据
   */
  async loadMessagesWithMetadata(conversationId: string, since?: string): Promise<any[]> {
    const sinceDate = since ? new Date(since) : null;
    const hasValidSince = !!sinceDate && !Number.isNaN(sinceDate.getTime());
    const db = this.getDb();

    const messageWhere = hasValidSince
      ? and(eq(messages.conversationId, conversationId), gt(messages.timestamp, sinceDate as Date))
      : eq(messages.conversationId, conversationId);

    const queryStart = process.hrtime.bigint();
    const rows = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        timestamp: messages.timestamp,
        parentMessageId: messages.parentMessageId,
        toolCalls: messages.toolCalls,
        codeChanges: messages.codeChanges,
        thinking: messages.thinking,
        isQuestion: messages.isQuestion,
        questionOptions: messages.questionOptions,
        requiresResponse: messages.requiresResponse,
        messageReferences: messages.messageReferences,
        isInvalid: messages.isInvalid,
        gitBranch: messages.gitBranch,
        mrUrl: messages.mrUrl,
        images: messages.images,
        operationDenied: messages.operationDenied,
        reviewRoundId: reviewRounds.id,
        reviewRoundNumber: reviewRounds.roundNumber,
        reviewRoundSummary: reviewRounds.summary,
      })
      .from(messages)
      .leftJoin(reviewRounds, eq(reviewRounds.sourceMessageId, messages.id))
      .where(messageWhere)
      .orderBy(asc(messages.timestamp));

    const queryMs = Number(process.hrtime.bigint() - queryStart) / 1_000_000;
    const logLine = [
      '[Storage][loadMessagesWithMetadata]',
      `conversationId=${conversationId}`,
      `since=${hasValidSince ? since : 'none'}`,
      `rows=${rows.length}`,
      `query=${queryMs.toFixed(2)}ms`,
    ].join(' ');
    if (queryMs >= this.messageQuerySlowLogMs) {
      console.warn(`${logLine} slow_threshold=${this.messageQuerySlowLogMs}ms`);
    } else {
      console.log(logLine);
    }

    if (rows.length === 0) return [];

    return rows.map((row) => {
      // 只有存在非默认元数据时才设置 metadata，保留 USER 消息 metadata=null 的语义
      const hasNonDefaultMetadata = !!(
        row.toolCalls || row.codeChanges || row.thinking ||
        row.isQuestion || row.requiresResponse || row.isInvalid ||
        row.gitBranch || row.mrUrl || row.images || row.operationDenied ||
        row.messageReferences || row.questionOptions || row.reviewRoundId
      );
      return {
        id: row.id,
        conversationId: row.conversationId,
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
        parentMessageId: row.parentMessageId,
        metadata: hasNonDefaultMetadata
          ? {
              toolCalls: row.toolCalls,
              codeChanges: row.codeChanges,
              thinking: row.thinking,
              isQuestion: row.isQuestion,
              questionOptions: row.questionOptions,
              requiresResponse: row.requiresResponse,
              messageReferences: row.messageReferences,
              isInvalid: row.isInvalid,
              gitBranch: row.gitBranch,
              mrUrl: row.mrUrl,
              images: row.images,
              operationDenied: row.operationDenied,
              reviewRound: row.reviewRoundId
                ? { id: row.reviewRoundId, roundNumber: row.reviewRoundNumber, summary: row.reviewRoundSummary }
                : null,
            }
          : null,
      };
    });
  }

  async loadMessage(conversationId: string, messageId: string): Promise<Message | null> {
    const db = this.getDb();
    const result = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.id, messageId)))
      .limit(1);
    return result[0] || null;
  }

  async updateMessageContent(messageId: string, content: string): Promise<void> {
    const db = this.getDb();
    await db.update(messages).set({ content }).where(eq(messages.id, messageId));
  }

  async getMessageCount(conversationId: string): Promise<number> {
    const db = this.getDb();
    const result = await db
      .select({ total: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    return Number(result[0]?.total || 0);
  }

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

  // ==================== 上下文管理 ====================

  /**
   * D3: SELECT + INSERT/UPDATE → 单次 UPSERT
   */
  async saveContext(conversationId: string, context: any): Promise<void> {
    const db = this.getDb();
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

    await db.insert(conversationContexts)
      .values({ id: newId(), conversationId, ...contextData })
      .onConflictDoUpdate({
        target: conversationContexts.conversationId,
        set: { ...contextData, updatedAt: dayjs().toDate() },
      });
  }

  async loadContext(conversationId: string): Promise<any | null> {
    const db = this.getDb();
    const result = await db
      .select()
      .from(conversationContexts)
      .where(eq(conversationContexts.conversationId, conversationId))
      .limit(1);
    const rawContext = result[0] || null;
    if (!rawContext) return null;

    return {
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
    };
  }

  // ==================== 元数据（更新用） ====================

  /**
   * D1: 更新已有消息的元数据字段（UPDATE messages），并触发 review projection
   * 仅在需要更新已保存消息的元数据时调用；新消息创建走 saveMessage
   */
  async saveMessageMetadata(messageId: string, metadata: any, conversationId?: string): Promise<void> {
    const db = this.getDb();

    const updateFields: Partial<NewMessage> = {
      toolCalls: metadata.toolCalls ?? null,
      codeChanges: this.toLightweightCodeChanges(metadata.codeChanges) ?? null,
      thinking: metadata.thinking ?? null,
      isQuestion: metadata.isQuestion ?? false,
      questionOptions: metadata.questionOptions ?? null,
      requiresResponse: metadata.requiresResponse ?? false,
      messageReferences: metadata.messageReferences ?? null,
      isInvalid: metadata.isInvalid ?? false,
      gitBranch: metadata.gitBranch ?? null,
      mrUrl: metadata.mrUrl ?? null,
      images: metadata.images ?? null,
      operationDenied: metadata.operationDenied ?? null,
    };

    await db.update(messages).set(updateFields).where(eq(messages.id, messageId));

    let resolvedConversationId = conversationId;
    if (!resolvedConversationId) {
      const result = await db
        .select({ conversationId: messages.conversationId })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);
      resolvedConversationId = result[0]?.conversationId;
    }
    if (resolvedConversationId && metadata.codeChanges) {
      await this.upsertReviewProjection(messageId, resolvedConversationId, metadata);
    }
  }

  /**
   * D1: 从 messages 表读取元数据（已合并，无需查 message_metadata）
   */
  async loadMessageMetadata(messageId: string): Promise<any | null> {
    const db = this.getDb();
    const result = await db
      .select({
        toolCalls: messages.toolCalls,
        codeChanges: messages.codeChanges,
        thinking: messages.thinking,
        isQuestion: messages.isQuestion,
        questionOptions: messages.questionOptions,
        requiresResponse: messages.requiresResponse,
        messageReferences: messages.messageReferences,
        isInvalid: messages.isInvalid,
        gitBranch: messages.gitBranch,
        mrUrl: messages.mrUrl,
        images: messages.images,
        operationDenied: messages.operationDenied,
      })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    return result[0] || null;
  }

  // ==================== Review Projection ====================

  /**
   * D12: 不在热路径上调用 cleanupOrphanReviewDiffBlobs；
   * D13: 预计算 hash，消除 4 次重复 SHA256
   */
  async upsertReviewProjection(messageId: string, conversationId: string, metadata: any): Promise<void> {
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
        // D12: 不在此处触发全表 blob 清理，由 deleteSession 或定期任务负责
      }
      return;
    }

    let roundId = existingRound?.id;
    if (existingRound) {
      await db
        .update(reviewRounds)
        .set({ status: 'completed', summary, updatedAt: dayjs().toDate() })
        .where(eq(reviewRounds.id, existingRound.id));
      await db.delete(reviewFileChanges).where(eq(reviewFileChanges.reviewRoundId, existingRound.id));
    } else {
      const [maxRoundRow] = await db
        .select({ maxRound: sql<number>`coalesce(max(${reviewRounds.roundNumber}), 0)` })
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

    // D13: 预计算所有 hash，消除后续重复哈希运算（原来每条 4 次 SHA256）
    const fileChangesWithHash = fileChanges.map((c) => ({
      ...c,
      hash: this.buildDiffHash(c.diffText),
    }));

    const hashList = fileChangesWithHash.map((c) => c.hash);
    const existingBlobs = await db
      .select({ id: reviewDiffBlobs.id, diffHash: reviewDiffBlobs.diffHash })
      .from(reviewDiffBlobs)
      .where(inArray(reviewDiffBlobs.diffHash, hashList));
    const blobMap = new Map(existingBlobs.map((b) => [b.diffHash, b.id]));

    const now = dayjs().toDate();
    const newBlobRows = fileChangesWithHash
      .filter((c) => !blobMap.has(c.hash))
      .map((c) => {
        const id = newId();
        blobMap.set(c.hash, id);
        return {
          id,
          diffHash: c.hash,
          // D2: 存储 Buffer，对应 bytea 列
          diffBlob: this.encodeDiff(c.diffText),
          rawSize: Buffer.byteLength(c.diffText || '', 'utf8'),
          lastAccessedAt: now,
        };
      });
    if (newBlobRows.length > 0) {
      await db.insert(reviewDiffBlobs).values(newBlobRows);
    }

    const fileChangeRows = fileChangesWithHash.map((change) => ({
      id: newId(),
      conversationId,
      reviewRoundId: roundId as string,
      messageId,
      filePath: change.filePath,
      changeType: change.changeType,
      status: change.status,
      oldPath: change.oldPath,
      diffBlobId: blobMap.get(change.hash) as string,
      additions: change.additions,
      deletions: change.deletions,
    }));

    await db.insert(reviewFileChanges).values(fileChangeRows);
  }

  /**
   * D12: 公开方法，供 deleteSession 和定期清理任务调用
   * 不再嵌入 upsertReviewProjection 热路径
   */
  async cleanupOrphanReviewDiffBlobs(): Promise<void> {
    const db: any = this.getDb();
    await db.execute(sql`
      DELETE FROM review_diff_blobs rdb
      WHERE NOT EXISTS (
        SELECT 1 FROM review_file_changes rfc WHERE rfc.diff_blob_id = rdb.id
      )
    `);
  }

  // ==================== 数据完整性维护 ====================

  /**
   * D11: for-loop 逐条删除 → 单次 batch DELETE
   */
  async cleanupOrphanedMessages(): Promise<number> {
    const db: any = this.getDb();
    const result = await db.execute(sql`
      WITH deleted AS (
        DELETE FROM messages
        WHERE conversation_id NOT IN (SELECT id FROM conversations)
        RETURNING id
      )
      SELECT COUNT(*)::int AS count FROM deleted
    `);
    return this.toNumber((result?.rows || result)?.[0]?.count);
  }

  /**
   * D1: message_metadata 表已删除，孤立元数据不再存在
   */
  async cleanupOrphanedMetadata(): Promise<number> {
    return 0;
  }

  async validateDataIntegrity(conversationId: string): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    const conversation = await this.loadSession(conversationId);
    if (!conversation) {
      issues.push(`Conversation ${conversationId} not found`);
      return { valid: false, issues };
    }
    const context = await this.loadContext(conversationId);
    if (!context) issues.push(`Context for conversation ${conversationId} not found`);
    const messageList = await this.loadMessages(conversationId);
    if (messageList.length === 0) issues.push(`No messages found for conversation ${conversationId}`);
    return { valid: issues.length === 0, issues };
  }

  // ==================== Neovate 会话 ====================

  async saveSessionId(conversationId: string, neovateSessionId: string, workDir: string): Promise<void> {
    const db = this.getDb();
    await db.insert(neovateSessions)
      .values({
        id: newId(),
        conversationId,
        neovateSessionId,
        workDir: convertToStoredPath(workDir) || workDir,
      })
      .onConflictDoUpdate({
        target: neovateSessions.conversationId,
        set: { neovateSessionId, workDir: convertToStoredPath(workDir) || workDir, lastUsedAt: dayjs().toDate() },
      });
  }

  async getSessionId(conversationId: string): Promise<string | null> {
    const db = this.getDb();
    const result = await db
      .select({ neovateSessionId: neovateSessions.neovateSessionId })
      .from(neovateSessions)
      .where(eq(neovateSessions.conversationId, conversationId))
      .limit(1);
    return result[0]?.neovateSessionId || null;
  }
}
