import { Router, Request, Response } from 'express';
import { ConversationManager } from '../services/ConversationManager';
import { MessageRouter } from '../services/MessageRouter';
import { ConversationAIService } from '../services/ConversationAIService';
import { ConversationStatus } from '../types';
import { requireAuth, AuthRequest } from './authMiddleware';

/**
 * 创建对话路由
 */
export function createConversationRoutes(
  conversationManager: ConversationManager,
  messageRouter: MessageRouter,
  aiService: ConversationAIService
): Router {
  // 获取 ConversationManager 中的 ProjectService 实例
  const projectService = (conversationManager as any).projectService;
  const router = Router();

  /**
   * POST /api/conversations
   * 创建新的对话会话
   */
  router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { initialPrompt, mode, projectId } = req.body;

      console.log('[API] 创建对话请求参数:', {
        initialPrompt: initialPrompt?.substring(0, 50) + '...',
        mode,
        projectId
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
        const projectResult = await projectService.getProject(projectId, req.userId!);
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
        gitBranch: project.gitBranch || 'master',
        relevantFiles: [],
      };

      // 验证 mode 参数
      if (mode && mode !== 'edit' && mode !== 'readonly') {
        return res.status(400).json({
          success: false,
          error: '无效的 mode 参数，必须是 "edit" 或 "readonly"',
        });
      }

      const session = await conversationManager.createSession(
        initialPrompt,
        projectInfo,
        mode,
        req.userId!
      );

      
      res.status(201).json({
        success: true,
        data: session,
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
   * 获取所有对话会话列表
   */
  router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const sessions = await conversationManager.listSessions();
      const simplifiedSessions = sessions.map(session => {
        const overview = session.context.taskDescription;

        const projectInfo = {
          projectId: session.context.projectInfo.projectId,
          projectName: session.context.projectInfo.projectName,
          gitRepositoryUrl: session.context.projectInfo.gitRepositoryUrl,
          workDir: session.context.projectInfo.workDir,
          gitBranch: session.context.projectInfo.gitBranch,
        };

        return {
          id: session.id,
          projectInfo: projectInfo,
          mode: session.context.mode,
          overview: overview,
          status: session.status,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        };
      });

      res.json({
        success: true,
        data: simplifiedSessions,
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

      res.json({
        success: true,
        data: session,
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
    try {
      const { sessionId } = req.params;

      const session = await conversationManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      const messages = await conversationManager.getMessageHistory(sessionId);

      res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取消息历史失败',
      });
    }
  });

  /**
   * POST /api/conversations/:sessionId/messages
   * 发送用户消息（SSE 流式响应）
   */
  router.post('/:sessionId/messages', async (req: Request, res: Response) => {
    const startTime = Date.now();
    console.log(`[conversationRoutes] ========== 开始处理消息 ==========`);

    try {
      const { sessionId } = req.params;
      const { content } = req.body;

      console.log(`[conversationRoutes] sessionId: ${sessionId}, content 长度: ${content?.length || 0}`);

      if (!content) {
        return res.status(400).json({
          success: false,
          error: '消息内容不能为空',
        });
      }

      const step1Start = Date.now();
      const session = await conversationManager.getSession(sessionId);
      const step1Time = Date.now() - step1Start;
      console.log(`[conversationRoutes] 步骤1: 获取会话完成，耗时 ${step1Time}ms`);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      // 检查会话是否已归档
      if (session.status === ConversationStatus.ARCHIVED) {
        return res.status(403).json({
          success: false,
          error: '已归档的对话不能发送消息',
        });
      }

      const step2Start = Date.now();
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      res.write(`data: ${JSON.stringify({ type: 'user_message', content })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'thinking', message: 'AI 正在思考中...' })}\n\n`);
      const step2Time = Date.now() - step2Start;
      console.log(`[conversationRoutes] 步骤2: SSE 响应头设置完成，耗时 ${step2Time}ms`);

      const step3Start = Date.now();
      console.log(`[conversationRoutes] 步骤3: 开始异步处理...`);

      (async () => {
        try {
          const step3aStart = Date.now();
          messageRouter.handleUserMessage(sessionId, content, session, true).catch(error => {
            console.error(`[conversationRoutes] 异步保存用户消息失败:`, error);
          });
          const step3aTime = Date.now() - step3aStart;
          console.log(`[conversationRoutes] 步骤3a: 用户消息异步保存启动，耗时 ${step3aTime}ms`);

          const step3bStart = Date.now();
          console.log(`[conversationRoutes] 步骤3b: 开始流式生成 AI 响应...`);

          let fullContent = '';

          const aiResponse = await aiService.generateResponseStream(
            session.context,
            content,
            sessionId,
            (chunk: string) => {
              fullContent += chunk;
              res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
            }
          );

          const step3bTime = Date.now() - step3bStart;
          console.log(`[conversationRoutes] 步骤3b: AI 响应生成完成，耗时 ${step3bTime}ms`);

          const parsedAiResponse = {
            ...aiResponse,
            content: fullContent || aiResponse.content
          };

          messageRouter.handleAIResponse(sessionId, parsedAiResponse, session).catch(error => {
            console.error(`[conversationRoutes] 保存 AI 响应失败:`, error);
          });

          res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
        } catch (error) {
          console.error('[conversationRoutes] 异步处理失败:', error);
          res.write(`data: ${JSON.stringify({ type: 'error', message: '处理失败' })}\n\n`);
        } finally {
          res.end();
          const totalTime = Date.now() - startTime;
          console.log(`[conversationRoutes] ========== 消息处理完成，总耗时: ${totalTime}ms ==========`);
        }
      })();

      const step3Time = Date.now() - step3Start;
      console.log(`[conversationRoutes] 步骤3: 异步处理启动完成，耗时 ${step3Time}ms`);

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[conversationRoutes] 消息处理失败，总耗时: ${totalTime}ms:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '发送消息失败',
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
      const { targetBranch } = req.body;

      const result = await conversationManager.createMergeRequest(sessionId, targetBranch);

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


  return router;
}