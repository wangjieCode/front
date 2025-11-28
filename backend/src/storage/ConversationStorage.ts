import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ConversationSession,
  ConversationMessage,
  ConversationContext,
  ConversationBranch,
} from '../types';

/**
 * 对话存储接口
 */
export interface IConversationStorage {
  /**
   * 保存会话
   */
  saveSession(session: ConversationSession): Promise<void>;

  /**
   * 加载会话
   */
  loadSession(sessionId: string): Promise<ConversationSession | null>;

  /**
   * 获取所有会话列表
   */
  listSessions(): Promise<ConversationSession[]>;

  /**
   * 保存消息
   */
  saveMessage(message: ConversationMessage): Promise<void>;

  /**
   * 加载消息历史
   */
  loadMessages(
    sessionId: string,
    branchId?: string
  ): Promise<ConversationMessage[]>;

  /**
   * 加载单条消息
   */
  loadMessage(sessionId: string, messageId: string): Promise<ConversationMessage | null>;

  /**
   * 保存上下文
   */
  saveContext(
    sessionId: string,
    context: ConversationContext
  ): Promise<void>;

  /**
   * 加载上下文
   */
  loadContext(sessionId: string): Promise<ConversationContext | null>;

  /**
   * 保存分支
   */
  saveBranch(sessionId: string, branch: ConversationBranch): Promise<void>;

  /**
   * 加载分支
   */
  loadBranch(sessionId: string, branchId: string): Promise<ConversationBranch | null>;

  /**
   * 删除会话
   */
  deleteSession(sessionId: string): Promise<void>;
}

/**
 * 基于文件系统的对话存储实现
 */
export class FileSystemConversationStorage implements IConversationStorage {
  private baseDir: string;

  constructor(baseDir: string = 'backend/data/conversations') {
    this.baseDir = baseDir;
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // 目录已存在,忽略错误
    }
  }

  /**
   * 获取会话目录路径
   */
  private getSessionDir(sessionId: string): string {
    return path.join(this.baseDir, sessionId);
  }

  /**
   * 获取会话文件路径
   */
  private getSessionFilePath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'session.json');
  }

  /**
   * 获取上下文文件路径
   */
  private getContextFilePath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'context.json');
  }

  /**
   * 获取消息目录路径
   */
  private getMessagesDir(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'messages');
  }

  /**
   * 获取消息文件路径
   */
  private getMessageFilePath(sessionId: string, messageId: string): string {
    return path.join(this.getMessagesDir(sessionId), `${messageId}.json`);
  }

  /**
   * 获取消息索引文件路径
   */
  private getMessageIndexPath(sessionId: string): string {
    return path.join(this.getMessagesDir(sessionId), 'index.json');
  }

  /**
   * 获取分支目录路径
   */
  private getBranchesDir(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'branches');
  }

  /**
   * 获取分支文件路径
   */
  private getBranchFilePath(sessionId: string, branchId: string): string {
    return path.join(this.getBranchesDir(sessionId), `${branchId}.json`);
  }

  /**
   * 获取全局索引文件路径
   */
  private getGlobalIndexPath(): string {
    return path.join(this.baseDir, 'index.json');
  }

  /**
   * 保存会话
   */
  async saveSession(session: ConversationSession): Promise<void> {
    const sessionDir = this.getSessionDir(session.id);
    await this.ensureDir(sessionDir);

    const sessionFilePath = this.getSessionFilePath(session.id);
    const sessionData = JSON.stringify(session, null, 2);
    await fs.writeFile(sessionFilePath, sessionData, 'utf-8');

    // 更新全局索引
    await this.updateGlobalIndex(session.id);
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<ConversationSession | null> {
    try {
      const sessionFilePath = this.getSessionFilePath(sessionId);
      const sessionData = await fs.readFile(sessionFilePath, 'utf-8');
      const session = JSON.parse(sessionData);

      // 转换日期字符串为 Date 对象
      session.createdAt = new Date(session.createdAt);
      session.updatedAt = new Date(session.updatedAt);
      if (session.completedAt) {
        session.completedAt = new Date(session.completedAt);
      }

      return session;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 获取所有会话列表
   */
  async listSessions(): Promise<ConversationSession[]> {
    try {
      const indexPath = this.getGlobalIndexPath();
      const indexData = await fs.readFile(indexPath, 'utf-8');
      const sessionIds: string[] = JSON.parse(indexData);

      const sessions: ConversationSession[] = [];
      for (const sessionId of sessionIds) {
        const session = await this.loadSession(sessionId);
        if (session) {
          sessions.push(session);
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

  /**
   * 更新全局索引
   */
  private async updateGlobalIndex(sessionId: string): Promise<void> {
    await this.ensureDir(this.baseDir);
    const indexPath = this.getGlobalIndexPath();

    let sessionIds: string[] = [];
    try {
      const indexData = await fs.readFile(indexPath, 'utf-8');
      sessionIds = JSON.parse(indexData);
    } catch (error) {
      // 索引文件不存在,使用空数组
    }

    if (!sessionIds.includes(sessionId)) {
      sessionIds.push(sessionId);
      await fs.writeFile(indexPath, JSON.stringify(sessionIds, null, 2), 'utf-8');
    }
  }

  /**
   * 保存消息
   */
  async saveMessage(message: ConversationMessage): Promise<void> {
    const messagesDir = this.getMessagesDir(message.sessionId);
    await this.ensureDir(messagesDir);

    const messageFilePath = this.getMessageFilePath(message.sessionId, message.id);
    const messageData = JSON.stringify(message, null, 2);
    await fs.writeFile(messageFilePath, messageData, 'utf-8');

    // 更新消息索引
    await this.updateMessageIndex(message.sessionId, message.id, message.branchId);
  }

  /**
   * 更新消息索引
   */
  private async updateMessageIndex(
    sessionId: string,
    messageId: string,
    branchId: string
  ): Promise<void> {
    const indexPath = this.getMessageIndexPath(sessionId);

    let index: Record<string, string[]> = {};
    try {
      const indexData = await fs.readFile(indexPath, 'utf-8');
      index = JSON.parse(indexData);
    } catch (error) {
      // 索引文件不存在,使用空对象
    }

    if (!index[branchId]) {
      index[branchId] = [];
    }

    if (!index[branchId].includes(messageId)) {
      index[branchId].push(messageId);
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    }
  }

  /**
   * 加载消息历史
   */
  async loadMessages(
    sessionId: string,
    branchId?: string
  ): Promise<ConversationMessage[]> {
    try {
      const indexPath = this.getMessageIndexPath(sessionId);
      const indexData = await fs.readFile(indexPath, 'utf-8');
      const index: Record<string, string[]> = JSON.parse(indexData);

      let messageIds: string[] = [];
      if (branchId) {
        messageIds = index[branchId] || [];
      } else {
        // 如果没有指定分支,返回所有消息
        messageIds = Object.values(index).flat();
      }

      const messages: ConversationMessage[] = [];
      for (const messageId of messageIds) {
        const message = await this.loadMessage(sessionId, messageId);
        if (message) {
          messages.push(message);
        }
      }

      // 按时间戳排序
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return messages;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * 加载单条消息
   */
  async loadMessage(
    sessionId: string,
    messageId: string
  ): Promise<ConversationMessage | null> {
    try {
      const messageFilePath = this.getMessageFilePath(sessionId, messageId);
      const messageData = await fs.readFile(messageFilePath, 'utf-8');
      const message = JSON.parse(messageData);

      // 转换日期字符串为 Date 对象
      message.timestamp = new Date(message.timestamp);
      if (message.metadata?.toolCalls) {
        message.metadata.toolCalls = message.metadata.toolCalls.map((tc: any) => ({
          ...tc,
          timestamp: new Date(tc.timestamp),
        }));
      }

      return message;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 保存上下文
   */
  async saveContext(
    sessionId: string,
    context: ConversationContext
  ): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId);
    await this.ensureDir(sessionDir);

    const contextFilePath = this.getContextFilePath(sessionId);
    const contextData = JSON.stringify(context, null, 2);
    await fs.writeFile(contextFilePath, contextData, 'utf-8');
  }

  /**
   * 加载上下文
   */
  async loadContext(sessionId: string): Promise<ConversationContext | null> {
    try {
      const contextFilePath = this.getContextFilePath(sessionId);
      const contextData = await fs.readFile(contextFilePath, 'utf-8');
      const context = JSON.parse(contextData);

      // 转换日期字符串为 Date 对象
      context.branches = context.branches.map((branch: any) => ({
        ...branch,
        createdAt: new Date(branch.createdAt),
      }));

      return context;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 保存分支
   */
  async saveBranch(sessionId: string, branch: ConversationBranch): Promise<void> {
    const branchesDir = this.getBranchesDir(sessionId);
    await this.ensureDir(branchesDir);

    const branchFilePath = this.getBranchFilePath(sessionId, branch.id);
    const branchData = JSON.stringify(branch, null, 2);
    await fs.writeFile(branchFilePath, branchData, 'utf-8');
  }

  /**
   * 加载分支
   */
  async loadBranch(
    sessionId: string,
    branchId: string
  ): Promise<ConversationBranch | null> {
    try {
      const branchFilePath = this.getBranchFilePath(sessionId, branchId);
      const branchData = await fs.readFile(branchFilePath, 'utf-8');
      const branch = JSON.parse(branchData);

      // 转换日期字符串为 Date 对象
      branch.createdAt = new Date(branch.createdAt);

      return branch;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId);

    try {
      await fs.rm(sessionDir, { recursive: true, force: true });

      // 从全局索引中移除
      const indexPath = this.getGlobalIndexPath();
      try {
        const indexData = await fs.readFile(indexPath, 'utf-8');
        let sessionIds: string[] = JSON.parse(indexData);
        sessionIds = sessionIds.filter(id => id !== sessionId);
        await fs.writeFile(indexPath, JSON.stringify(sessionIds, null, 2), 'utf-8');
      } catch (error) {
        // 索引文件不存在,忽略
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
