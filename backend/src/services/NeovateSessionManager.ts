import * as fs from 'fs/promises';
import * as path from 'path';
import { NeovateSessionInfo } from '../types';

/**
 * Neovate 会话管理器
 * 负责管理任务 ID 到 Neovate 会话 ID 的映射
 */
export class NeovateSessionManager {
  private baseDir: string;
  private locks: Map<string, boolean> = new Map();
  private cache: Map<string, NeovateSessionInfo> = new Map();

  constructor(baseDir: string = 'backend/data/neovate-sessions') {
    this.baseDir = baseDir;
  }

  /**
   * 获取锁
   */
  private async acquireLock(taskId: string): Promise<void> {
    while (this.locks.get(taskId)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.locks.set(taskId, true);
  }

  /**
   * 释放锁
   */
  private releaseLock(taskId: string): void {
    this.locks.delete(taskId);
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // 目录已存在，忽略错误
    }
  }

  /**
   * 获取任务的会话目录路径
   */
  private getTaskSessionDir(taskId: string): string {
    return path.join(this.baseDir, taskId);
  }

  /**
   * 获取会话文件路径
   */
  private getSessionFilePath(taskId: string): string {
    return path.join(this.getTaskSessionDir(taskId), 'session.json');
  }

  /**
   * 获取全局索引文件路径
   */
  private getGlobalIndexPath(): string {
    return path.join(this.baseDir, 'index.json');
  }

  /**
   * 更新全局索引
   */
  private async updateGlobalIndex(taskId: string): Promise<void> {
    await this.ensureDir(this.baseDir);
    const indexPath = this.getGlobalIndexPath();

    let taskIds: string[] = [];
    try {
      const indexData = await fs.readFile(indexPath, 'utf-8');
      taskIds = JSON.parse(indexData);
    } catch (error) {
      // 索引文件不存在，使用空数组
    }

    if (!taskIds.includes(taskId)) {
      taskIds.push(taskId);
      await fs.writeFile(indexPath, JSON.stringify(taskIds, null, 2), 'utf-8');
    }
  }

  /**
   * 从全局索引中移除任务
   */
  private async removeFromGlobalIndex(taskId: string): Promise<void> {
    const indexPath = this.getGlobalIndexPath();

    try {
      const indexData = await fs.readFile(indexPath, 'utf-8');
      let taskIds: string[] = JSON.parse(indexData);
      taskIds = taskIds.filter(id => id !== taskId);
      await fs.writeFile(indexPath, JSON.stringify(taskIds, null, 2), 'utf-8');
    } catch (error) {
      // 索引文件不存在，忽略
    }
  }

  /**
   * 获取任务的 Neovate 会话 ID
   * @param taskId 任务 ID
   * @returns Neovate 会话 ID，如果不存在返回 null
   */
  async getSessionId(taskId: string): Promise<string | null> {
    console.log(`[NeovateSessionManager] 获取任务 ${taskId} 的会话 ID`);

    // 先检查缓存
    const cached = this.cache.get(taskId);
    if (cached) {
      console.log(`[NeovateSessionManager] 从缓存获取会话 ID: ${cached.neovateSessionId}`);
      return cached.neovateSessionId;
    }

    // 从文件加载
    const sessionInfo = await this.getSessionInfo(taskId);
    if (sessionInfo) {
      // 更新缓存
      this.cache.set(taskId, sessionInfo);
      console.log(`[NeovateSessionManager] 从文件获取会话 ID: ${sessionInfo.neovateSessionId}`);
      return sessionInfo.neovateSessionId;
    }

    console.log(`[NeovateSessionManager] 任务 ${taskId} 没有会话 ID`);
    return null;
  }

  /**
   * 保存任务的 Neovate 会话 ID
   * @param taskId 任务 ID
   * @param neovateSessionId Neovate 会话 ID
   * @param workDir 工作目录
   */
  async saveSessionId(
    taskId: string,
    neovateSessionId: string,
    workDir: string
  ): Promise<void> {
    await this.acquireLock(taskId);

    try {
      console.log(`[NeovateSessionManager] 保存任务 ${taskId} 的会话 ID: ${neovateSessionId}`);

      const now = new Date();
      const sessionInfo: NeovateSessionInfo = {
        taskId,
        neovateSessionId,
        workDir,
        createdAt: now,
        lastUsedAt: now,
      };

      // 如果已存在，保留创建时间
      const existing = await this.getSessionInfo(taskId);
      if (existing) {
        sessionInfo.createdAt = existing.createdAt;
      }

      // 保存到文件
      const taskSessionDir = this.getTaskSessionDir(taskId);
      await this.ensureDir(taskSessionDir);

      const sessionFilePath = this.getSessionFilePath(taskId);
      await fs.writeFile(
        sessionFilePath,
        JSON.stringify(sessionInfo, null, 2),
        'utf-8'
      );

      // 更新全局索引
      await this.updateGlobalIndex(taskId);

      // 更新缓存
      this.cache.set(taskId, sessionInfo);

      console.log(`[NeovateSessionManager] 会话信息已保存`);
    } catch (error) {
      console.error(`[NeovateSessionManager] 保存会话信息失败:`, error);
      throw error;
    } finally {
      this.releaseLock(taskId);
    }
  }

  /**
   * 删除任务的会话映射
   * @param taskId 任务 ID
   */
  async deleteSession(taskId: string): Promise<void> {
    await this.acquireLock(taskId);

    try {
      console.log(`[NeovateSessionManager] 删除任务 ${taskId} 的会话映射`);

      const taskSessionDir = this.getTaskSessionDir(taskId);

      // 删除会话目录
      try {
        await fs.rm(taskSessionDir, { recursive: true, force: true });
      } catch (error) {
        // 目录不存在，忽略
      }

      // 从全局索引中移除
      await this.removeFromGlobalIndex(taskId);

      // 清除缓存
      this.cache.delete(taskId);

      console.log(`[NeovateSessionManager] 会话映射已删除`);
    } catch (error) {
      console.error(`[NeovateSessionManager] 删除会话映射失败:`, error);
      throw error;
    } finally {
      this.releaseLock(taskId);
    }
  }

  /**
   * 获取会话信息
   * @param taskId 任务 ID
   * @returns 会话信息
   */
  async getSessionInfo(taskId: string): Promise<NeovateSessionInfo | null> {
    try {
      const sessionFilePath = this.getSessionFilePath(taskId);
      const sessionData = await fs.readFile(sessionFilePath, 'utf-8');
      const sessionInfo = JSON.parse(sessionData);

      // 转换日期字符串为 Date 对象
      sessionInfo.createdAt = new Date(sessionInfo.createdAt);
      sessionInfo.lastUsedAt = new Date(sessionInfo.lastUsedAt);

      return sessionInfo;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      console.error(`[NeovateSessionManager] 读取会话信息失败:`, error);
      throw error;
    }
  }

  /**
   * 更新会话的最后使用时间
   * @param taskId 任务 ID
   */
  async updateLastUsedTime(taskId: string): Promise<void> {
    const sessionInfo = await this.getSessionInfo(taskId);
    if (sessionInfo) {
      sessionInfo.lastUsedAt = new Date();
      await this.saveSessionId(
        taskId,
        sessionInfo.neovateSessionId,
        sessionInfo.workDir
      );
    }
  }

  /**
   * 清理过期会话（超过 24 小时未使用）
   * @returns 清理的会话数量
   */
  async cleanupExpiredSessions(): Promise<number> {
    console.log('[NeovateSessionManager] 开始清理过期会话');

    try {
      const indexPath = this.getGlobalIndexPath();
      const indexData = await fs.readFile(indexPath, 'utf-8');
      const taskIds: string[] = JSON.parse(indexData);

      const now = new Date();
      const expirationTime = 24 * 60 * 60 * 1000; // 24 小时（毫秒）
      let cleanedCount = 0;

      for (const taskId of taskIds) {
        const sessionInfo = await this.getSessionInfo(taskId);
        if (sessionInfo) {
          const timeSinceLastUse = now.getTime() - sessionInfo.lastUsedAt.getTime();
          if (timeSinceLastUse > expirationTime) {
            console.log(`[NeovateSessionManager] 清理过期会话: ${taskId}`);
            await this.deleteSession(taskId);
            cleanedCount++;
          }
        }
      }

      console.log(`[NeovateSessionManager] 清理完成，共清理 ${cleanedCount} 个会话`);
      return cleanedCount;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // 索引文件不存在，没有会话需要清理
        return 0;
      }
      console.error('[NeovateSessionManager] 清理过期会话失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有会话信息
   * @returns 所有会话信息数组
   */
  async getAllSessions(): Promise<NeovateSessionInfo[]> {
    try {
      const indexPath = this.getGlobalIndexPath();
      const indexData = await fs.readFile(indexPath, 'utf-8');
      const taskIds: string[] = JSON.parse(indexData);

      const sessions: NeovateSessionInfo[] = [];
      for (const taskId of taskIds) {
        const sessionInfo = await this.getSessionInfo(taskId);
        if (sessionInfo) {
          sessions.push(sessionInfo);
        }
      }

      return sessions;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
