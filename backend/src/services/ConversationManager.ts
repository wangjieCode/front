import {
  ConversationSession,
  ConversationMessage,
  ConversationContext,
  ConversationStatus,
  ConversationVisibility,
  MessageRole,
  MessageMetadata,
  ProjectInfo,
  ConversationMode,
  OperationType,
  ValidationResult,
} from "../types";
import { IConversationStorage } from "../storage/ConversationStorageAdapter";
import type {
  ReviewDiffData,
  ReviewFilesData,
  ReviewSidebarData,
  ReviewUpdatesData,
} from "../storage/ConversationStorageAdapter";
import type { MessageHistoryVersion, SessionAccessInfo } from "../storage/DrizzleConversationStorage";
import { ModeValidator } from "./ModeValidator";
import { GitLabMCPService } from "./GitLabMCPService";
import { WorktreeManager } from "./WorktreeManager";
import { ProjectService } from "./ProjectService";
import { newId } from "../utils/id";
import { getWorktreeBaseDir } from "../utils/config";
import dayjs from "dayjs";
import { DEFAULT_NEOVATE_MODEL, isNeovateModelSupported } from "@front/shared";
import { LruCacheService } from "./LruCacheService";
import { CacheStrategyManager } from "./CacheStrategyManager";

export class ConversationManager {
  private storage: IConversationStorage;
  // B1: Promise 队列锁，替换轮询锁
  private lockQueues = new Map<string, Promise<void>>();
  private inFlightSessionLoads = new Map<string, Promise<ConversationSession | null>>();
  private modeValidator: ModeValidator;
  private gitlabService?: GitLabMCPService;
  private worktreeManager?: WorktreeManager;
  readonly projectService: ProjectService;
  private cache: LruCacheService;
  private cacheStrategyManager: CacheStrategyManager;
  private sessionCacheTtlSeconds = 0;
  private sessionListCacheTtlSeconds = 0;

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
    this.cache = new LruCacheService();
    this.cacheStrategyManager = new CacheStrategyManager(this.cache);
  }

  // ==================== 锁 ====================

  // B1: 无轮询 Promise 队列互斥锁，返回 release 函数
  private acquireLock(sessionId: string): Promise<() => void> {
    let release!: () => void;
    const lockHeld = new Promise<void>(r => { release = r; });
    const prev = this.lockQueues.get(sessionId) ?? Promise.resolve();
    this.lockQueues.set(sessionId, prev.then(() => lockHeld));
    return prev.then(() => release);
  }

  // ==================== 缓存键 ====================

  private getCurrentEnv(): string {
    return process.env.APP_ENV || "local";
  }

  private getSessionCacheKey(sessionId: string): string {
    return `sessions:detail:${sessionId}`;
  }

  private getSessionAccessCacheKey(sessionId: string): string {
    return `sessions:access:${sessionId}`;
  }

  private getSessionListCacheKey(userId?: string): string {
    return `sessions:list:${userId || "public"}:${this.getCurrentEnv()}`;
  }

  private async invalidateSessionListCache(userId?: string): Promise<void> {
    if (!userId) return;
    try {
      await this.cacheStrategyManager.delByPattern(`sessions:list:*:${this.getCurrentEnv()}`);
    } catch (error) {
      console.warn("[ConversationManager] 会话列表缓存清理失败:", error);
    }
  }

  private async persistSession(session: ConversationSession): Promise<void> {
    await this.storage.saveSession(session);
    await this.cacheStrategyManager.set(this.getSessionCacheKey(session.id), session, this.sessionCacheTtlSeconds);
    await this.cacheStrategyManager.set(
      this.getSessionAccessCacheKey(session.id),
      { id: session.id, userId: session.userId, visibility: session.visibility ?? ConversationVisibility.PRIVATE } as SessionAccessInfo,
      this.sessionCacheTtlSeconds
    );
    await this.invalidateSessionListCache(session.userId);
  }

  private async clearSessionCache(sessionId: string): Promise<void> {
    await this.cacheStrategyManager.del(this.getSessionCacheKey(sessionId), this.getSessionAccessCacheKey(sessionId));
  }

  // ==================== 会话管理 ====================

  async createSession(
    initialPrompt: string,
    projectInfo: ProjectInfo,
    mode: ConversationMode = ConversationMode.EDIT,
    userId: string,
    model?: string
  ): Promise<ConversationSession> {
    if (!projectInfo.projectId) {
      throw new Error("项目ID不能为空，必须选择一个项目");
    }

    // B2: 单次项目查询，结果直接传给 handleEditModeSetup，不再用 any 动态属性传递
    const projectResult = await this.projectService.getProject(projectInfo.projectId, userId);
    if (!projectResult.success || !projectResult.project) {
      throw new Error(`获取项目信息失败: ${projectResult.error || "项目不存在"}`);
    }

    const project = projectResult.project;
    const selectedBranch = projectInfo.gitBranch || project.gitBranch;
    const completeProjectInfo: ProjectInfo = {
      projectId: project.id,
      projectName: project.name,
      gitRepositoryUrl: project.gitRepositoryUrl,
      workDir: project.workDirectory || project.repoDir,
      mainRepoDir: project.workDirectory || project.repoDir,
      gitBranch: selectedBranch,
      relevantFiles: projectInfo.relevantFiles,
    };

    if (!completeProjectInfo.gitBranch) {
      throw new Error(`[ConversationManager] 项目 ${project.name} 缺失默认分支配置(gitBranch)`);
    }

    const sessionId = newId();
    const now = dayjs().toDate();
    const resolvedModel = isNeovateModelSupported(model) ? model! : DEFAULT_NEOVATE_MODEL;

    const context: ConversationContext = {
      projectInfo: completeProjectInfo,
      taskDescription: initialPrompt,
      messageHistory: [],
      variables: {
        environment: process.env.APP_ENV || 'local',
        model: resolvedModel,
      },
      mode,
    };

    const session: ConversationSession = {
      id: sessionId,
      userId,
      status: ConversationStatus.ACTIVE,
      visibility: ConversationVisibility.PRIVATE,
      context,
      createdAt: now,
      updatedAt: now,
    };

    if (mode === ConversationMode.EDIT) {
      if (!this.worktreeManager) throw new Error('编辑模式需要 Worktree 管理器，但服务未初始化');
      if (!userId) throw new Error('编辑模式需要用户 ID');

      // B2: 直接传入已查好的 project，无需在 handleEditModeSetup 内再查
      const gitResult = await this.handleEditModeSetup(sessionId, userId, project, completeProjectInfo.gitBranch);
      if (!gitResult.success) throw new Error(`Git 操作失败: ${gitResult.error}`);

      context.gitBranch = gitResult.branchName;
      if (gitResult.worktreePath) {
        context.projectInfo = { ...context.projectInfo, workDir: gitResult.worktreePath, worktreePath: gitResult.worktreePath };
      }
    } else if (mode === ConversationMode.READONLY) {
      if (!userId) throw new Error('只读模式需要用户 ID');
      console.log(`[ConversationManager] 只读模式：直接使用项目主目录 ${completeProjectInfo.workDir}`);
      context.gitBranch = completeProjectInfo.gitBranch;
    }

    session.context = context;
    await this.persistSession(session);
    return session;
  }

  // B2: 接受已查好的 project 对象，消除内部重复查询和 (as any) 动态属性
  private async handleEditModeSetup(
    sessionId: string,
    userId: string,
    project: { id: string; workDirectory?: string | null; repoDir?: string | null; gitBranch?: string | null },
    defaultBranch: string
  ): Promise<{ success: boolean; branchName?: string; worktreePath?: string; error?: string }> {
    if (!this.worktreeManager) return { success: false, error: "Worktree 管理器未初始化" };

    try {
      const workDir = project.workDirectory || project.repoDir || '';
      const worktreeBaseDir = getWorktreeBaseDir(workDir);
      // B3: 直接用 this.projectService.executor，不再 (as any).executor
      const projectWorktreeManager = new WorktreeManager(
        this.projectService.executor,
        workDir,
        worktreeBaseDir,
        project.id
      );

      console.log(`[ConversationManager] 为对话创建独立 worktree: ${sessionId}`);
      const worktreeInfo = await projectWorktreeManager.createConversationWorktree(
        userId,
        sessionId,
        project.gitBranch || defaultBranch
      );

      if (!worktreeInfo.branchName) {
        throw new Error('[ConversationManager] 创建 worktree 失败：未能获取分支名称');
      }

      console.log(`[ConversationManager] ✅ worktree 创建成功 分支: ${worktreeInfo.branchName} 路径: ${worktreeInfo.worktreePath}`);
      return { success: true, branchName: worktreeInfo.branchName, worktreePath: worktreeInfo.worktreePath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getSession(sessionId: string): Promise<ConversationSession | null> {
    const cached = await this.cacheStrategyManager.get<ConversationSession>(this.getSessionCacheKey(sessionId));
    if (cached) {
      return { ...cached, visibility: cached.visibility ?? ConversationVisibility.PRIVATE };
    }

    const inFlight = this.inFlightSessionLoads.get(sessionId);
    if (inFlight) return inFlight;

    const loadPromise = (async () => {
      const session = await this.storage.loadSession(sessionId);
      const normalized = session
        ? { ...session, visibility: session.visibility ?? ConversationVisibility.PRIVATE }
        : null;
      if (normalized) {
        await this.cacheStrategyManager.set(this.getSessionCacheKey(sessionId), normalized, this.sessionCacheTtlSeconds);
      }
      return normalized;
    })();

    this.inFlightSessionLoads.set(sessionId, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.inFlightSessionLoads.delete(sessionId);
    }
  }

  async getSessionAccessInfo(sessionId: string): Promise<SessionAccessInfo | null> {
    const cached = await this.cacheStrategyManager.get<SessionAccessInfo>(this.getSessionAccessCacheKey(sessionId));
    if (cached) {
      return { ...cached, visibility: cached.visibility ?? ConversationVisibility.PRIVATE };
    }

    const sessionAccess = await this.storage.loadSessionAccessInfo(sessionId);
    if (!sessionAccess) return null;

    const normalized = { ...sessionAccess, visibility: sessionAccess.visibility ?? ConversationVisibility.PRIVATE };
    await this.cacheStrategyManager.set(this.getSessionAccessCacheKey(sessionId), normalized, this.sessionCacheTtlSeconds);
    return normalized;
  }

  async listSessions(userId?: string): Promise<ConversationSession[]> {
    const cacheKey = this.getSessionListCacheKey(userId);
    const cached = await this.cacheStrategyManager.get<ConversationSession[]>(cacheKey);
    if (cached) return cached;

    const rawSessions = await this.storage.listSessions({ userId, environment: this.getCurrentEnv() });
    const sessions = rawSessions.map((s: any) => ({ ...s, visibility: s.visibility ?? 'private' }));
    await this.cacheStrategyManager.set(cacheKey, sessions, this.sessionListCacheTtlSeconds);
    return sessions as ConversationSession[];
  }

  async validateOperation(sessionId: string, operation: OperationType): Promise<ValidationResult> {
    const session = await this.getSession(sessionId);
    if (!session) return { allowed: false, reason: `会话不存在: ${sessionId}` };
    return this.modeValidator.validateOperation(session.context.mode, operation);
  }

  async addMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    metadata?: MessageMetadata,
    existingSession?: ConversationSession,
    asyncSave: boolean = false
  ): Promise<ConversationMessage> {
    // B1: 使用 Promise 队列锁
    const release = await this.acquireLock(sessionId);

    try {
      const session = existingSession || await this.getSession(sessionId);
      if (!session) throw new Error(`会话不存在: ${sessionId}`);

      const messageId = newId();
      const now = dayjs().toDate();
      const message: ConversationMessage = { id: messageId, sessionId, role, content, metadata, timestamp: now };

      session.context.messageHistory.push(messageId);
      session.updatedAt = now;

      if (asyncSave) {
        Promise.all([
          this.storage.saveMessage(message),
          this.storage.saveSession(session).then(() => this.invalidateSessionListCache(session.userId))
        ])
          .then(() => void this.clearSessionCache(sessionId))
          .catch(error => console.error(`[ConversationManager] 异步保存消息失败:`, error));
      } else {
        await Promise.all([this.storage.saveMessage(message), this.persistSession(session)]);
        await this.clearSessionCache(sessionId);
      }

      return message;
    } finally {
      release();
    }
  }

  async getMessageHistory(sessionId: string, since?: string): Promise<ConversationMessage[]> {
    return this.storage.loadMessages(sessionId, since);
  }

  async getMessageHistoryVersion(sessionId: string): Promise<MessageHistoryVersion> {
    return this.storage.getMessageHistoryVersion(sessionId);
  }

  async getReviewSidebar(sessionId: string): Promise<ReviewSidebarData> {
    return this.storage.getReviewSidebar(sessionId);
  }

  async getReviewFiles(sessionId: string): Promise<ReviewFilesData> {
    return this.storage.getReviewFiles(sessionId);
  }

  async getReviewDiff(sessionId: string, filePath: string, roundId?: string): Promise<ReviewDiffData> {
    return this.storage.getReviewDiff(sessionId, filePath, roundId);
  }

  async getReviewUpdates(sessionId: string, since: string): Promise<ReviewUpdatesData> {
    return this.storage.getReviewUpdates(sessionId, since);
  }

  async getMessage(sessionId: string, messageId: string): Promise<ConversationMessage | null> {
    return this.storage.loadMessage(sessionId, messageId);
  }

  private isValidStatusTransition(current: ConversationStatus, next: ConversationStatus): boolean {
    return current === ConversationStatus.ACTIVE && next === ConversationStatus.ARCHIVED;
  }

  async updateSessionStatus(sessionId: string, newStatus: ConversationStatus, reason?: string): Promise<void> {
    const release = await this.acquireLock(sessionId);
    try {
      const session = await this.getSession(sessionId);
      if (!session) throw new Error(`会话不存在: ${sessionId}`);
      if (!this.isValidStatusTransition(session.status, newStatus)) {
        throw new Error(`非法的状态转换: ${session.status} -> ${newStatus}`);
      }
      session.status = newStatus;
      session.updatedAt = dayjs().toDate();
      if (newStatus === ConversationStatus.ARCHIVED) {
        session.completedAt = dayjs().toDate();
        if (reason) session.error = reason;
      }
      await this.persistSession(session);
      await this.clearSessionCache(sessionId);
    } finally {
      release();
    }
  }

  async updateVisibility(sessionId: string, visibility: ConversationVisibility): Promise<void> {
    const release = await this.acquireLock(sessionId);
    try {
      const session = await this.getSession(sessionId);
      if (!session) throw new Error(`会话不存在: ${sessionId}`);
      session.visibility = visibility;
      session.updatedAt = dayjs().toDate();
      await this.persistSession(session);
      await this.clearSessionCache(sessionId);
    } finally {
      release();
    }
  }

  async saveContext(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`会话不存在: ${sessionId}`);
    await this.storage.saveContext(sessionId, session.context);
  }

  async restoreContext(sessionId: string): Promise<ConversationContext> {
    const context = await this.storage.loadContext(sessionId);
    if (!context) throw new Error(`会话上下文不存在: ${sessionId}`);
    return context;
  }

  async updateContextVariable(sessionId: string, key: string, value: any): Promise<void> {
    const release = await this.acquireLock(sessionId);
    try {
      const session = await this.getSession(sessionId);
      if (!session) throw new Error(`会话不存在: ${sessionId}`);
      session.context.variables[key] = value;
      session.updatedAt = dayjs().toDate();
      await this.persistSession(session);
    } finally {
      release();
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const release = await this.acquireLock(sessionId);
    try {
      const session = await this.getSession(sessionId);
      await this.storage.deleteSession(sessionId);
      await this.invalidateSessionListCache(session?.userId);
      await this.clearSessionCache(sessionId);
    } finally {
      release();
    }
  }

  async archiveInactiveSessions(olderThanXDays: number): Promise<number> {
    console.log(`[ConversationManager] 开始归档超过 ${olderThanXDays} 天未更新的会话...`);
    const inactiveSessions = await this.storage.getInactiveSessions(olderThanXDays, ConversationStatus.ACTIVE);
    if (inactiveSessions.length === 0) {
      console.log('[ConversationManager] 没有发现需要归档的会话');
      return 0;
    }
    console.log(`[ConversationManager] 发现 ${inactiveSessions.length} 个不活跃会话，准备归档...`);
    let archivedCount = 0;
    for (const { id } of inactiveSessions) {
      try {
        await this.updateSessionStatus(id, ConversationStatus.ARCHIVED, `Auto-archived due to inactivity (> ${olderThanXDays} days)`);
        archivedCount++;
      } catch (error) {
        console.error(`[ConversationManager] 归档会话 ${id} 失败:`, error);
      }
    }
    console.log(`[ConversationManager] 归档完成，成功归档 ${archivedCount}/${inactiveSessions.length} 个会话`);
    return archivedCount;
  }

  async getSessionStats(sessionId: string): Promise<{ messageCount: number; status: ConversationStatus }> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`会话不存在: ${sessionId}`);
    const messages = await this.getMessageHistory(sessionId);
    return { messageCount: messages.length, status: session.status };
  }

  // ==================== B4: createMergeRequest 拆分为三步 ====================

  async createMergeRequest(sessionId: string): Promise<{ success: boolean; mrUrl?: string; error?: string }> {
    if (!this.gitlabService) return { success: false, error: "GitLab 服务未初始化" };

    try {
      const preconditions = await this.validateMRPreconditions(sessionId);
      if ('error' in preconditions) return { success: false, error: preconditions.error };

      const { session, gitBranch, targetBranch, gitlabProjectId, projectWorktreeManager } = preconditions;

      if (session.context.mrUrl) {
        console.log(`[ConversationManager] ✅ MR 已存在（从 context）: ${session.context.mrUrl}`);
        return { success: true, mrUrl: session.context.mrUrl };
      }

      const finalBranch = await this.prepareBranchForMR(projectWorktreeManager, session, gitBranch, targetBranch);
      const mrUrl = await this.upsertMR(finalBranch, targetBranch, session, gitlabProjectId);

      session.context.mrUrl = mrUrl;
      await this.storage.saveContext(sessionId, session.context);
      return { success: true, mrUrl };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async validateMRPreconditions(sessionId: string): Promise<
    | { error: string }
    | {
        session: ConversationSession;
        gitBranch: string;
        targetBranch: string;
        projectId: string;
        gitlabProjectId: string | undefined;
        projectWorktreeManager: WorktreeManager | undefined;
      }
  > {
    const session = await this.getSession(sessionId);
    if (!session) return { error: "会话不存在" };
    if (session.context.mode !== ConversationMode.EDIT) return { error: "只有编辑模式才能创建 MR" };
    if (!session.context.gitBranch) return { error: "会话没有关联的 Git 分支" };

    const targetBranch = session.context.projectInfo.gitBranch;
    if (!targetBranch) return { error: "会话未设置目标分支" };

    const projectId = (session as any).projectId || session.context.projectInfo.projectId;
    if (!projectId) return { error: "会话未关联项目" };

    const projectResult = await this.projectService.getProject(projectId, session.userId!);
    if (!projectResult.success || !projectResult.project) {
      return { error: projectResult.error || "无法获取项目信息" };
    }

    const project = projectResult.project;
    const gitlabProjectId = project.gitlabProjectId || undefined;

    // B3: 直接用 this.projectService.executor，不再 (as any)
    let projectWorktreeManager: WorktreeManager | undefined;
    const repoDir = project.workDirectory || project.repoDir;
    if (repoDir) {
      projectWorktreeManager = new WorktreeManager(
        this.projectService.executor,
        repoDir,
        `${repoDir}/../worktrees`,
        project.id
      );
    }
    if (!projectWorktreeManager) projectWorktreeManager = this.worktreeManager;

    return { session, gitBranch: session.context.gitBranch, targetBranch, projectId, gitlabProjectId, projectWorktreeManager };
  }

  private async prepareBranchForMR(
    projectWorktreeManager: WorktreeManager | undefined,
    session: ConversationSession,
    gitBranch: string,
    targetBranch: string
  ): Promise<string> {
    const sessionId = session.id;

    if (projectWorktreeManager && session.userId) {
      try {
        const worktreeInfo = await projectWorktreeManager.getWorktreeInfo(session.userId, sessionId);
        const actualBranch = worktreeInfo.branchName;
        if (actualBranch && actualBranch !== session.context.gitBranch) {
          console.log(`[ConversationManager] 检测到分支不一致，更新: ${session.context.gitBranch} -> ${actualBranch}`);
          session.context.gitBranch = actualBranch;
          gitBranch = actualBranch;
          await this.storage.saveContext(sessionId, session.context);
        }
      } catch (err) {
        console.warn(`[ConversationManager] 无法同步 Worktree 分支信息 session=${sessionId}:`, err);
      }
    }

    if (gitBranch === targetBranch) {
      if (!projectWorktreeManager) throw new Error("Worktree 管理器未初始化，无法处理分支冲突");
      console.log(`[ConversationManager] 源分支与目标分支相同 (${targetBranch})，尝试推送当前分支...`);
      await projectWorktreeManager.commitChanges(session.userId!, sessionId, "Auto-commit before creating MR");
      await projectWorktreeManager.pushBranch(session.userId!, sessionId);
      return gitBranch;
    }

    if (projectWorktreeManager && session.userId) {
      try {
        await projectWorktreeManager.commitChanges(session.userId, sessionId, "Auto-commit before creating Merge Request");
        await projectWorktreeManager.pushBranch(session.userId, sessionId);
        console.log(`[ConversationManager] ✅ 分支推送成功`);
      } catch (gitError) {
        console.warn(`[ConversationManager] Git 操作失败，尝试继续创建 MR:`, gitError);
      }
    }

    return gitBranch;
  }

  private async upsertMR(
    sourceBranch: string,
    targetBranch: string,
    session: ConversationSession,
    gitlabProjectId: string | undefined
  ): Promise<string> {
    const existing = await this.gitlabService!.findExistingMR(sourceBranch, targetBranch, gitlabProjectId);
    if (existing) {
      console.log(`[ConversationManager] ✅ MR 已存在（从 GitLab）: ${existing.webUrl}`);
      return existing.webUrl;
    }
    const result = await this.gitlabService!.createMRForTask(
      session.id,
      session.context.taskDescription,
      sourceBranch,
      targetBranch,
      gitlabProjectId
    );
    console.log(`[ConversationManager] ✅ MR 已创建: ${result.webUrl}`);
    return result.webUrl;
  }
}
