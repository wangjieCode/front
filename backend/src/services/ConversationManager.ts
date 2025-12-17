import { v4 as uuidv4 } from 'uuid';
import {
  ConversationSession,
  ConversationMessage,
  ConversationContext,
  ConversationBranch,
  ConversationStatus,
  MessageRole,
  MessageMetadata,
  ProjectInfo,
  ConversationMode,
  OperationType,
  ValidationResult,
  ICommandExecutor,
} from '../types';
import { IConversationStorage } from '../storage/ConversationStorageAdapter';
import { ModeValidator } from './ModeValidator';
import { GitService } from './GitService';
import { GitLabMCPService } from './GitLabMCPService';
import { GitWorktreeService } from './GitWorktreeService';
import { ProjectService } from './ProjectService';
import { DatabaseManager } from '../db/DatabaseManager';
import { conversations } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * 对话管理器类
 * 负责对话会话的生命周期管理、消息管理和状态控制
 */
export class ConversationManager {
  private storage: IConversationStorage;
  private locks: Map<string, boolean> = new Map();
  private modeValidator: ModeValidator;
  private gitService?: GitService;
  private gitlabService?: GitLabMCPService;
  private worktreeService: GitWorktreeService;
  private projectService: ProjectService;
  private executor: ICommandExecutor;

  constructor(
    storage: IConversationStorage,
    executor: ICommandExecutor,
    gitService?: GitService,
    gitlabService?: GitLabMCPService
  ) {
    this.storage = storage;
    this.executor = executor;
    this.modeValidator = new ModeValidator();
    this.gitService = gitService;
    this.gitlabService = gitlabService;
    this.worktreeService = new GitWorktreeService(executor);
    this.projectService = new ProjectService();
  }

  /**
   * 获取锁
   */
  private async acquireLock(sessionId: string): Promise<void> {
    while (this.locks.get(sessionId)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.locks.set(sessionId, true);
  }

  /**
   * 释放锁
   */
  private releaseLock(sessionId: string): void {
    this.locks.delete(sessionId);
  }

  /**
   * 创建新的对话会话
   */
  async createSession(
    taskId: string,
    initialPrompt: string,
    projectInfo: ProjectInfo,
    mode: ConversationMode = ConversationMode.EDIT,
    userId?: string,
    projectId?: string
  ): Promise<ConversationSession> {
    const sessionId = uuidv4();
    const mainBranchId = uuidv4();
    const now = new Date();

    // 如果提供了 userId 和 projectId，获取项目信息并设置 Worktree
    let worktreePath: string | undefined;
    let username: string | undefined;
    if (userId && projectId) {
      try {
        const db = DatabaseManager.getInstance().getDb();
        const users = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.id, userId),
        });
        username = users?.username;

        const project = await this.projectService.getProjectById(projectId);
        if (!project) {
          throw new Error(`项目不存在: ${projectId}`);
        }

        if (username) {
          worktreePath = GitWorktreeService.generateWorktreePath(
            project.worktreeBaseDir,
            username
          );

          const worktreeExists = await this.worktreeService.worktreeExists(worktreePath);

          if (!worktreeExists) {
            console.log(`[ConversationManager] 为用户 ${username} 创建 Worktree: ${worktreePath}`);
            
            const initialBranch = `${username}-worktree`;
            const worktreeResult = await this.worktreeService.createWorktree(
              project.repoDir,
              worktreePath,
              initialBranch,
              project.gitDefaultBranch
            );

            if (!worktreeResult.success) {
              console.error(`[ConversationManager] Worktree 创建失败: ${worktreeResult.message}`);
              throw new Error(`Worktree 创建失败: ${worktreeResult.message}`);
            }

            console.log(`[ConversationManager] ✅ Worktree 已创建: ${worktreePath}`);
          } else {
            console.log(`[ConversationManager] ✅ 使用已存在的 Worktree: ${worktreePath}`);
          }

          projectInfo.workDir = worktreePath;
        }
      } catch (error) {
        console.error('[ConversationManager] 设置 Worktree 失败:', error);
        throw error;
      }
    }

    // 创建主分支
    const mainBranch: ConversationBranch = {
      id: mainBranchId,
      name: '主分支',
      parentMessageId: '',
      messageIds: [],
      createdAt: now,
      isActive: true,
    };

    // 初始化上下文
    const context: ConversationContext = {
      projectInfo,
      taskDescription: initialPrompt,
      messageHistory: [],
      currentBranchId: mainBranchId,
      branches: [mainBranch],
      variables: {},
      mode,
    };

    // 根据模式处理 Git 操作
    if (mode === ConversationMode.EDIT) {
      if (!this.gitService) {
        throw new Error('编辑模式需要 Git 服务，但服务未初始化');
      }
      
      const gitResult = await this.handleEditModeSetup(sessionId, initialPrompt, username);
      if (!gitResult.success) {
        throw new Error(`Git 操作失败: ${gitResult.error}`);
      }
      
      context.gitBranch = gitResult.branchName;
      console.log(`[ConversationManager] ✅ 对话分支已创建: ${gitResult.branchName}`);
    } else if (mode === ConversationMode.READONLY) {
      if (!this.gitService) {
        throw new Error('只读模式需要 Git 服务，但服务未初始化');
      }
      
      const project = userId && projectId ? await this.projectService.getProjectById(projectId) : null;
      const defaultBranch = project?.gitDefaultBranch || process.env.GIT_DEFAULT_BRANCH || 'main';
      
      const gitResult = await this.handleReadonlyModeSetup(defaultBranch);
      if (!gitResult.success) {
        throw new Error(`Git 操作失败: ${gitResult.error}`);
      }
      
      console.log(`[ConversationManager] ✅ 已切换到主分支: ${defaultBranch}`);
    }

    // 创建会话
    const session: ConversationSession = {
      id: sessionId,
      taskId,
      status: ConversationStatus.PLANNING,
      context,
      createdAt: now,
      updatedAt: now,
    };

    // 保存会话和上下文
    await this.storage.saveSession(session);
    await this.storage.saveContext(sessionId, context);
    await this.storage.saveBranch(sessionId, mainBranch);

    // 如果有 userId、projectId 和 worktreePath，更新数据库记录
    if (userId && projectId) {
      try {
        const db = DatabaseManager.getInstance().getDb();
        await db.update(conversations)
          .set({
            userId,
            projectId,
            worktreePath,
          })
          .where(eq(conversations.sessionId, sessionId));
      } catch (error) {
        console.error('[ConversationManager] 更新对话记录失败:', error);
      }
    }

    return session;
  }

  /**
   * 处理编辑模式的 Git 设置（在 Worktree 中为每个对话创建独立分支）
   */
  private async handleEditModeSetup(
    sessionId: string,
    taskDescription: string,
    username?: string
  ): Promise<{ success: boolean; branchName?: string; mrUrl?: string; error?: string }> {
    if (!this.gitService) {
      return { success: false, error: 'Git 服务未初始化' };
    }

    try {
      const branchName = GitWorktreeService.generateBranchName(
        username || 'user',
        sessionId
      );
      console.log(`[ConversationManager] 编辑模式：创建对话分支 ${branchName}`);

      const createResult = await this.gitService.createBranch(
        branchName,
        process.env.GIT_DEFAULT_BRANCH || 'main'
      );

      if (!createResult.success) {
        return {
          success: false,
          error: `创建分支失败: ${createResult.error}`,
        };
      }

      console.log(`[ConversationManager] ✅ 对话分支已创建: ${branchName}`);

      return {
        success: true,
        branchName,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 处理只读模式的 Git 设置（切换到主分支）
   */
  private async handleReadonlyModeSetup(defaultBranch?: string): Promise<{ success: boolean; error?: string }> {
    if (!this.gitService) {
      return { success: false, error: 'Git 服务未初始化' };
    }

    try {
      const targetBranch = defaultBranch || process.env.GIT_DEFAULT_BRANCH || 'main';
      console.log(`[ConversationManager] 只读模式：切换到主分支 ${targetBranch}`);

      const checkoutResult = await this.gitService.checkoutBranch(targetBranch);

      if (!checkoutResult.success) {
        return {
          success: false,
          error: `切换分支失败: ${checkoutResult.error}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取对话会话
   */
  async getSession(sessionId: string): Promise<ConversationSession | null> {
    return await this.storage.loadSession(sessionId);
  }

  /**
   * 获取所有会话列表
   */
  async listSessions(): Promise<ConversationSession[]> {
    return await this.storage.listSessions();
  }

  /**
   * 添加消息到对话
   */
  async addMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    metadata?: MessageMetadata
  ): Promise<ConversationMessage> {
    await this.acquireLock(sessionId);

    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`会话不存在: ${sessionId}`);
      }

      const context = session.context;
      const messageId = uuidv4();
      const now = new Date();

      // 创建消息
      const message: ConversationMessage = {
        id: messageId,
        sessionId,
        branchId: context.currentBranchId,
        role,
        content,
        metadata,
        timestamp: now,
      };

      // 保存消息
      await this.storage.saveMessage(message);

      // 更新上下文
      context.messageHistory.push(messageId);

      // 更新分支的消息列表
      const branch = context.branches.find(b => b.id === context.currentBranchId);
      if (branch) {
        branch.messageIds.push(messageId);
        await this.storage.saveBranch(sessionId, branch);
      }

      // 保存上下文
      await this.storage.saveContext(sessionId, context);

      // 更新会话的 updatedAt
      session.updatedAt = now;
      await this.storage.saveSession(session);

      return message;
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * 获取对话历史
   */
  async getMessageHistory(
    sessionId: string,
    branchId?: string
  ): Promise<ConversationMessage[]> {
    return await this.storage.loadMessages(sessionId, branchId);
  }

  /**
   * 获取单条消息
   */
  async getMessage(
    sessionId: string,
    messageId: string
  ): Promise<ConversationMessage | null> {
    return await this.storage.loadMessage(sessionId, messageId);
  }

  /**
   * 验证状态转换是否合法
   */
  private isValidStatusTransition(
    currentStatus: ConversationStatus,
    newStatus: ConversationStatus
  ): boolean {
    const validTransitions: Record<ConversationStatus, ConversationStatus[]> = {
      [ConversationStatus.PLANNING]: [
        ConversationStatus.EXECUTING,
        ConversationStatus.PAUSED,
        ConversationStatus.FAILED,
      ],
      [ConversationStatus.EXECUTING]: [
        ConversationStatus.PAUSED,
        ConversationStatus.COMPLETED,
        ConversationStatus.FAILED,
      ],
      [ConversationStatus.PAUSED]: [
        ConversationStatus.EXECUTING,
        ConversationStatus.FAILED,
      ],
      [ConversationStatus.COMPLETED]: [],
      [ConversationStatus.FAILED]: [],
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  /**
   * 更新会话状态
   */
  async updateSessionStatus(
    sessionId: string,
    newStatus: ConversationStatus,
    error?: string
  ): Promise<void> {
    await this.acquireLock(sessionId);

    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`会话不存在: ${sessionId}`);
      }

      // 验证状态转换
      if (!this.isValidStatusTransition(session.status, newStatus)) {
        throw new Error(
          `非法的状态转换: ${session.status} -> ${newStatus}`
        );
      }

      // 更新状态
      session.status = newStatus;
      session.updatedAt = new Date();

      // 如果是终态,设置完成时间
      if (
        newStatus === ConversationStatus.COMPLETED ||
        newStatus === ConversationStatus.FAILED
      ) {
        session.completedAt = new Date();
      }

      // 如果是失败状态,记录错误信息
      if (newStatus === ConversationStatus.FAILED && error) {
        session.error = error;
      }

      await this.storage.saveSession(session);
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * 保存会话上下文
   */
  async saveContext(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    await this.storage.saveContext(sessionId, session.context);
  }

  /**
   * 恢复会话上下文
   */
  async restoreContext(sessionId: string): Promise<ConversationContext> {
    const context = await this.storage.loadContext(sessionId);
    if (!context) {
      throw new Error(`会话上下文不存在: ${sessionId}`);
    }

    return context;
  }

  /**
   * 更新上下文变量
   */
  async updateContextVariable(
    sessionId: string,
    key: string,
    value: any
  ): Promise<void> {
    await this.acquireLock(sessionId);

    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`会话不存在: ${sessionId}`);
      }

      session.context.variables[key] = value;
      await this.storage.saveContext(sessionId, session.context);

      session.updatedAt = new Date();
      await this.storage.saveSession(session);
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * 创建对话分支
   */
  async createBranch(
    sessionId: string,
    fromMessageId: string,
    branchName: string
  ): Promise<ConversationBranch> {
    await this.acquireLock(sessionId);

    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`会话不存在: ${sessionId}`);
      }

      // 验证消息存在
      const message = await this.getMessage(sessionId, fromMessageId);
      if (!message) {
        throw new Error(`消息不存在: ${fromMessageId}`);
      }

      const branchId = uuidv4();
      const now = new Date();

      // 获取从根到分支点的所有消息
      const parentBranch = session.context.branches.find(
        b => b.id === message.branchId
      );
      if (!parentBranch) {
        throw new Error(`父分支不存在: ${message.branchId}`);
      }

      // 找到分支点之前的所有消息
      const messageIndex = parentBranch.messageIds.indexOf(fromMessageId);
      const messageIds = parentBranch.messageIds.slice(0, messageIndex + 1);

      // 创建新分支
      const newBranch: ConversationBranch = {
        id: branchId,
        name: branchName,
        parentMessageId: fromMessageId,
        messageIds: [...messageIds],
        createdAt: now,
        isActive: false,
      };

      // 添加到上下文
      session.context.branches.push(newBranch);

      // 保存分支和上下文
      await this.storage.saveBranch(sessionId, newBranch);
      await this.storage.saveContext(sessionId, session.context);

      session.updatedAt = now;
      await this.storage.saveSession(session);

      return newBranch;
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * 切换对话分支
   */
  async switchBranch(sessionId: string, branchId: string): Promise<void> {
    await this.acquireLock(sessionId);

    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`会话不存在: ${sessionId}`);
      }

      const branch = session.context.branches.find(b => b.id === branchId);
      if (!branch) {
        throw new Error(`分支不存在: ${branchId}`);
      }

      // 将所有分支设置为非活跃
      session.context.branches.forEach(b => {
        b.isActive = false;
      });

      // 激活目标分支
      branch.isActive = true;
      session.context.currentBranchId = branchId;

      // 更新消息历史为该分支的消息
      session.context.messageHistory = [...branch.messageIds];

      // 保存上下文
      await this.storage.saveContext(sessionId, session.context);

      session.updatedAt = new Date();
      await this.storage.saveSession(session);
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * 获取所有分支
   */
  async getBranches(sessionId: string): Promise<ConversationBranch[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    return session.context.branches;
  }

  /**
   * 获取当前活跃分支
   */
  async getActiveBranch(sessionId: string): Promise<ConversationBranch | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    return session.context.branches.find(b => b.isActive) || null;
  }

  /**
   * 获取分支的消息历史
   */
  async getBranchMessages(
    sessionId: string,
    branchId: string
  ): Promise<ConversationMessage[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    const branch = session.context.branches.find(b => b.id === branchId);
    if (!branch) {
      throw new Error(`分支不存在: ${branchId}`);
    }

    const messages: ConversationMessage[] = [];
    for (const messageId of branch.messageIds) {
      const message = await this.getMessage(sessionId, messageId);
      if (message) {
        messages.push(message);
      }
    }

    return messages;
  }

  /**
   * 删除会话
   * 注意：不删除 Worktree（因为是用户共享的），只删除对话分支
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.acquireLock(sessionId);

    try {
      const session = await this.getSession(sessionId);
      if (session && session.context.gitBranch) {
        try {
          if (this.gitService) {
            console.log(`[ConversationManager] 删除对话分支: ${session.context.gitBranch}`);
          }
        } catch (error) {
          console.error('[ConversationManager] 删除分支时出错:', error);
        }
      }

      await this.storage.deleteSession(sessionId);
      console.log(`[ConversationManager] ✅ 会话已删除: ${sessionId}`);
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * 清理用户的 Worktree
   * 用于删除用户或清理不活跃用户时调用
   * @param userId 用户 ID
   * @param projectId 项目 ID
   */
  async cleanupUserWorktree(userId: string, projectId: string): Promise<boolean> {
    try {
      const db = DatabaseManager.getInstance().getDb();
      
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, userId),
      });
      
      if (!user) {
        console.error(`[ConversationManager] 用户不存在: ${userId}`);
        return false;
      }

      const project = await this.projectService.getProjectById(projectId);
      if (!project) {
        console.error(`[ConversationManager] 项目不存在: ${projectId}`);
        return false;
      }

      const worktreePath = GitWorktreeService.generateWorktreePath(
        project.worktreeBaseDir,
        user.username
      );

      const exists = await this.worktreeService.worktreeExists(worktreePath);
      if (!exists) {
        console.log(`[ConversationManager] Worktree 不存在: ${worktreePath}`);
        return true;
      }

      console.log(`[ConversationManager] 清理用户 Worktree: ${worktreePath}`);
      const removeResult = await this.worktreeService.removeWorktree(
        project.repoDir,
        worktreePath,
        true
      );

      if (removeResult.success) {
        console.log(`[ConversationManager] ✅ 用户 Worktree 已清理`);
        return true;
      } else {
        console.error(`[ConversationManager] Worktree 清理失败: ${removeResult.message}`);
        return false;
      }
    } catch (error) {
      console.error('[ConversationManager] 清理用户 Worktree 时出错:', error);
      return false;
    }
  }

  /**
   * 获取会话统计信息
   */
  async getSessionStats(sessionId: string): Promise<{
    messageCount: number;
    branchCount: number;
    status: ConversationStatus;
  }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    const messages = await this.getMessageHistory(sessionId);

    return {
      messageCount: messages.length,
      branchCount: session.context.branches.length,
      status: session.status,
    };
  }
}
