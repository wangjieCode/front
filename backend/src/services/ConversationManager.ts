import { LRUCache } from "lru-cache";
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
import { ModeValidator } from "./ModeValidator";
import { GitLabMCPService } from "./GitLabMCPService";
import { WorktreeManager } from "./WorktreeManager";
import { ProjectService } from "./ProjectService";
import { newId } from "../utils/id";
import { getWorktreeBaseDir } from "../utils/config";
import dayjs from "dayjs";
import { DEFAULT_NEOVATE_MODEL, isNeovateModelSupported } from "@front/shared";
import { RedisManager } from "../db/RedisManager";
import type Redis from "ioredis";

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
  private redis?: Redis;
  
  // 使用 LRU 缓存
  private sessionCache: LRUCache<string, ConversationSession>;

  constructor(
    storage: IConversationStorage,
    projectService: ProjectService,
    gitlabService?: GitLabMCPService,
    worktreeManager?: WorktreeManager,
    redis?: Redis
  ) {
    this.storage = storage;
    this.projectService = projectService;
    this.modeValidator = new ModeValidator();
    this.gitlabService = gitlabService;
    this.worktreeManager = worktreeManager;
    this.redis = redis;
    
    // 初始化 LRU 缓存
    this.sessionCache = new LRUCache<string, ConversationSession>({
      max: 50, // 最多缓存50个会话
      updateAgeOnGet: true, // 访问时更新使用时间
    });
  }

  private getRedis(): Redis | null {
    return this.redis ?? RedisManager.getInstanceSafe();
  }

  private async invalidateSessionListCache(userId?: string): Promise<void> {
    if (!userId) return;
    const redis = this.getRedis();
    if (!redis) return;
    try {
      const currentEnv = process.env.APP_ENV || "local";
      await redis.del(`sessions:list:${userId}:${currentEnv}`);
    } catch (error) {
      console.warn("[ConversationManager] 会话列表缓存清理失败 (Redis 可能达到限制):", error);
    }
  }

  private async persistSession(session: ConversationSession): Promise<void> {
    await this.storage.saveSession(session);
    await this.invalidateSessionListCache(session.userId);
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
    userId: string,
    model?: string
  ): Promise<ConversationSession> {
    // 验证 projectId 必须存在
    if (!projectInfo.projectId) {
      throw new Error("项目ID不能为空，必须选择一个项目");
    }

    // 始终以数据库项目为准，避免 projectId 与 workDir 不一致
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

    // console.log(`[ConversationManager] 创建会话 - 项目信息:`, {
    //   projectId: completeProjectInfo.projectId,
    //   projectName: completeProjectInfo.projectName,
    //   workDir: completeProjectInfo.workDir
    // });

    const sessionId = newId();
    const now = dayjs().toDate();

    // 临时存储当前项目ID供handleEditModeSetup使用
    (this as any).currentProjectId = projectInfo.projectId;

    // 初始化上下文
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

    // 创建会话
    const session: ConversationSession = {
      id: sessionId,
      userId,
      status: ConversationStatus.ACTIVE,  // 简化状态：创建时即为活跃状态
      visibility: ConversationVisibility.PRIVATE, // 默认私密
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
          workDir: gitResult.worktreePath,
          worktreePath: gitResult.worktreePath
        };
      }

      // console.log(`[ConversationManager] Git 分支已创建: ${gitResult.branchName}`);
    } else if (mode === ConversationMode.READONLY) {
      // 只读模式不需要独立 worktree，直接使用项目主目录
      if (!userId) {
        throw new Error('只读模式需要用户 ID');
      }

      console.log(`[ConversationManager] 只读模式：直接使用项目主目录 ${completeProjectInfo.workDir}`);
      context.gitBranch = completeProjectInfo.gitBranch;
      
      // 不进行 worktree 操作，使用 completeProjectInfo 中的默认 workDir
    }

    // 更新会话信息
    session.context = context;

    // 保存会话（会自动保存上下文和分支）
    await this.persistSession(session);

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
    defaultBranch: string
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
      const workDir = projectResult.project.workDirectory || projectResult.project.repoDir;
      const worktreeBaseDir = getWorktreeBaseDir(workDir);
      const projectWorktreeManager = new WorktreeManager(
        (this.projectService as any).executor,
        workDir,
        worktreeBaseDir,
        projectResult.project.id
      );

      // 直接为对话创建独立的 worktree 和分支
      // 新架构：每个对话一个独立的 worktree，无需同步和切换分支
      console.log(`[ConversationManager] 为对话创建独立 worktree: ${sessionId}`);
      
      const worktreeInfo = await projectWorktreeManager.createConversationWorktree(
        userId,
        sessionId,
        projectResult.project.gitBranch || defaultBranch
      );
      
      if (!worktreeInfo.branchName) {
         throw new Error('[ConversationManager] 创建 worktree 失败：未能获取分支名称');
      }

      console.log(`[ConversationManager] ✅ 对话 worktree 创建成功`);
      console.log(`[ConversationManager]    分支: ${worktreeInfo.branchName}`);
      console.log(`[ConversationManager]    路径: ${worktreeInfo.worktreePath}`);

      return {
        success: true,
        branchName: worktreeInfo.branchName,
        worktreePath: worktreeInfo.worktreePath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }



  /**
   * 获取对话会话（带缓存）
   */
  async getSession(sessionId: string): Promise<ConversationSession | null> {
    // 检查缓存
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      return cached;
    }

    // 从数据库加载
    const session = await this.storage.loadSession(sessionId);
    const normalized = session
      ? {
          ...session,
          visibility: session.visibility ?? ConversationVisibility.PRIVATE,
        }
      : null;
    
    // 更新缓存
    if (normalized) {
      this.sessionCache.set(sessionId, normalized);
    }
    
    return normalized;
  }

  /**
   * 清除会话缓存
   */
  private clearSessionCache(sessionId: string): void {
    this.sessionCache.delete(sessionId);
  }

   /**
     * 获取所有会话列表（支持用户过滤）
     * - 返回公开对话
     * - 加上该用户创建的所有对话（包括私密的）
     */
  async listSessions(userId?: string): Promise<ConversationSession[]> {
    const currentEnv = process.env.APP_ENV || "local";
    const cacheKey = `sessions:list:${userId || "public"}:${currentEnv}`;
    const redis = this.getRedis();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          try {
            return JSON.parse(cached) as ConversationSession[];
          } catch (error) {
            console.warn("[ConversationManager] 会话列表缓存解析失败，已忽略");
          }
        }
      } catch (error) {
        console.warn("[ConversationManager] Redis 查询失败 (可能达到额度限制):", error);
        // 继续向下走，从数据库读取
      }
    }

    const rawAll = await this.storage.listSessions();
    const all = rawAll.map((s: any) => ({
      ...s,
      visibility: s.visibility ?? 'private',
    }));
    
    if (!userId) {
      // 未登录用户只能看到公开对话
      const filtered = all.filter((s: any) => s.visibility === ConversationVisibility.PUBLIC);
      return filtered as ConversationSession[];
    }
    
    // 登录用户：公开对话 + 自己创建的对话
    const filtered = all.filter((s: any) => 
      s.visibility === ConversationVisibility.PUBLIC || s.userId === userId
    );

    // 根据 environment 过滤
    const envFiltered = filtered.filter((s: any) => {
      const vars = s.context?.variables || {};
      const sessionEnv = vars.environment;
      return sessionEnv === currentEnv;
    });

    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(envFiltered), "EX", 30);
      } catch (error) {
        console.warn("[ConversationManager] Redis 写入失败 (可能达到额度限制):", error);
      }
    }

    return envFiltered as ConversationSession[];
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
    existingSession?: ConversationSession,
    asyncSave: boolean = false // 是否异步保存，不阻塞返回
  ): Promise<ConversationMessage> {
    await this.acquireLock(sessionId);

    try {
      const session = existingSession || await this.getSession(sessionId);
      if (!session) {
        throw new Error(`会话不存在: ${sessionId}`);
      }

      const context = session.context;
      const messageId = newId();
      const now = dayjs().toDate();

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

      if (asyncSave) {
        // 异步保存，不阻塞返回
        Promise.all([
          this.storage.saveMessage(message),
          this.storage.saveSession(session).then(() => this.invalidateSessionListCache(session.userId))
        ]).then(() => {
          this.clearSessionCache(sessionId);
        }).catch(error => {
          console.error(`[ConversationManager] 异步保存消息失败:`, error);
        });
      } else {
        // 同步保存
        await Promise.all([
          this.storage.saveMessage(message),
          this.persistSession(session)
        ]);
        this.clearSessionCache(sessionId);
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
   * 验证状态转换是否合法（简化版）
   */
  private isValidStatusTransition(
    currentStatus: ConversationStatus,
    newStatus: ConversationStatus
  ): boolean {
    // 简化状态转换规则：单向流转，ACTIVE -> ARCHIVED，不可恢复
    const validTransitions: Record<ConversationStatus, ConversationStatus[]> = {
      [ConversationStatus.ACTIVE]: [
        ConversationStatus.ARCHIVED,  // 活跃 -> 归档
      ],
      [ConversationStatus.ARCHIVED]: [
        // 已归档状态不可变
      ],
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  /**
   * 更新会话状态（简化版）
   */
  async updateSessionStatus(
    sessionId: string,
    newStatus: ConversationStatus,
    reason?: string  // 归档原因或错误信息
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
      session.updatedAt = dayjs().toDate();

      // 如果归档，设置完成时间和原因
      if (newStatus === ConversationStatus.ARCHIVED) {
        session.completedAt = dayjs().toDate();
        if (reason) {
          session.error = reason;  // 复用 error 字段存储归档原因
        }
      }

      await this.persistSession(session);
      
      // 清除缓存
      this.clearSessionCache(sessionId);
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * 更新会话可见性
   */
  async updateVisibility(sessionId: string, visibility: ConversationVisibility): Promise<void> {
    await this.acquireLock(sessionId);

    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`会话不存在: ${sessionId}`);
      }

      session.visibility = visibility;
      session.updatedAt = dayjs().toDate();

      await this.persistSession(session);
      this.clearSessionCache(sessionId);
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
      session.updatedAt = dayjs().toDate();
      await this.persistSession(session);
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
      const session = await this.getSession(sessionId);
      await this.storage.deleteSession(sessionId);
      await this.invalidateSessionListCache(session?.userId);
      this.clearSessionCache(sessionId);
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * 自动归档不活跃的会话
   * @param olderThanXDays 超过多少天未更新的会话将被归档
   * @returns 归档的数量
   */
  async archiveInactiveSessions(olderThanXDays: number): Promise<number> {
    console.log(`[ConversationManager] 开始归档超过 ${olderThanXDays} 天未更新的会话...`);
    
    // 1. 获取所有不活跃的 ACTIVE 会话 ID
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
    sessionId: string
  ): Promise<{ success: boolean; mrUrl?: string; error?: string }> {
    if (!this.gitlabService) {
      console.warn(`[ConversationManager] MR 创建失败: GitLab 服务未初始化`);
      return { success: false, error: "GitLab 服务未初始化" };
    }

    const session = await this.getSession(sessionId);
    if (!session) {
      console.warn(`[ConversationManager] MR 创建失败: 会话不存在 ${sessionId}`);
      return { success: false, error: "会话不存在" };
    }

    // 验证是编辑模式
    if (session.context.mode !== ConversationMode.EDIT) {
      console.warn(`[ConversationManager] MR 创建失败: 非编辑模式 session=${sessionId} mode=${session.context.mode}`);
      return { success: false, error: "只有编辑模式才能创建 MR" };
    }

    // 验证是否有分支
    if (!session.context.gitBranch) {
      console.warn(`[ConversationManager] MR 创建失败: 缺少源分支 session=${sessionId}`);
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
      const finalTargetBranch = session.context.projectInfo.gitBranch;
      if (!finalTargetBranch) {
        console.warn(`[ConversationManager] MR 创建失败: 目标分支为空 session=${sessionId}`);
        return { success: false, error: "会话未设置目标分支" };
      }
      console.log(`[ConversationManager] MR 目标分支: ${finalTargetBranch}`);

      const projectId = (session as any).projectId || session.context.projectInfo.projectId;
      if (!projectId) {
        console.warn(`[ConversationManager] ⚠️ 无法创建 MR：缺少项目 ID session=${sessionId}`);
        return { success: false, error: "会话未关联项目" };
      }

      console.log(`[ConversationManager] 获取项目详情: ${projectId}, 用户: ${session.userId}`);

      const projectResult = await this.projectService.getProject(projectId, session.userId!);
      if (!projectResult.success || !projectResult.project) {
        console.warn(`[ConversationManager] ⚠️ 无法找到关联项目 projectId=${projectId}`);
        return { success: false, error: projectResult.error || "无法获取项目信息" };
      }

      const project = projectResult.project;
      let gitlabProjectId: string | undefined = project.gitlabProjectId || undefined;
      console.log(`[ConversationManager] 关联的 GitLab Project ID: ${gitlabProjectId}`);

      let projectWorktreeManager: WorktreeManager | undefined;
      if (this.projectService && (this.projectService as any).executor) {
        const executor = (this.projectService as any).executor;
        const repoDir = project.workDirectory || project.repoDir;
        const worktreeDir = `${repoDir}/../worktrees`;
        projectWorktreeManager = new WorktreeManager(executor, repoDir, worktreeDir, project.id);
      }

      // 如果无法初始化特定的 WorktreeManager，回退到全局的
      if (!projectWorktreeManager) {
        console.warn(`[ConversationManager] ⚠️ 无法初始化项目特定的 WorktreeManager，回退到全局管理器`);
        projectWorktreeManager = this.worktreeManager;
      }
      if (!projectWorktreeManager) {
        console.warn(`[ConversationManager] ⚠️ WorktreeManager 仍未初始化 session=${sessionId}`);
      }

      // 1. 同步当前实际分支 & 确保 Worktree 存在
      if (projectWorktreeManager && session.userId) {
        try {
          // 使用 getWorktreeInfo 获取对话 worktree 信息
          const worktreeInfo = await projectWorktreeManager.getWorktreeInfo(session.userId, sessionId);
          const actualBranch = worktreeInfo.branchName;
          console.log(`[ConversationManager] 当前 worktree 分支: ${actualBranch} session=${sessionId}`);

          if (actualBranch && actualBranch !== session.context.gitBranch) {
            console.log(`[ConversationManager] ⚠️ 检测到分支不一致，更新会话分支: ${session.context.gitBranch} -> ${actualBranch}`);
            session.context.gitBranch = actualBranch;
            await this.storage.saveContext(sessionId, session.context);
          }
        } catch (syncError) {
          // 如果 worktree 不存在，这里会捕获到错误
          console.warn(`[ConversationManager] ⚠️ 无法同步 Worktree 分支信息 session=${sessionId}:`, syncError);
          // 如果是项目特定的 worktree 失败，说明可能路径有问题
          // 但我们不中断，尝试继续
        }
      }

      // 2. 自动解决 "源分支与目标分支相同" 的问题
      if (session.context.gitBranch === finalTargetBranch) {
        if (!projectWorktreeManager) {
           console.warn(`[ConversationManager] MR 创建失败: WorktreeManager 未初始化 session=${sessionId}`);
           return { success: false, error: "Worktree 管理器未初始化，无法自动创建功能分支" };
        }

        console.log(`[ConversationManager] ⚠️ 源分支与目标分支相同 (${finalTargetBranch})，尝试自动创建功能分支...`);
        
        try {
          const shortSessionId = sessionId.substring(0, 8);
          const timestamp = dayjs().valueOf();
          const featureBranchName = `auto-feature-${shortSessionId}-${timestamp}`;
          
          // a. 提交当前更改
          await projectWorktreeManager.commitChanges(session.userId!, sessionId, "Auto-commit before creating MR");
          
          // b. 从当前位置创建新分支（注意：新架构下不需要此步骤，因为每个对话已有独立分支）
          // 这里我们直接使用当前分支，不再创建新分支
          
          // c. 推送当前分支
          await projectWorktreeManager.pushBranch(session.userId!, sessionId);
          
          // d. 更新上下文
          session.context.gitBranch = featureBranchName;
          await this.storage.saveContext(sessionId, session.context);
          
          console.log(`[ConversationManager] ✅ 已自动切换到新功能分支: ${featureBranchName}`);
          
        } catch (err) {
           console.error(`[ConversationManager] ❌ 自动创建分支失败 session=${sessionId}:`, err);
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
          
          await projectWorktreeManager.commitChanges(session.userId, sessionId, "Auto-commit before creating Merge Request");
          await projectWorktreeManager.pushBranch(session.userId, sessionId);
          
          console.log(`[ConversationManager] ✅ 分支推送成功`);
        } catch (gitError) {
          console.warn(`[ConversationManager] ⚠️ Git 操作 (提交/推送) 失败 session=${sessionId}，尝试继续创建 MR:`, gitError);
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

  async getGitLabBranches(
    projectId: string,
    userId: string
  ): Promise<{ branches: string[]; defaultBranch?: string }> {
    if (!this.gitlabService) {
      throw new Error('GitLab 服务未初始化');
    }

    const projectResult = await this.projectService.getProject(projectId, userId);
    if (!projectResult.success || !projectResult.project) {
      throw new Error(projectResult.error || '项目不存在');
    }

    const gitlabProjectId = projectResult.project.gitlabProjectId || undefined;
    if (!gitlabProjectId) {
      throw new Error('项目未配置 gitlab_project_id');
    }

    const [branches, projectInfo] = await Promise.all([
      this.gitlabService.listBranches(gitlabProjectId),
      this.gitlabService.getProjectInfo(gitlabProjectId),
    ]);

    return {
      branches,
      defaultBranch: projectInfo?.default_branch || projectResult.project.gitBranch,
    };
  }
}
