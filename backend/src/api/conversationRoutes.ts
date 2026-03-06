import { Router, Response } from 'express';
import { ConversationManager } from '../services/ConversationManager';
import { ConversationAIService } from '../services/ConversationAIService';
import { BranchCacheService } from '../services/BranchCacheService';
import { ConversationStatus, ConversationVisibility, MessageRole } from '../types';
import { requireAuth, AuthRequest } from './authMiddleware';
import dayjs from 'dayjs';
import { DEFAULT_NEOVATE_MODEL, isNeovateModelSupported, NEOVATE_MODEL_OPTIONS } from '@front/shared';
import { ModelAvailabilityService } from '../services/ModelAvailabilityService';

interface SlashCommandMeta {
  name: string;
  description: string;
  argumentHint?: string;
  source: 'system' | 'skill';
  permissions?: string[];
}

export function createConversationRoutes(
  conversationManager: ConversationManager,
  aiService: ConversationAIService,
  branchCacheService: BranchCacheService,
  modelAvailabilityService?: ModelAvailabilityService
): Router {
  const router = Router();
  const isCreator = (session: any, userId?: string) => {
    if (!userId) return false;
    return session.userId === userId;
  };
  const resolveModel = (model?: string) => {
    const defaultModel = modelAvailabilityService?.resolveDefaultModel() || DEFAULT_NEOVATE_MODEL;
    if (!model || !isNeovateModelSupported(model)) {
      return defaultModel;
    }
    if (modelAvailabilityService && !modelAvailabilityService.isModelEnabled(model)) {
      return defaultModel;
    }
    return model;
  };
  const sanitizeProjectInfoForResponse = (projectInfo: any) => {
    if (!projectInfo || typeof projectInfo !== 'object') {
      return projectInfo;
    }
    const { gitRepositoryUrl: _gitRepositoryUrl, ...safeProjectInfo } = projectInfo;
    return safeProjectInfo;
  };
  const sanitizeSessionForResponse = (session: any) => {
    if (!session || !session.context || !session.context.projectInfo) {
      return session;
    }
    return {
      ...session,
      context: {
        ...session.context,
        projectInfo: sanitizeProjectInfoForResponse(session.context.projectInfo),
      },
    };
  };

  router.get('/models', async (_req, res: Response) => {
    const defaultModel = modelAvailabilityService?.resolveDefaultModel() || DEFAULT_NEOVATE_MODEL;
    const options = modelAvailabilityService?.getModelOptions()
      || NEOVATE_MODEL_OPTIONS.map(option => ({ ...option, enabled: true }));

    res.json({
      success: true,
      data: {
        defaultModel,
        options,
      },
    });
  });

  router.get('/commands', async (_req, res: Response) => {
    const systemCommands: SlashCommandMeta[] = [
      { name: 'help', description: '查看可用斜杠命令与说明', source: 'system' },
      { name: 'clear', description: '清空当前输入框内容', source: 'system' },
      { name: 'new', description: '返回新建对话页', source: 'system' },
      { name: 'model', description: '切换当前会话模型', argumentHint: '<model-id>', source: 'system' },
      { name: 'review', description: '进入代码审查意图（输入后发送）', argumentHint: '<scope>', source: 'system' },
      { name: 'deploy', description: '进入发布意图（输入后发送）', argumentHint: '<target>', source: 'system' },
    ];

    const skillNames = (process.env.NEOVATE_DEFAULT_SKILLS || 'zadig-workflow-deploy')
      .split(',')
      .map(name => name.trim())
      .filter(Boolean);
    const skillCommands: SlashCommandMeta[] = skillNames.map(skillName => ({
      name: `skill:${skillName}`,
      description: `调用全局 Skill：${skillName}`,
      argumentHint: '[args]',
      source: 'skill',
      permissions: ['skill:execute'],
    }));

    res.json({
      success: true,
      data: [...systemCommands, ...skillCommands],
    });
  });
  const canReadSession = (session: any, userId?: string) => {
    if (session.visibility === ConversationVisibility.PUBLIC) return true;
    return isCreator(session, userId);
  };

  /**
   * GET /api/conversations/gitlab/branches
   * 获取 GitLab 分支列表与默认分支
   */
  router.get('/gitlab/branches', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const projectId = (req.query.projectId as string) || '';
      if (!projectId) {
        return res.status(400).json({
          success: false,
          error: '缺少 projectId',
        });
      }

      console.log(`[API] 获取 GitLab 分支: projectId=${projectId}, userId=${req.userId}`);

      const result = await branchCacheService.getBranches(projectId, req.userId!);
      console.log(
        `[API] 获取 GitLab 分支完成: projectId=${projectId}, userId=${req.userId}, branchesCount=${result.branches.length}, defaultBranch=${result.defaultBranch || 'N/A'}`
      );
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(
        `[API] 获取 GitLab 分支失败: projectId=${(req.query.projectId as string) || ''}, userId=${req.userId}, error=${error instanceof Error ? error.message : String(error)}`
      );
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取分支列表失败',
      });
    }
  });

  /**
   * POST /api/conversations
   * 创建新的对话会话
   */
  router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { initialPrompt, projectId, baseBranch, model } = req.body;

      console.log('[API] 创建对话请求参数:', {
        initialPrompt: initialPrompt?.substring(0, 50) + '...',
        projectId,
        model,
      });

      if (!initialPrompt) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: initialPrompt',
        });
      }

      if (!projectId) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: projectId',
        });
      }

      let project;
      // 验证项目是否存在
      try {
        const projectResult = await conversationManager.projectService.getProject(projectId, req.userId!);
        if (!projectResult.success || !projectResult.project) {
          return res.status(404).json({
            success: false,
            error: projectResult.error || '项目不存在',
          });
        }
        project = projectResult.project;
      } catch (error) {
        console.error('[API] 验证项目失败:', error);
        return res.status(500).json({
          success: false,
          error: `验证项目失败: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      // 构建完整的 projectInfo
      const projectInfo = {
        projectId,
        projectName: project.name,
        gitRepositoryUrl: project.gitRepositoryUrl,
        workDir: project.workDirectory || project.repoDir,
        gitBranch: baseBranch || project.gitBranch || 'master',
        relevantFiles: [],
      };

      const resolvedModel = resolveModel(model);

      const session = await conversationManager.createSession(
        initialPrompt,
        projectInfo,
        req.userId!,
        resolvedModel
      );

      
      res.status(201).json({
        success: true,
        data: sanitizeSessionForResponse(session),
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '创建会话失败',
      });
    }
  });

  /**
    * GET /api/conversations
    * 获取所有对话会话列表（根据用户权限过滤）
    */
  router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const sessions = await conversationManager.listSessions(userId);
      const responseSessions = sessions.map(session => sanitizeSessionForResponse(session));

      res.json({
        success: true,
        data: responseSessions,
        total: sessions.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取会话列表失败',
      });
    }
  });

  /**
   * GET /api/conversations/:sessionId
   * 获取对话会话详情
   */
  router.get('/:sessionId', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = await conversationManager.getSession(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      if (!canReadSession(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '无权访问该会话',
        });
      }

      res.json({
        success: true,
        data: sanitizeSessionForResponse(session),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取会话详情失败',
      });
    }
  });

  /**
   * GET /api/conversations/:sessionId/messages
   * 获取会话消息历史
   */
  router.get('/:sessionId/messages', requireAuth, async (req: AuthRequest, res: Response) => {
    const requestStart = process.hrtime.bigint();
    const slowThresholdMs = Number(process.env.MESSAGE_HISTORY_SLOW_LOG_MS || 1000);
    let stepSessionMs = 0;
    let stepVersionMs = 0;
    let stepMessagesMs = 0;
    let messagesStart: bigint | null = null;
    let messageCount = 0;
    let etagStatus: 'skip' | 'miss' | 'hit304' = 'skip';

    try {
      const { sessionId } = req.params;
      const since = typeof req.query.since === 'string' ? req.query.since : undefined;
      const ifNoneMatch = req.header('if-none-match');
      const shouldParallelLoadMessages = !(!since && ifNoneMatch);

      let messagesPromise: Promise<any[]> | null = null;
      if (shouldParallelLoadMessages) {
        messagesStart = process.hrtime.bigint();
        messagesPromise = conversationManager.getMessageHistory(sessionId, since);
      }

      const sessionStart = process.hrtime.bigint();
      const session = await conversationManager.getSessionAccessInfo(sessionId);
      stepSessionMs = Number(process.hrtime.bigint() - sessionStart) / 1_000_000;
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      if (!canReadSession(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '无权访问该会话',
        });
      }

      if (!since && ifNoneMatch) {
        const versionStart = process.hrtime.bigint();
        const version = await conversationManager.getMessageHistoryVersion(sessionId);
        stepVersionMs = Number(process.hrtime.bigint() - versionStart) / 1_000_000;
        const latestMs = version.latestTimestamp ? new Date(version.latestTimestamp).getTime() : 0;
        const etag = `W/\"msg-${sessionId}-${version.total}-${latestMs}\"`;
        if (ifNoneMatch === etag) {
          etagStatus = 'hit304';
          return res.status(304).end();
        }
        etagStatus = 'miss';
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      }

      if (!messagesPromise) {
        messagesStart = process.hrtime.bigint();
        messagesPromise = conversationManager.getMessageHistory(sessionId, since);
      }
      const messages = await messagesPromise;
      if (messagesStart) {
        stepMessagesMs = Number(process.hrtime.bigint() - messagesStart) / 1_000_000;
      }
      messageCount = messages.length;

      res.json({
        success: true,
        data: messages,
      });

      const totalMs = Number(process.hrtime.bigint() - requestStart) / 1_000_000;
      const baseLog = [
        '[API][messages]',
        `sessionId=${sessionId}`,
        `since=${since || 'none'}`,
        `etag=${etagStatus}`,
        `count=${messageCount}`,
        `t_session=${stepSessionMs.toFixed(2)}ms`,
        `t_version=${stepVersionMs.toFixed(2)}ms`,
        `t_messages=${stepMessagesMs.toFixed(2)}ms`,
        `total=${totalMs.toFixed(2)}ms`,
      ].join(' ');

      if (totalMs >= slowThresholdMs) {
        console.warn(`${baseLog} slow_threshold=${slowThresholdMs}ms`);
      } else {
        console.log(baseLog);
      }
    } catch (error) {
      const totalMs = Number(process.hrtime.bigint() - requestStart) / 1_000_000;
      const { sessionId } = req.params;
      const since = typeof req.query.since === 'string' ? req.query.since : undefined;
      console.error(
        [
          '[API][messages][error]',
          `sessionId=${sessionId}`,
          `since=${since || 'none'}`,
          `t_session=${stepSessionMs.toFixed(2)}ms`,
          `t_version=${stepVersionMs.toFixed(2)}ms`,
          `t_messages=${stepMessagesMs.toFixed(2)}ms`,
          `total=${totalMs.toFixed(2)}ms`,
          `error=${error instanceof Error ? error.message : String(error)}`,
        ].join(' ')
      );
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取消息历史失败',
      });
    }
  });

  /**
   * GET /api/conversations/:sessionId/review/sidebar
   * 获取 review 侧边栏摘要（只读）
   */
  router.get('/:sessionId/review/sidebar', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = await conversationManager.getSessionAccessInfo(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      if (!canReadSession(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '无权访问该会话',
        });
      }

      const data = await conversationManager.getReviewSidebar(sessionId);
      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取 review 侧边栏失败',
      });
    }
  });

  /**
   * GET /api/conversations/:sessionId/review/files
   * 获取 review 文件列表（只读）
   */
  router.get('/:sessionId/review/files', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = await conversationManager.getSessionAccessInfo(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      if (!canReadSession(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '无权访问该会话',
        });
      }

      const data = await conversationManager.getReviewFiles(sessionId);
      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取 review 文件列表失败',
      });
    }
  });

  /**
   * GET /api/conversations/:sessionId/review/diff
   * 按文件获取 review diff（只读）
   */
  router.get('/:sessionId/review/diff', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const filePath = typeof req.query.filePath === 'string' ? req.query.filePath.trim() : '';
      const roundId = typeof req.query.roundId === 'string' ? req.query.roundId.trim() : undefined;

      if (!filePath) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: filePath',
        });
      }

      const session = await conversationManager.getSessionAccessInfo(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      if (!canReadSession(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '无权访问该会话',
        });
      }

      const data = await conversationManager.getReviewDiff(sessionId, filePath, roundId || undefined);
      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取 review diff 失败',
      });
    }
  });

  /**
   * GET /api/conversations/:sessionId/review/updates?since=
   * 增量获取 review 更新（只读）
   */
  router.get('/:sessionId/review/updates', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const since = typeof req.query.since === 'string' ? req.query.since.trim() : '';
      if (!since) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: since',
        });
      }

      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: '无效的 since 参数，需为可解析时间',
        });
      }

      const session = await conversationManager.getSessionAccessInfo(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      if (!canReadSession(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '无权访问该会话',
        });
      }

      const data = await conversationManager.getReviewUpdates(sessionId, sinceDate.toISOString());
      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取 review 增量更新失败',
      });
    }
  });

  /**
   * POST /api/conversations/:sessionId/messages
   * 发送用户消息（SSE 流式响应）
   */
  router.post('/:sessionId/messages', requireAuth, async (req: AuthRequest, res: Response) => {
    const startTime = dayjs().valueOf();
    console.log(`[conversationRoutes] ========== 开始处理消息 ==========`);

    try {
      const { sessionId } = req.params;
      const { content, model, images } = req.body;

      const normalizedImages = Array.isArray(images)
        ? images.filter(item => item && typeof item.data === 'string' && typeof item.mimeType === 'string')
        : [];
      const trimmedContent = typeof content === 'string' ? content.trim() : '';

      console.log(
        `[conversationRoutes] sessionId: ${sessionId}, content 长度: ${trimmedContent.length}, images: ${normalizedImages.length}`
      );

      if (!trimmedContent && normalizedImages.length === 0) {
        return res.status(400).json({
          success: false,
          error: '消息内容不能为空',
        });
      }

      const step1Start = dayjs().valueOf();
      const session = await conversationManager.getSession(sessionId);
      const step1Time = dayjs().valueOf() - step1Start;
      console.log(`[conversationRoutes] 步骤1: 获取会话完成，耗时 ${step1Time}ms`);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      if (!isCreator(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '只有创建者可以发送消息',
        });
      }

      // 检查会话是否已归档
      if (session.status === ConversationStatus.ARCHIVED) {
        return res.status(403).json({
          success: false,
          error: '已归档的对话不能发送消息',
        });
      }

      const sessionModel = typeof session.context?.variables?.model === 'string'
        ? session.context.variables.model
        : undefined;
      const resolvedModel = resolveModel(model || sessionModel);
      console.log(`[conversationRoutes] 解析执行模型: input=${model || sessionModel || 'none'}, resolved=${resolvedModel}`);

      const step2Start = dayjs().valueOf();
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      res.write(`data: ${JSON.stringify({ type: 'user_message', content: trimmedContent, images: normalizedImages })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'thinking', message: 'AI 正在思考中...' })}\n\n`);
      const step2Time = dayjs().valueOf() - step2Start;
      console.log(`[conversationRoutes] 步骤2: SSE 响应头设置完成，耗时 ${step2Time}ms`);

      const step3Start = dayjs().valueOf();
      console.log(`[conversationRoutes] 步骤3: 开始异步处理...`);

      (async () => {
        try {
          const step3aStart = dayjs().valueOf();
          conversationManager.addMessage(
            sessionId,
            MessageRole.USER,
            trimmedContent,
            normalizedImages.length > 0 ? { images: normalizedImages } : undefined,
            session,
            true
          ).catch(error => {
            console.error(`[conversationRoutes] 异步保存用户消息失败:`, error);
          });
          const step3aTime = dayjs().valueOf() - step3aStart;
          console.log(`[conversationRoutes] 步骤3a: 用户消息异步保存启动，耗时 ${step3aTime}ms`);

          const step3bStart = dayjs().valueOf();
          console.log(`[conversationRoutes] 步骤3b: 开始流式生成 AI 响应...`);

          let fullContent = '';

          const aiResponse = await aiService.generateResponseStream(
            session.context,
            trimmedContent,
            sessionId,
            (chunk: string) => {
              fullContent += chunk;
              res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
            },
            resolvedModel,
            normalizedImages
          );

          const step3bTime = dayjs().valueOf() - step3bStart;
          console.log(`[conversationRoutes] 步骤3b: AI 响应生成完成，耗时 ${step3bTime}ms`);

          const parsedAiResponse = {
            ...aiResponse,
            content: fullContent || aiResponse.content
          };

          conversationManager.addMessage(
            sessionId,
            MessageRole.ASSISTANT,
            parsedAiResponse.content,
            parsedAiResponse.metadata,
            session
          ).catch(error => {
            console.error(`[conversationRoutes] 保存 AI 响应失败:`, error);
          });

          res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
        } catch (error) {
          console.error('[conversationRoutes] 异步处理失败:', error);
          res.write(`data: ${JSON.stringify({ type: 'error', message: '处理失败' })}\n\n`);
        } finally {
          res.end();
          const totalTime = dayjs().valueOf() - startTime;
          console.log(`[conversationRoutes] ========== 消息处理完成，总耗时: ${totalTime}ms ==========`);
        }
      })();

      const step3Time = dayjs().valueOf() - step3Start;
      console.log(`[conversationRoutes] 步骤3: 异步处理启动完成，耗时 ${step3Time}ms`);

    } catch (error) {
      const totalTime = dayjs().valueOf() - startTime;
      console.error(`[conversationRoutes] 消息处理失败，总耗时: ${totalTime}ms:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '发送消息失败',
      });
    }
  });

  /**
   * POST /api/conversations/:sessionId/interrupt
   * 中断当前对话流式响应
   */
  router.post('/:sessionId/interrupt', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = await conversationManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      if (!isCreator(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '只有创建者可以中断对话',
        });
      }

      const canceled = aiService.cancelResponse(sessionId);
      if (!canceled) {
        return res.status(400).json({
          success: false,
          error: '当前没有可中断的流式响应',
        });
      }

      return res.json({
        success: true,
        message: '对话已中断',
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '中断对话失败',
      });
    }
  });

  /**
   * DELETE /api/conversations/:sessionId
   * 删除对话会话
   */
  router.delete('/:sessionId', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;

      const session = await conversationManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      if (!isCreator(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '只有创建者可以删除对话',
        });
      }

      await conversationManager.deleteSession(sessionId);

      res.json({
        success: true,
        message: '会话删除成功',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '删除会话失败',
      });
    }
  });

  /**
   * POST /api/conversations/:sessionId/merge-request
   * 创建 Merge Request
   */
  router.post('/:sessionId/merge-request', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = await conversationManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      if (!isCreator(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '只有创建者可以创建 Merge Request',
        });
      }

      const result = await conversationManager.createMergeRequest(sessionId);

      if (result.success) {
        res.json({
          success: true,
          data: {
            mrUrl: result.mrUrl
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || '创建 Merge Request 失败'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '创建 Merge Request 失败'
      });
    }
  });

   /**
    * POST /api/conversations/:sessionId/archive
    * 归档对话（禁用所有编辑功能，便于清理 worktree）
    */
  router.post('/:sessionId/archive', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { reason } = req.body;

      const session = await conversationManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      if (!isCreator(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '只有创建者可以归档对话',
        });
      }

      await conversationManager.updateSessionStatus(
        sessionId,
        ConversationStatus.ARCHIVED,
        reason || '用户手动归档'
      );

      res.json({
        success: true,
        message: '对话已归档',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '归档对话失败',
      });
    }
  });

  /**
   * PATCH /api/conversations/:sessionId/visibility
   * 更新对话可见性（仅创建者可操作）
   */
  router.patch('/:sessionId/visibility', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { visibility } = req.body;

      if (!visibility || (visibility !== 'private' && visibility !== 'public')) {
        return res.status(400).json({
          success: false,
          error: '无效的可见性值，必须是 "private" 或 "public"',
        });
      }

      const session = await conversationManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      // 验证是否是创建者
      if (!isCreator(session, req.userId)) {
        return res.status(403).json({
          success: false,
          error: '只有对话创建者才能修改可见性',
        });
      }

      // 更新存储中的可见性
      await conversationManager.updateVisibility(sessionId, visibility);

      res.json({
        success: true,
        message: '可见性已更新',
        data: { visibility },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '更新可见性失败',
      });
    }
  });

  return router;
}
