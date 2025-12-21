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
} from '../types';
import { IConversationStorage } from '../storage/ConversationStorageAdapter';
import { ModeValidator } from './ModeValidator';
import { GitService } from './GitService';
import { GitLabMCPService } from './GitLabMCPService';
import { WorktreeManager } from './WorktreeManager';

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
  private worktreeManager?: WorktreeManager;
  public projectService: ProjectService;

  constructor(
    storage: IConversationStorage,
    projectService: ProjectService,
    gitService?: GitService,
    gitlabService?: GitLabMCPService,
    worktreeManager?: WorktreeManager
  ) {
    this.storage = storage;
    this.projectService = projectService;
    this.modeValidator = new ModeValidator();
    this.gitService = gitService;
    this.gitlabService = gitlabService;
    this.worktreeManager = worktreeManager;
  }

  /**
   * 获取当前项目ID
   */
  private getCurrentProjectId(): string {
    return (this as any).currentProjectId;
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
    userId?: string
  ): Promise<ConversationSession> {
    const sessionId = uuidv4();
    const mainBranchId = uuidv4(); // 使用 UUID 作为分支 ID
    const now = new Date();
    
    // 临时存储当前项目ID供handleEditModeSetup使用
    (this as any).currentProjectId = projectInfo.projectId;

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
      mode, // 保存模式
    };

    // 根据模式处理 Git 操作
    if (mode === ConversationMode.EDIT) {
      if (!this.worktreeManager) {
        throw new Error('编辑模式需要 Worktree 管理器，但服务未初始化');
      }
      
      if (!userId) {
        throw new Error('编辑模式需要用户 ID');
      }
      
      // 编辑模式：在用户 worktree 中创建对话分支
      const gitResult = await this.handleEditModeSetup(sessionId, initialPrompt, userId);
      if (!gitResult.success) {
        throw new Error(`Git 操作失败: ${gitResult.error}`);
      }
      
      context.gitBranch = gitResult.branchName;
      // 保存 worktree 路径到上下文
      if (gitResult.worktreePath) {
        projectInfo.workDir = gitResult.worktreePath;
      }
      // mrUrl 初始为空，待用户手动创建
      console.log(`[ConversationManager] ✅ Git 分支已创建: ${gitResult.branchName}`);
      console.log(`[ConversationManager] context.gitBranch 设置为: ${context.gitBranch}`);
      console.log(`[ConversationManager] context.mode 设置为: ${context.mode}`);
    } else if (mode === ConversationMode.READONLY) {
      if (!this.worktreeManager) {
        throw new Error('只读模式需要 Worktree 管理器，但服务未初始化');
      }
      
      if (!userId) {
        throw new Error('只读模式需要用户 ID');
      }
      
      // 只读模式：切换用户 worktree 到主分支
      const gitResult = await this.handleReadonlyModeSetup(userId);
      if (!gitResult.success) {
        throw new Error(`Git 操作失败: ${gitResult.error}`);
      }
      
      // 保存 worktree 路径到上下文
      if (gitResult.worktreePath) {
        projectInfo.workDir = gitResult.worktreePath;
      }
      
      console.log(`[ConversationManager] ✅ 已切换到主分支`);
    }

    // 创建会话
    const session: ConversationSession = {
      id: sessionId,
      taskId,
      userId,
      status: ConversationStatus.PLANNING,
      context,
      createdAt: now,
      updatedAt: now,
    };

    // 保存会话（会自动保存上下文和分支）
    await this.storage.saveSession(session);

    return session;
  }

    

      /**

       * 处理编辑模式的 Git 设置（使用 WorktreeManager）

       */

      private async handleEditModeSetup(

        sessionId: string,

        taskDescription: string,

        userId: string

      ): Promise<{ success: boolean; branchName?: string; worktreePath?: string; error?: string }> {

        if (!this.worktreeManager) {

          return { success: false, error: 'Worktree 管理器未初始化' };

        }

    

        try {

    

              console.log(`[ConversationManager] 为用户 ${userId} 创建对话分支`);

    

        

    

              // 获取项目信息

    

        

    

                    const projectResult = await this.projectService.getProject(this.getCurrentProjectId(), userId);

    

        

    

                    if (!projectResult.success || !projectResult.project) {

    

        

    

                      return { success: false, error: '获取项目信息失败' };

    

        

    

                    }

    

        

    

              

    

        

    

                    // 创建针对该项目的 WorktreeManager

    

        

    

              

    

        

    

                          const projectWorktreeManager = new WorktreeManager(

    

        

    

              

    

        

    

                            (this.projectService as any).executor,

    

        

    

              

    

        

    

                            projectResult.project.workDirectory || projectResult.project.repoDir,

    

        

    

              

    

        

    

                            `${projectResult.project.workDirectory}/../worktrees`

    

        

    

              

    

        

    

                          );

    

        

    

              

    

        

    

                    

    

        

    

              

    

        

    

                          // 先确保用户的 worktree 存在

    

        

    

              

    

        

    

                    

    

        

    

              

    

        

    

                                    const currentProjectId = this.getCurrentProjectId();

    

        

    

              

    

        

    

                    

    

        

    

              

    

        

    

                                    console.log(`[ConversationManager] 创建 worktree - userId: ${userId}, projectId: ${currentProjectId}`);

    

        

    

              

    

        

    

                    

    

        

    

              

    

        

    

                                    const worktreeInfo = await projectWorktreeManager.getOrCreateWorktree(

    

        

    

              

    

        

    

                    

    

        

    

              

    

        

    

                                      userId,

    

        

    

              

    

        

    

                    

    

        

    

              

    

        

    

                                      currentProjectId,

    

        

    

              

    

        

    

                    

    

        

    

              

    

        

    

                                      process.env.GIT_DEFAULT_BRANCH || 'master'

    

        

    

              

    

        

    

                    

    

        

    

              

    

        

    

                                    );

    

        

    

              

    

        

    

                    

    

        

    

              

    

        

    

                                    console.log(`[ConversationManager] worktree 路径: ${worktreeInfo.worktreePath}`);

    

        

    

              

    

        

    

                    

    

        

    

              

    

        

    

                          console.log(`[ConversationManager] ✅ Worktree 已创建: ${worktreeInfo.worktreePath}`);

    

        

    

              

    

        

    

                    

    

        

    

              

    

        

    

                          // 在用户的 worktree 中创建对话分支

    

        

    

              

    

        

    

                          const result = await projectWorktreeManager.createConversationBranch(

    

        

    

              

    

        

    

                            userId,

    

        

    

              

    

        

    

                            sessionId,

    

        

    

              

    

        

    

                            process.env.GIT_DEFAULT_BRANCH || 'master',

    

        

    

              

    

        

    

                            this.getCurrentProjectId()

    

        

    

              

    

        

    

                          );

    

          console.log(`[ConversationManager] ✅ Git 分支已创建: ${result.branchName}`);

          console.log(`[ConversationManager] ✅ Worktree 路径: ${result.worktreePath}`);

          console.log(`[ConversationManager] ℹ️  MR 将由用户手动创建`);

    

          return {

            success: true,

            branchName: result.branchName,

            worktreePath: result.worktreePath,

          };

        } catch (error) {

          return {

            success: false,

            error: error instanceof Error ? error.message : String(error),

          };

        }

      }

    

      /**

       * 处理只读模式的 Git 设置（使用 WorktreeManager）

       */

      private async handleReadonlyModeSetup(userId: string): Promise<{ success: boolean; worktreePath?: string; error?: string }> {

        if (!this.worktreeManager) {

          return { success: false, error: 'Worktree 管理器未初始化' };

        }

    

        try {

          console.log(`[ConversationManager] 只读模式：切换用户 ${userId} worktree 到主分支`);

    

          // 获取或创建用户 worktree

          const worktreeInfo = await this.worktreeManager.getOrCreateWorktree(

            userId,

            process.env.GIT_DEFAULT_BRANCH || 'master'

          );

    

          // 切换到主分支

          await this.worktreeManager.switchToMainBranch(userId);

    

          console.log(`[ConversationManager] ✅ Worktree 路径: ${worktreeInfo.worktreePath}`);

    

          return { 

            success: true,

            worktreePath: worktreeInfo.worktreePath

          };

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
    const session = await this.storage.loadSession(sessionId);
    console.log(`[ConversationManager] getSession - sessionId: ${sessionId}`);
    console.log(`[ConversationManager] 返回的session.context.projectInfo.workDir: ${session?.context?.projectInfo?.workDir}`);
    return session;
  }

  /**
   * 获取所有会话列表
   */
  async listSessions(): Promise<ConversationSession[]> {
    return await this.storage.listSessions();
  }

  /**
   * 验证操作是否允许
   */
  async validateOperation(
    sessionId: string,
    operation: OperationType
  ): Promise<ValidationResult> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return {
        allowed: false,
        reason: `会话不存在: ${sessionId}`,
      };
    }

    return this.modeValidator.validateOperation(session.context.mode, operation);
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
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.acquireLock(sessionId);

    try {
      await this.storage.deleteSession(sessionId);
    } finally {
      this.releaseLock(sessionId);
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

  /**
   * 为会话创建 Merge Request
   * 编辑模式下，由用户手动触发
   */
  async createMergeRequest(sessionId: string): Promise<{ success: boolean; mrUrl?: string; error?: string }> {
    if (!this.gitlabService) {
      return { success: false, error: 'GitLab 服务未初始化' };
    }

    const session = await this.getSession(sessionId);
    if (!session) {
      return { success: false, error: '会话不存在' };
    }

    // 验证是编辑模式
    if (session.context.mode !== ConversationMode.EDIT) {
      return { success: false, error: '只有编辑模式才能创建 MR' };
    }

    // 验证是否有分支
    if (!session.context.gitBranch) {
      return { success: false, error: '会话没有关联的 Git 分支' };
    }

    // 检查 context 中是否已经保存了 MR URL
    if (session.context.mrUrl) {
      console.log(`[ConversationManager] ✅ MR 已存在（从 context）: ${session.context.mrUrl}`);
      return { success: true, mrUrl: session.context.mrUrl };
    }

    try {
      console.log(`[ConversationManager] 为会话 ${sessionId} 创建 MR`);
      const targetBranch = process.env.GIT_DEFAULT_BRANCH || 'main';
      
      // 先检查 GitLab 上是否已存在 MR
      console.log(`[ConversationManager] 检查是否已存在 MR: ${session.context.gitBranch} -> ${targetBranch}`);
      const existingMR = await this.gitlabService.findExistingMR(
        session.context.gitBranch,
        targetBranch
      );

      let mrUrl: string;
      if (existingMR) {
        console.log(`[ConversationManager] ✅ MR 已存在（从 GitLab）: ${existingMR.webUrl}`);
        mrUrl = existingMR.webUrl;
      } else {
        // 创建新的 MR
        console.log(`[ConversationManager] 创建新 MR`);
        const mrResult = await this.gitlabService.createMRForTask(
          sessionId,
          session.context.taskDescription,
          session.context.gitBranch,
          targetBranch
        );
        mrUrl = mrResult.webUrl;
        console.log(`[ConversationManager] ✅ MR 已创建: ${mrUrl}`);
      }

      // 更新 context 中的 MR URL
      session.context.mrUrl = mrUrl;
      await this.storage.saveContext(sessionId, session.context);

      return {
        success: true,
        mrUrl,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
