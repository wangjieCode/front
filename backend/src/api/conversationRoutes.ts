import { Router, Request, Response } from 'express';
import { ConversationManager } from '../services/ConversationManager';
import { MessageRouter } from '../services/MessageRouter';
import { ConversationAIService } from '../services/ConversationAIService';
import { MessageParser } from '../utils/MessageParser';
import { MessageRole } from '../types';

/**
 * 创建对话路由
 */
export function createConversationRoutes(
  conversationManager: ConversationManager,
  messageRouter: MessageRouter,
  aiService: ConversationAIService
): Router {
  const router = Router();

  /**
   * POST /api/conversations
   * 创建新的对话会话
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { taskId, initialPrompt, taskDescription, projectInfo } = req.body;

      // 兼容 initialPrompt 和 taskDescription 两种参数名
      const prompt = initialPrompt || taskDescription;

      if (!taskId || !prompt) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: taskId 和 initialPrompt/taskDescription',
        });
      }

      if (!projectInfo || !projectInfo.workDir) {
        return res.status(400).json({
          success: false,
          error: '缺少项目信息: projectInfo.workDir',
        });
      }

      const session = await conversationManager.createSession(
        taskId,
        prompt,
        projectInfo
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
  router.get('/', async (req: Request, res: Response) => {
    try {
      const sessions = await conversationManager.listSessions();

      res.json({
        success: true,
        data: sessions,
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
  router.get('/:sessionId', async (req: Request, res: Response) => {
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
   * POST /api/conversations/:sessionId/messages
   * 发送用户消息
   */
  router.post('/:sessionId/messages', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { content, branchId } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          error: '消息内容不能为空',
        });
      }

      const session = await conversationManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      // 如果指定了分支,先切换分支
      if (branchId && branchId !== session.context.currentBranchId) {
        await conversationManager.switchBranch(sessionId, branchId);
      }

      // 处理用户消息
      await messageRouter.handleUserMessage(sessionId, content);

      // 获取用户消息
      const messages = await conversationManager.getMessageHistory(sessionId);
      const userMessage = messages[messages.length - 1];

      // 同步生成 AI 响应
      try {
        const updatedSession = await conversationManager.getSession(sessionId);
        if (updatedSession) {
          const aiResponse = await aiService.generateResponse(
            updatedSession.context,
            content,
            sessionId  // 传递 sessionId 用于会话管理
          );
          await messageRouter.handleAIResponse(sessionId, aiResponse);
        }
      } catch (error) {
        console.error('生成 AI 响应失败:', error);
      }

      // 返回所有消息（包括AI回复）
      const allMessages = await conversationManager.getMessageHistory(sessionId);

      res.json({
        success: true,
        data: allMessages,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '发送消息失败',
      });
    }
  });

  /**
   * GET /api/conversations/:sessionId/messages
   * 获取对话历史
   */
  router.get('/:sessionId/messages', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { branchId, since } = req.query;

      const session = await conversationManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      let messages = await conversationManager.getMessageHistory(
        sessionId,
        branchId as string | undefined
      );

      // 如果指定了 since 参数,只返回该时间之后的消息
      if (since) {
        const sinceDate = new Date(since as string);
        messages = messages.filter(m => m.timestamp > sinceDate);
      }

      res.json({
        success: true,
        data: messages,
        total: messages.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取消息历史失败',
      });
    }
  });

  /**
   * GET /api/conversations/:sessionId/messages/:messageId
   * 获取单条消息详情
   */
  router.get('/:sessionId/messages/:messageId', async (req: Request, res: Response) => {
    try {
      const { sessionId, messageId } = req.params;

      const message = await conversationManager.getMessage(sessionId, messageId);
      if (!message) {
        return res.status(404).json({
          success: false,
          error: '消息不存在',
        });
      }

      res.json({
        success: true,
        data: message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取消息详情失败',
      });
    }
  });

  /**
   * GET /api/conversations/:sessionId/status
   * 获取会话当前状态(用于轮询)
   */
  router.get('/:sessionId/status', async (req: Request, res: Response) => {
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
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

      // 检查是否有待回答的问题
      const pendingQuestion = await messageRouter.getPendingQuestion(sessionId);

      res.json({
        success: true,
        data: {
          status: session.status,
          lastMessageId: lastMessage?.id,
          hasNewMessages: messages.length > 0,
          pendingQuestion,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取状态失败',
      });
    }
  });

  /**
   * POST /api/conversations/:sessionId/branches
   * 创建新分支
   */
  router.post('/:sessionId/branches', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { fromMessageId, branchName } = req.body;

      if (!fromMessageId || !branchName) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: fromMessageId 和 branchName',
        });
      }

      const branch = await conversationManager.createBranch(
        sessionId,
        fromMessageId,
        branchName
      );

      res.status(201).json({
        success: true,
        data: branch,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : '创建分支失败',
      });
    }
  });

  /**
   * PUT /api/conversations/:sessionId/branches/:branchId/activate
   * 切换到指定分支
   */
  router.put('/:sessionId/branches/:branchId/activate', async (req: Request, res: Response) => {
    try {
      const { sessionId, branchId } = req.params;

      await conversationManager.switchBranch(sessionId, branchId);

      const session = await conversationManager.getSession(sessionId);

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : '切换分支失败',
      });
    }
  });

  /**
   * GET /api/conversations/:sessionId/branches
   * 获取所有分支
   */
  router.get('/:sessionId/branches', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      const branches = await conversationManager.getBranches(sessionId);

      res.json({
        success: true,
        data: branches,
        total: branches.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取分支列表失败',
      });
    }
  });

  return router;
}
