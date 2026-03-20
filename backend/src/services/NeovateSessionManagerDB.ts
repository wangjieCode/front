import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, lt } from 'drizzle-orm';
import postgres from 'postgres';
import { neovateSessions } from '../db/schema';
import { NeovateSessionInfo } from '../types';
import { newId } from '../utils/id';
import dayjs from 'dayjs';
import { convertToStoredPath, resolveStoredPath } from '../utils/PathUtils';

/**
 * Neovate 会话管理器（数据库版本）
 * 负责管理对话 ID 到 Neovate 会话 ID 的映射
 * 使用 PostgreSQL 数据库存储，替代文件系统
 */
export class NeovateSessionManagerDB {
  private client: postgres.Sql;
  private db: ReturnType<typeof drizzle>;
  // Promise 队列锁，替代自旋锁
  private lockQueues = new Map<string, Promise<void>>();

  constructor(databaseUrl: string) {
    this.client = postgres(databaseUrl);
    this.db = drizzle(this.client);
  }

  /**
   * 获取 Promise 队列锁（无自旋，无竞态）
   */
  private acquireLock(conversationId: string): Promise<() => void> {
    let release!: () => void;
    const lockHeld = new Promise<void>(r => { release = r; });
    const prev = this.lockQueues.get(conversationId) ?? Promise.resolve();
    const next = prev.then(() => lockHeld);
    this.lockQueues.set(conversationId, next);
    return prev.then(() => {
      return () => {
        release();
        // 无后续等待者时清理条目，防止内存泄漏
        if (this.lockQueues.get(conversationId) === next) {
          this.lockQueues.delete(conversationId);
        }
      };
    });
  }

  /**
   * 获取对话的 Neovate 会话 ID
   * @param conversationId 对话 ID
   * @returns Neovate 会话 ID，如果不存在返回 null
   */
  async getSessionId(conversationId: string): Promise<string | null> {
    console.log(`[NeovateSessionManagerDB] 获取对话 ${conversationId} 的会话 ID`);

    try {
      const result = await this.db
        .select()
        .from(neovateSessions)
        .where(eq(neovateSessions.conversationId, conversationId))
        .limit(1);

      if (result.length > 0) {
        const sessionId = result[0].neovateSessionId;
        console.log(`[NeovateSessionManagerDB] 找到会话 ID: ${sessionId}`);
        return sessionId;
      }

      console.log(`[NeovateSessionManagerDB] 对话 ${conversationId} 没有会话 ID`);
      return null;
    } catch (error) {
      console.error('[NeovateSessionManagerDB] 查询会话 ID 失败:', error);
      throw error;
    }
  }

  /**
   * 保存对话的 Neovate 会话 ID
   * @param conversationId 对话 ID
   * @param neovateSessionId Neovate 会话 ID
   * @param workDir 工作目录
   */
  async saveSessionId(
    conversationId: string,
    neovateSessionId: string,
    workDir: string
  ): Promise<void> {
    const release = await this.acquireLock(conversationId);

    try {
      console.log(`[NeovateSessionManagerDB] 保存对话 ${conversationId} 的会话 ID: ${neovateSessionId}`);

      const storedWorkDir = convertToStoredPath(workDir) || '';
      // 使用 UPSERT 替代 SELECT + INSERT/UPDATE，消除竞态和多余查询
      await this.db.insert(neovateSessions).values({
        id: newId(),
        conversationId,
        neovateSessionId,
        workDir: storedWorkDir,
        lastUsedAt: dayjs().toDate(),
      }).onConflictDoUpdate({
        target: neovateSessions.conversationId,
        set: {
          neovateSessionId,
          workDir: storedWorkDir,
          lastUsedAt: dayjs().toDate(),
        },
      });

      console.log(`[NeovateSessionManagerDB] 会话信息已保存`);
    } catch (error) {
      console.error(`[NeovateSessionManagerDB] 保存会话信息失败:`, error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * 删除对话的会话映射
   * @param conversationId 对话 ID
   */
  async deleteSession(conversationId: string): Promise<void> {
    const release = await this.acquireLock(conversationId);

    try {
      console.log(`[NeovateSessionManagerDB] 删除对话 ${conversationId} 的会话映射`);

      await this.db
        .delete(neovateSessions)
        .where(eq(neovateSessions.conversationId, conversationId));

      console.log(`[NeovateSessionManagerDB] 会话映射已删除`);
    } catch (error) {
      console.error(`[NeovateSessionManagerDB] 删除会话映射失败:`, error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * 获取会话信息
   * @param conversationId 对话 ID
   * @returns 会话信息
   */
  async getSessionInfo(conversationId: string): Promise<NeovateSessionInfo | null> {
    try {
      const result = await this.db
        .select()
        .from(neovateSessions)
        .where(eq(neovateSessions.conversationId, conversationId))
        .limit(1);

      if (result.length > 0) {
        const session = result[0];
        return {
          taskId: session.conversationId, // 保持兼容性
          neovateSessionId: session.neovateSessionId,
          workDir: resolveStoredPath(session.workDir),
          createdAt: session.createdAt,
          lastUsedAt: session.lastUsedAt,
        };
      }

      return null;
    } catch (error) {
      console.error(`[NeovateSessionManagerDB] 读取会话信息失败:`, error);
      throw error;
    }
  }

  /**
   * 更新会话的最后使用时间
   * @param conversationId 对话 ID
   */
  async updateLastUsedTime(conversationId: string): Promise<void> {
    try {
      await this.db
        .update(neovateSessions)
        .set({ lastUsedAt: dayjs().toDate() })
        .where(eq(neovateSessions.conversationId, conversationId));
    } catch (error) {
      console.error(`[NeovateSessionManagerDB] 更新最后使用时间失败:`, error);
      throw error;
    }
  }

  /**
   * 清理过期会话（超过 24 小时未使用）
   * @returns 清理的会话数量
   */
  async cleanupExpiredSessions(): Promise<number> {
    console.log('[NeovateSessionManagerDB] 开始清理过期会话');

    try {
      const expirationDate = dayjs().subtract(24, 'hour').toDate();

      // 先统计数量，再批量删除（一条 SQL 替代逐条 deleteSession）
      const expiredSessions = await this.db
        .select({ id: neovateSessions.id })
        .from(neovateSessions)
        .where(lt(neovateSessions.lastUsedAt, expirationDate));

      const cleanedCount = expiredSessions.length;
      if (cleanedCount > 0) {
        await this.db
          .delete(neovateSessions)
          .where(lt(neovateSessions.lastUsedAt, expirationDate));
      }

      console.log(`[NeovateSessionManagerDB] 清理完成，共清理 ${cleanedCount} 个会话`);
      return cleanedCount;
    } catch (error) {
      console.error('[NeovateSessionManagerDB] 清理过期会话失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有会话信息
   * @returns 所有会话信息数组
   */
  async getAllSessions(): Promise<NeovateSessionInfo[]> {
    try {
      const results = await this.db.select().from(neovateSessions);

      return results.map(session => ({
        taskId: session.conversationId, // 保持兼容性
        neovateSessionId: session.neovateSessionId,
        workDir: resolveStoredPath(session.workDir),
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
      }));
    } catch (error) {
      console.error('[NeovateSessionManagerDB] 获取所有会话失败:', error);
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    await this.client.end();
  }
}
