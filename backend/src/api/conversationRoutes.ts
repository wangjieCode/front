import { Router, Request, Response } from 'express';
import { ConversationManager } from '../services/ConversationManager';
import { MessageRouter } from '../services/MessageRouter';
import { ConversationAIService } from '../services/ConversationAIService';
import { requireAuth, AuthRequest } from './authMiddleware';

/**
 * 解析 AI 响应内容，提取可读文本
 * neovate stream-json 格式：每行一个 JSON 对象
 */
function parseAIResponse(content: string): string {
  // 确保 content 是字符串
  if (typeof content !== 'string') {
    console.log('[parseAIResponse] content 不是字符串，类型:', typeof content);
    content = JSON.stringify(content);
  }

  console.log('[parseAIResponse] 原始内容长度:', content.length);

  // stream-json 格式：每行一个 JSON 对象
  const lines = content.trim().split('\n').filter(line => line.trim());
  console.log('[parseAIResponse] 总行数:', lines.length);

  let allText = '';
  let assistantCount = 0;

  for (const line of lines) {
    try {
      const event = JSON.parse(line);

      // 提取 assistant 的文本内容
      let hasContent = false;
      if (event.role === 'assistant' && event.content) {
        assistantCount++;
        // content 是一个数组，包含多个内容块
        if (Array.isArray(event.content)) {
          for (const block of event.content) {
            if (block.type === 'text' && block.text) {
              allText += block.text + '\n\n';
              hasContent = true;
            }
          }
        }
      }

      // 也提取 text 字段（某些版本可能直接有 text），但仅当没有从 content 提取到内容时
      if (!hasContent && event.role === 'assistant' && event.text) {
        allText += event.text + '\n\n';
      }
    } catch (e) {
      // 跳过无法解析的行
      console.log('[parseAIResponse] 跳过无法解析的行:', line.substring(0, 100));
    }
  }

  console.log('[parseAIResponse] 找到', assistantCount, '个 assistant 消息');

  if (allText) {
    console.log('[parseAIResponse] 提取的文本长度:', allText.length);
    return allText.trim();
  }

  console.log('[parseAIResponse] 未找到 assistant 文本内容');
  return 'AI 未返回可显示的内容';
}

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
  router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { initialPrompt, taskDescription, mode } = req.body;

      // 兼容 initialPrompt 和 taskDescription 两种参数名
      const prompt = initialPrompt || taskDescription;

      if (!prompt) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: initialPrompt/taskDescription',
        });
      }

      // 自动生成 taskId
      const taskId = `task-${Date.now()}`;

      // 使用环境变量的 workDir（worktree 会自动管理）
      const projectInfo = {
        workDir: process.env.LOCAL_GIT_WORK_DIR || process.env.REMOTE_GIT_WORK_DIR || process.env.GIT_WORK_DIR || '',
      };

      // 验证 mode 参数（如果提供）
      if (mode && mode !== 'edit' && mode !== 'readonly') {
        return res.status(400).json({
          success: false,
          error: '无效的 mode 参数，必须是 "edit" 或 "readonly"',
        });
      }

      const session = await conversationManager.createSession(
        taskId,
        prompt,
        projectInfo,
        mode,
        req.userId
      );

      // 只创建会话，不自动生成响应
      // 前端需要调用 POST /api/conversations/:sessionId/messages 来流式获取响应
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
   * 发送用户消息（SSE 流式响应）
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

      // 设置 SSE 响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // 发送用户消息确认
      res.write(`data: ${JSON.stringify({ type: 'user_message', content })}\n\n`);

      // 生成 AI 响应（流式）
      try {
        const updatedSession = await conversationManager.getSession(sessionId);
        if (updatedSession) {
          const aiResponse = await aiService.generateResponse(
            updatedSession.context,
            content,
            sessionId
          );

          // 解析 AI 响应并流式发送
          const parsedContent = parseAIResponse(aiResponse.content);

          // 按较大的块发送（平衡流畅度和性能）
          const chunkSize = 50; // 每次发送 50 个字符
          for (let i = 0; i < parsedContent.length; i += chunkSize) {
            const chunk = parsedContent.slice(i, i + chunkSize);
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);

            // 减少延迟，提高响应速度
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          // 保存 AI 响应
          await messageRouter.handleAIResponse(sessionId, aiResponse);

          // 发送完成信号
          res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
        }
      } catch (error) {
        console.error('生成 AI 响应失败:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: '生成响应失败' })}\n\n`);
      }

      res.end();
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

  /**
   * DELETE /api/conversations/:sessionId
   * 删除对话会话
   */
  router.delete('/:sessionId', async (req: Request, res: Response) => {
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
        message: '会话已删除',
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
   * 为会话创建 Merge Request（编辑模式）
   */
  router.post('/:sessionId/merge-request', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      const session = await conversationManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      const result = await conversationManager.createMergeRequest(sessionId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        data: {
          mrUrl: result.mrUrl,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '创建 MR 失败',
      });
    }
  });

  return router;
}
