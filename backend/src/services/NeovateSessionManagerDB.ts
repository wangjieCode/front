import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
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
  private locks: Map<string, boolean> = new Map();

  constructor(databaseUrl: string) {
    this.client = postgres(databaseUrl);
    this.db = drizzle(this.client);
  }

  /**
   * 获取锁
   */
  private async acquireLock(conversationId: string): Promise<void> {
    while (this.locks.get(conversationId)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.locks.set(conversationId, true);
  }

  /**
   * 释放锁
   */
  private releaseLock(conversationId: string): void {
    this.locks.delete(conversationId);
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
    await this.acquireLock(conversationId);

    try {
      console.log(`[NeovateSessionManagerDB] 保存对话 ${conversationId} 的会话 ID: ${neovateSessionId}`);

      // 检查是否已存在
      const existing = await this.db
        .select()
        .from(neovateSessions)
        .where(eq(neovateSessions.conversationId, conversationId))
        .limit(1);

      if (existing.length > 0) {
        // 记录已存在，不需要更新，直接返回
        // 只在创建时保存一次
        // console.log(`[NeovateSessionManagerDB] 会话已存在，跳过更新`);
        return;
      } else {
        // 插入新记录
        await this.db.insert(neovateSessions).values({
          id: newId(),
          conversationId,
          neovateSessionId,
          workDir: convertToStoredPath(workDir) || '',
          lastUsedAt: dayjs().toDate(),
        });

        console.log(`[NeovateSessionManagerDB] 会话信息已创建`);
      }
    } catch (error) {
      console.error(`[NeovateSessionManagerDB] 保存会话信息失败:`, error);
      throw error;
    } finally {
      this.releaseLock(conversationId);
    }
  }

  /**
   * 删除对话的会话映射
   * @param conversationId 对话 ID
   */
  async deleteSession(conversationId: string): Promise<void> {
    await this.acquireLock(conversationId);

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
      this.releaseLock(conversationId);
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
      const expirationTime = 24 * 60 * 60 * 1000; // 24 小时（毫秒）
      const expirationDate = dayjs().subtract(expirationTime, 'millisecond').toDate();

      // 查询过期会话
      const expiredSessions = await this.db
        .select()
        .from(neovateSessions)
        .where(eq(neovateSessions.lastUsedAt, expirationDate));

      // 删除过期会话
      for (const session of expiredSessions) {
        await this.deleteSession(session.conversationId);
      }

      const cleanedCount = expiredSessions.length;
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
