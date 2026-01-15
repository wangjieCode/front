import { v4 as uuidv4 } from "uuid";
import {
  ConversationSession,
  ConversationMessage,
  ConversationContext,
  ConversationStatus,
  MessageRole,
  MessageMetadata,
  ProjectInfo,
  ConversationMode,
  OperationType,
  ValidationResult,
} from "../types";
import { IConversationStorage } from "../storage/ConversationStorageAdapter";
import { ModeValidator } from "./ModeValidator";
import { GitLabMCPService } from "./GitLabMCPService";
import { WorktreeManager } from "./WorktreeManager";
import { ProjectService } from "./ProjectService";

/**
 * 对话管理器类
 * 负责对话会话的生命周期管理、消息管理和状态控制
 */
export class ConversationManager {
  private storage: IConversationStorage;
  private locks: Map<string, boolean> = new Map();
  private modeValidator: ModeValidator;
  private gitlabService?: GitLabMCPService;
  private worktreeManager?: WorktreeManager;
  public projectService: ProjectService;

  constructor(
    storage: IConversationStorage,
    projectService: ProjectService,
    gitlabService?: GitLabMCPService,
    worktreeManager?: WorktreeManager
  ) {
    this.storage = storage;
    this.projectService = projectService;
    this.modeValidator = new ModeValidator();
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
      await new Promise((resolve) => setTimeout(resolve, 10));
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
    initialPrompt: string,
    projectInfo: ProjectInfo,
    mode: ConversationMode = ConversationMode.EDIT,
    userId: string
  ): Promise<ConversationSession> {
    // 验证 projectId 必须存在
    if (!projectInfo.projectId) {
      throw new Error("项目ID不能为空，必须选择一个项目");
    }

    // 检查 projectInfo 是否已经包含必要信息，如果是则直接使用，避免重复查询数据库
    let completeProjectInfo: ProjectInfo;
    
    if (projectInfo.projectName && projectInfo.gitRepositoryUrl && projectInfo.workDir) {
      completeProjectInfo = {
        ...projectInfo,
        // 确保所有必要字段都有值
        gitBranch: projectInfo.gitBranch || "master",
        relevantFiles: projectInfo.relevantFiles,
        workDir: projectInfo.workDir
      };
    } else {
      // 获取完整的项目信息
      const projectResult = await this.projectService.getProject(
        projectInfo.projectId,
        userId
      );
      if (!projectResult.success || !projectResult.project) {
        throw new Error(
          `获取项目信息失败: ${projectResult.error || "项目不存在"}`
        );
      }

      const project = projectResult.project;

      // 构建完整的 ProjectInfo
      completeProjectInfo = {
        projectId: project.id,
        projectName: project.name,
        gitRepositoryUrl: project.gitRepositoryUrl,
        workDir: project.workDirectory || project.repoDir,
        gitBranch: project.gitBranch || "master",
        relevantFiles: projectInfo.relevantFiles,
      };
    }

    // console.log(`[ConversationManager] 创建会话 - 项目信息:`, {
    //   projectId: completeProjectInfo.projectId,
    //   projectName: completeProjectInfo.projectName,
    //   workDir: completeProjectInfo.workDir
    // });

    const sessionId = uuidv4();
    const now = new Date();

    // 临时存储当前项目ID供handleEditModeSetup使用
    (this as any).currentProjectId = projectInfo.projectId;

    // 初始化上下文
    const context: ConversationContext = {
      projectInfo: completeProjectInfo,
      taskDescription: initialPrompt,
      messageHistory: [],
      variables: {},
      mode,
    };

    // 创建会话
    const session: ConversationSession = {
      id: sessionId,
      userId,
      status: ConversationStatus.PLANNING,
      context,
      createdAt: now,
      updatedAt: now,
    };

    // 根据模式处理 Git 操作（同步执行，确保安全性）
    if (mode === ConversationMode.EDIT) {
      if (!this.worktreeManager) {
        throw new Error('编辑模式需要 Worktree 管理器，但服务未初始化');
      }

      if (!userId) {
        throw new Error('编辑模式需要用户 ID');
      }

      // 编辑模式：在用户 worktree 中创建对话分支
      const gitResult = await this.handleEditModeSetup(sessionId, initialPrompt, userId, completeProjectInfo.gitBranch);
      if (!gitResult.success) {
        throw new Error(`Git 操作失败: ${gitResult.error}`);
      }

      context.gitBranch = gitResult.branchName;
      if (gitResult.worktreePath) {
        // 只更新 workDir，保留其他项目信息
        context.projectInfo = {
          ...context.projectInfo,
          workDir: gitResult.worktreePath
        };
      }

      // console.log(`[ConversationManager] Git 分支已创建: ${gitResult.branchName}`);
    } else if (mode === ConversationMode.READONLY) {
      // 只读模式不需要独立 worktree，直接使用项目主目录
      if (!userId) {
        throw new Error('只读模式需要用户 ID');
      }

      console.log(`[ConversationManager] 只读模式：直接使用项目主目录 ${completeProjectInfo.workDir}`);
      context.gitBranch = completeProjectInfo.gitBranch || "master";
      
      // 不进行 worktree 操作，使用 completeProjectInfo 中的默认 workDir
    }

    // 更新会话信息
    session.context = context;

    // 保存会话（会自动保存上下文和分支）
    await this.storage.saveSession(session);

    // console.log(`[ConversationManager] 会话已保存 - 最终项目信息:`, {
    //   projectId: session.context.projectInfo.projectId,
    //   projectName: session.context.projectInfo.projectName,
    //   workDir: session.context.projectInfo.workDir
    // });

    return session;
  }

  /**
   * 处理编辑模式的 Git 设置（使用 WorktreeManager）
   */
  private async handleEditModeSetup(
    sessionId: string,
    _taskDescription: string,
    userId: string,
    defaultBranch: string = "master"
  ): Promise<{
    success: boolean;
    branchName?: string;
    worktreePath?: string;
    error?: string;
  }> {
    if (!this.worktreeManager) {
      return { success: false, error: "Worktree 管理器未初始化" };
    }

    try {
      // 获取项目信息
      const projectResult = await this.projectService.getProject(
        this.getCurrentProjectId(),
        userId
      );

      if (!projectResult.success || !projectResult.project) {
        return { success: false, error: "获取项目信息失败" };
      }

      // 创建项目 WorktreeManager 并创建对话分支
      const projectWorktreeManager = new WorktreeManager(
        (this.projectService as any).executor,
        projectResult.project.workDirectory || projectResult.project.repoDir,
        `${projectResult.project.workDirectory}/../worktrees`
      );

      // 先尝试同步最新代码
      console.log(`[ConversationManager] 同步主仓库最新代码...`);
      const syncResult = await projectWorktreeManager.syncWithMainRepo(userId, this.getCurrentProjectId());
      
      if (syncResult.success && syncResult.updated) {
        console.log(`[ConversationManager] ✅ 代码已同步到最新版本`);
      } else if (!syncResult.success && syncResult.conflicts) {
        console.warn(`[ConversationManager] ⚠️ 代码同步失败，存在冲突: ${syncResult.conflicts.join(', ')}`);
        // 可以选择强制重置或提示用户
        console.log(`[ConversationManager] 尝试强制重置到最新状态...`);
        const resetResult = await projectWorktreeManager.resetToMainBranch(userId, this.getCurrentProjectId());
        if (resetResult.success) {
          console.log(`[ConversationManager] ✅ 已强制重置到最新状态`);
        } else {
          console.warn(`[ConversationManager] ⚠️ 强制重置也失败: ${resetResult.error}`);
        }
      }

      const result = await projectWorktreeManager.createConversationBranch(
        userId,
        sessionId,
        projectResult.project.gitBranch || defaultBranch,
        this.getCurrentProjectId()
      );

      console.log(`[ConversationManager] 对话分支已创建: ${result.branchName}`);

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
   * 获取对话会话
   */
  async getSession(sessionId: string): Promise<ConversationSession | null> {
    const session = await this.storage.loadSession(sessionId);
    // console.log(`[ConversationManager] getSession - sessionId: ${sessionId}`);
    // console.log(
    //   `[ConversationManager] 返回的session.context.projectInfo.workDir: ${session?.context?.projectInfo?.workDir}`
    // );
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

    return this.modeValidator.validateOperation(
      session.context.mode,
      operation
    );
  }

  /**
   * 添加消息到对话
   */
  async addMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    metadata?: MessageMetadata,
    existingSession?: ConversationSession
  ): Promise<ConversationMessage> {
    await this.acquireLock(sessionId);

    try {
      const session = existingSession || await this.getSession(sessionId);
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
        role,
        content,
        metadata,
        timestamp: now,
      };

      // 更新内存中的数据结构
      context.messageHistory.push(messageId);

      // 更新会话的 updatedAt
      session.updatedAt = now;

      // 批量保存到数据库
      try {
        await Promise.all([
          this.storage.saveMessage(message),
          this.storage.saveSession(session)
        ]);
      } catch (error) {
        console.error(`[ConversationManager] 批量保存消息失败:`, error);
        throw error;
      }

      return message;
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * 获取对话历史
   */
  async getMessageHistory(
    sessionId: string
  ): Promise<ConversationMessage[]> {
    return await this.storage.loadMessages(sessionId);
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
        throw new Error(`非法的状态转换: ${session.status} -> ${newStatus}`);
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
      session.updatedAt = new Date();
      await this.storage.saveSession(session);
    } finally {
      this.releaseLock(sessionId);
    }
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
    status: ConversationStatus;
  }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    const messages = await this.getMessageHistory(sessionId);

    return {
      messageCount: messages.length,
      status: session.status,
    };
  }

  /**
   * 为会话创建 Merge Request
   * 编辑模式下，由用户手动触发
   */
  /**
   * 为会话创建 Merge Request
   * 编辑模式下，由用户手动触发
   */
  async createMergeRequest(
    sessionId: string,
    targetBranch?: string
  ): Promise<{ success: boolean; mrUrl?: string; error?: string }> {
    if (!this.gitlabService) {
      return { success: false, error: "GitLab 服务未初始化" };
    }

    const session = await this.getSession(sessionId);
    if (!session) {
      return { success: false, error: "会话不存在" };
    }

    // 验证是编辑模式
    if (session.context.mode !== ConversationMode.EDIT) {
      return { success: false, error: "只有编辑模式才能创建 MR" };
    }

    // 验证是否有分支
    if (!session.context.gitBranch) {
      return { success: false, error: "会话没有关联的 Git 分支" };
    }

    // 检查 context 中是否已经保存了 MR URL
    if (session.context.mrUrl) {
      console.log(
        `[ConversationManager] ✅ MR 已存在（从 context）: ${session.context.mrUrl}`
      );
      return { success: true, mrUrl: session.context.mrUrl };
    }

    try {
      console.log(`[ConversationManager] 为会话 ${sessionId} 创建 MR`);
      const finalTargetBranch = targetBranch || process.env.GIT_DEFAULT_BRANCH || "main";

      // 获取项目详细信息 (不仅为了 GitLab ID，也为了 Worktree 管理)
      let dbProjectId = session.context.projectInfo.projectId;
      console.log(`[ConversationManager] 获取项目详情: ${dbProjectId}, 用户: ${session.userId}`);
      
      let gitlabProjectId: string | undefined;
      let projectWorktreeManager: WorktreeManager | undefined;
      let project = null;

      // 尝试获取项目信息
      if (dbProjectId) {
         const projectResult = await this.projectService.getProject(dbProjectId, session.userId!);
         if (projectResult.success && projectResult.project) {
           project = projectResult.project;
         }
      } 
      
      // 如果没有 ID 或未找到，尝试从 workDir 路径解析 Project ID (这是唯一保留的重试逻辑)
      // workDir 格式通常为 .../worktrees/project-<UUID>/user-<UUID>
      if (!project && session.context.projectInfo.workDir) {
         const workDir = session.context.projectInfo.workDir;
         const match = workDir.match(/project-([a-f0-9-]{36})/);
         if (match && match[1]) {
            const extractedId = match[1];
            console.log(`[ConversationManager] ⚠️ 从 workDir 路径解析到 Project ID: ${extractedId}`);
            
            const projectResult = await this.projectService.getProject(extractedId, session.userId!);
            if (projectResult.success && projectResult.project) {
                project = projectResult.project;
                dbProjectId = extractedId;
                // 修复 session
                session.context.projectInfo.projectId = extractedId;
                await this.storage.saveContext(sessionId, session.context);
                console.log(`[ConversationManager] ✅ 已通过路径恢复项目关联`);
            }
         }
      }
      
      if (!project) {
         console.warn(`[ConversationManager] ⚠️ 无法找到关联项目。ProjectInfo:`, JSON.stringify(session.context.projectInfo));
      }

      if (project) {
        gitlabProjectId = project.gitlabProjectId || undefined;
        console.log(`[ConversationManager] 关联的 GitLab Project ID: ${gitlabProjectId}`);

        // 初始化特定于项目的 WorktreeManager
        if (this.projectService && (this.projectService as any).executor) {
          const executor = (this.projectService as any).executor;
          const repoDir = project.workDirectory || project.repoDir;
          const worktreeDir = `${repoDir}/../worktrees`;
          
          projectWorktreeManager = new WorktreeManager(executor, repoDir, worktreeDir);
        }
      }

      // 如果无法初始化特定的 WorktreeManager，回退到全局的
      if (!projectWorktreeManager) {
        console.warn(`[ConversationManager] ⚠️ 无法初始化项目特定的 WorktreeManager，回退到全局管理器`);
        projectWorktreeManager = this.worktreeManager;
      }

      // 1. 同步当前实际分支 & 确保 Worktree 存在
      if (projectWorktreeManager && session.userId) {
        try {
          // 使用 getOrCreateWorktree 确保 worktree 存在
          const worktreeInfo = await projectWorktreeManager.getOrCreateWorktree(session.userId, dbProjectId);
          const actualBranch = worktreeInfo.mainBranch;

          if (actualBranch && actualBranch !== session.context.gitBranch) {
            console.log(`[ConversationManager] ⚠️ 检测到分支不一致，更新会话分支: ${session.context.gitBranch} -> ${actualBranch}`);
            session.context.gitBranch = actualBranch;
            await this.storage.saveContext(sessionId, session.context);
          }
        } catch (syncError) {
          // 如果 worktree 不存在，这里会捕获到错误
          console.warn(`[ConversationManager] ⚠️ 无法同步 Worktree 分支信息:`, syncError);
          // 如果是项目特定的 worktree 失败，且 dbProjectId 存在，说明可能路径有问题
          // 但我们不中断，尝试继续
        }
      }

      // 2. 自动解决 "源分支与目标分支相同" 的问题
      if (session.context.gitBranch === finalTargetBranch) {
        if (!projectWorktreeManager) {
           return { success: false, error: "Worktree 管理器未初始化，无法自动创建功能分支" };
        }

        console.log(`[ConversationManager] ⚠️ 源分支与目标分支相同 (${finalTargetBranch})，尝试自动创建功能分支...`);
        
        try {
          const shortSessionId = sessionId.substring(0, 8);
          const timestamp = Date.now();
          const featureBranchName = `auto-feature-${shortSessionId}-${timestamp}`;
          
          // a. 提交当前更改
          await projectWorktreeManager.commitChanges(session.userId!, "Auto-commit before creating MR", dbProjectId);
          
          // b. 从当前位置创建新分支
          await projectWorktreeManager.createBranchFromHead(session.userId!, featureBranchName, dbProjectId);
          
          // c. 推送新分支
          await projectWorktreeManager.pushBranch(session.userId!, featureBranchName, dbProjectId);
          
          // d. 更新上下文
          session.context.gitBranch = featureBranchName;
          await this.storage.saveContext(sessionId, session.context);
          
          console.log(`[ConversationManager] ✅ 已自动切换到新功能分支: ${featureBranchName}`);
          
        } catch (err) {
           console.error(`[ConversationManager] ❌ 自动创建分支失败:`, err);
           return {
            success: false,
            error: `无法创建 MR: 当前处于主分支，且自动创建功能分支失败: ${err instanceof Error ? err.message : String(err)}`
          };
        }
      }
      
      // 3. 提交并推送当前分支 (确保远程有最新代码)
      if (projectWorktreeManager && session.userId) {
        try {
          console.log(`[ConversationManager] 正在提交并推送分支: ${session.context.gitBranch}`);
          
          await projectWorktreeManager.commitChanges(session.userId, "Auto-commit before creating Merge Request", dbProjectId);
          await projectWorktreeManager.pushBranch(session.userId, session.context.gitBranch, dbProjectId);
          
          console.log(`[ConversationManager] ✅ 分支推送成功`);
        } catch (gitError) {
          console.warn(`[ConversationManager] ⚠️ Git 操作 (提交/推送) 失败，尝试继续创建 MR:`, gitError);
        }
      }
      
      // 先检查 GitLab 上是否已存在 MR
      console.log(
        `[ConversationManager] 检查是否已存在 MR: ${session.context.gitBranch} -> ${finalTargetBranch} (Project: ${gitlabProjectId || 'DEFAULT'})`
      );
      const existingMR = await this.gitlabService.findExistingMR(
        session.context.gitBranch,
        finalTargetBranch,
        gitlabProjectId
      );

      let mrUrl: string;
      if (existingMR) {
        console.log(
          `[ConversationManager] ✅ MR 已存在（从 GitLab）: ${existingMR.webUrl}`
        );
        mrUrl = existingMR.webUrl;
      } else {
        // 创建新的 MR
        console.log(`[ConversationManager] 创建新 MR`);
        const mrResult = await this.gitlabService.createMRForTask(
          sessionId,
          session.context.taskDescription,
          session.context.gitBranch,
          finalTargetBranch,
          gitlabProjectId
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
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
