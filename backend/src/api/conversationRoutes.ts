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
   * GET /api/conversations/:sessionId/messages
   * 获取会话消息历史
   */
  router.get('/:sessionId/messages', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { branchId } = req.query;

      // 验证会话是否存在
      const session = await conversationManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      // 获取消息历史
      const messages = await conversationManager.getMessageHistory(
        sessionId,
        typeof branchId === 'string' ? branchId : undefined
      );

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
      const { content, branchId } = req.body;

      console.log(`[conversationRoutes] sessionId: ${sessionId}, content 长度: ${content?.length || 0}`);

      if (!content) {
        return res.status(400).json({
          success: false,
          error: '消息内容不能为空',
        });
      }

      // 步骤1: 获取会话（只获取一次，后续复用）
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

      // 步骤2: 切换分支（如果需要）
      if (branchId && branchId !== session.context.currentBranchId) {
        const step2Start = Date.now();
        await conversationManager.switchBranch(sessionId, branchId);
        const step2Time = Date.now() - step2Start;
        console.log(`[conversationRoutes] 步骤2: 切换分支完成，耗时 ${step2Time}ms`);
        // 更新本地会话对象的分支ID，避免重新查询
        session.context.currentBranchId = branchId;
      }

      // 步骤3: 设置 SSE 响应头（提前设置，让用户更快看到响应）
      const step3Start = Date.now();
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // 发送用户消息确认
      res.write(`data: ${JSON.stringify({ type: 'user_message', content })}\n\n`);
      // 立即发送"正在思考"状态
      res.write(`data: ${JSON.stringify({ type: 'thinking', message: 'AI 正在思考中...' })}\n\n`);
      const step3Time = Date.now() - step3Start;
      console.log(`[conversationRoutes] 步骤3: SSE 响应头设置完成，耗时 ${step3Time}ms`);

      // 步骤4: 异步处理用户消息和AI响应（不阻塞响应）
      const step4Start = Date.now();
      console.log(`[conversationRoutes] 步骤4: 开始异步处理...`);

      // 异步处理，不等待完成
      (async () => {
        try {
          // 4a: 处理用户消息（传递已存在的会话对象）
          const step4aStart = Date.now();
          await messageRouter.handleUserMessage(sessionId, content, session);
          const step4aTime = Date.now() - step4aStart;
          console.log(`[conversationRoutes] 步骤4a: 处理用户消息完成，耗时 ${step4aTime}ms`);

          // 4b: 生成 AI 响应（使用已有的会话对象，避免重新查询）
          const step4bStart = Date.now();
          console.log(`[conversationRoutes] 步骤4b: 开始生成 AI 响应...`);

          // 设置 30 秒超时
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('AI 响应超时')), 30000);
          });

          const aiResponsePromise = aiService.generateResponse(
            session.context, // 直接使用已获取的会话上下文
            content,
            sessionId
          );

          try {
            const aiResponse = await Promise.race([aiResponsePromise, timeoutPromise]);
            const step4bTime = Date.now() - step4bStart;
            console.log(`[conversationRoutes] 步骤4b: AI 响应生成完成，耗时 ${step4bTime}ms`);

            // 4c: 解析和发送响应
            const step4cStart = Date.now();
            const parsedContent = parseAIResponse(aiResponse.content);
            console.log(`[conversationRoutes] 步骤4c: AI 响应解析完成，内容长度: ${parsedContent.length}`);

            // 流式发送响应
            const chunkSize = 100; // 增大块大小，减少网络开销
            for (let i = 0; i < parsedContent.length; i += chunkSize) {
              const chunk = parsedContent.slice(i, i + chunkSize);
              res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
              // 减少延迟
              if (i % 500 === 0) { // 每500字符暂停一次，减少CPU占用
                await new Promise(resolve => setTimeout(resolve, 5));
              }
            }
            const step4cTime = Date.now() - step4cStart;
            console.log(`[conversationRoutes] 步骤4c: 流式发送完成，耗时 ${step4cTime}ms`);

            // 4d: 异步保存 AI 响应（不阻塞用户体验，传递会话对象）
            const step4dStart = Date.now();
            messageRouter.handleAIResponse(sessionId, aiResponse, session).then(() => {
              const step4dTime = Date.now() - step4dStart;
              console.log(`[conversationRoutes] 步骤4d: 保存 AI 响应完成，耗时 ${step4dTime}ms`);
            }).catch(error => {
              console.error(`[conversationRoutes] 保存 AI 响应失败:`, error);
            });

            // 发送完成信号
            res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
          } catch (timeoutError) {
            const step4bTime = Date.now() - step4bStart;
            console.error(`[conversationRoutes] AI 响应超时，耗时 ${step4bTime}ms:`, timeoutError);
            res.write(`data: ${JSON.stringify({
              type: 'chunk',
              content: '抱歉，AI 响应时间较长，请稍后再试。您可以重新发送消息或等待系统处理完成。'
            })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
          }
        } catch (error) {
          console.error('[conversationRoutes] 异步处理失败:', error);
          res.write(`data: ${JSON.stringify({ type: 'error', message: '处理失败' })}\n\n`);
        } finally {
          res.end();
          const totalTime = Date.now() - startTime;
          console.log(`[conversationRoutes] ========== 消息处理完成，总耗时: ${totalTime}ms ==========`);
        }
      })();

      const step4Time = Date.now() - step4Start;
      console.log(`[conversationRoutes] 步骤4: 异步处理启动完成，耗时 ${step4Time}ms`);

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

      // 验证会话是否存在
      const session = await conversationManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      // 验证用户权限（只有会话创建者可以删除）
      if (session.userId !== req.userId) {
        return res.status(403).json({
          success: false,
          error: '无权限删除该会话',
        });
      }

      // 删除会话
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

  return router;
}