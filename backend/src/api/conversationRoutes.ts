import { Router, Request, Response } from 'express';
import { ConversationManager } from '../services/ConversationManager';
import { MessageRouter } from '../services/MessageRouter';
import { ConversationAIService } from '../services/ConversationAIService';
import { ConversationStatus } from '../types';
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
  // 获取 ConversationManager 中的 ProjectService 实例
  const projectService = (conversationManager as any).projectService;
  const router = Router();

  /**
   * POST /api/conversations
   * 创建新的对话会话
   */
  router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { initialPrompt, taskId, mode, projectId } = req.body;
      
      console.log('[API] 创建对话请求参数:', {
        initialPrompt: initialPrompt?.substring(0, 50) + '...',
        taskId,
        mode,
        projectId
      });

      if (!initialPrompt) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: initialPrompt',
        });
      }

      if (!taskId) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: taskId',
        });
      }

      if (!projectId) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: projectId',
        });
      }

      // 验证项目是否存在
      try {
        console.log('[API] 验证项目:', projectId, '用户:', req.userId);
        const projectResult = await projectService.getProject(projectId, req.userId!);
        console.log('[API] 项目验证结果:', projectResult);
        if (!projectResult.success || !projectResult.project) {
          return res.status(404).json({
            success: false,
            error: projectResult.error || '项目不存在',
          });
        }
      } catch (error) {
        console.error('[API] 验证项目失败:', error);
        console.error('[API] 错误堆栈:', error instanceof Error ? error.stack : error);
        return res.status(500).json({
          success: false,
          error: `验证项目失败: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      // 构建 projectInfo，ConversationManager 会进一步完善
      const projectInfo = {
        projectId,
        projectName: '', // 将在 ConversationManager 中填充
        gitRepositoryUrl: '', // 将在 ConversationManager 中填充
        workDir: '', // 将在 ConversationManager 中填充
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
        initialPrompt,
        projectInfo,
        mode,
        req.userId!
      );

      // 发送第一条用户消息并生成AI回复
      try {
        console.log('[API] 发送第一条用户消息:', initialPrompt.substring(0, 50) + '...');
        await messageRouter.handleUserMessage(session.id, initialPrompt);
        console.log('[API] 第一条用户消息发送成功');

        // 立即生成AI回复
        console.log('[API] 开始生成AI回复...');
        await conversationManager.updateSessionStatus(session.id, ConversationStatus.EXECUTING);
        
        const updatedSession = await conversationManager.getSession(session.id);
        if (updatedSession) {
          const aiResponse = await aiService.generateResponse(
            updatedSession.context,
            initialPrompt,
            session.id
          );
          
          await messageRouter.handleAIResponse(session.id, aiResponse);
          await conversationManager.updateSessionStatus(session.id, ConversationStatus.COMPLETED);
          console.log('[API] AI回复生成完成');
        }
      } catch (messageError) {
        console.error('[API] 发送第一条消息或生成AI回复失败:', messageError);
        await conversationManager.updateSessionStatus(
          session.id, 
          ConversationStatus.FAILED, 
          messageError instanceof Error ? messageError.message : String(messageError)
        );
        // 不阻断会话创建，只记录错误
      }

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
   * 获取所有对话会话列表（简化版）
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const sessions = await conversationManager.listSessions();

      // 转换为简化版响应
      const simplifiedSessions = sessions.map(session => {
        // 使用 taskDescription 作为对话概览
        const overview = session.context.taskDescription;
        
        // 确保项目信息正确
        const projectInfo = {
          projectId: session.context.projectInfo.projectId,
          projectName: session.context.projectInfo.projectName,
          gitRepositoryUrl: session.context.projectInfo.gitRepositoryUrl,
          workDir: session.context.projectInfo.workDir,
          gitBranch: session.context.projectInfo.gitBranch,
        };
        
        return {
          id: session.id,
          taskId: session.taskId,
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
          console.log(`[conversationRoutes] 传递给AI的context - projectInfo.workDir: ${updatedSession.context?.projectInfo?.workDir}`);
          console.log(`[conversationRoutes] 传递给AI的context - 完整projectInfo:`, JSON.stringify(updatedSession.context?.projectInfo, null, 2));
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

  return router;
}