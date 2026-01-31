import {
  ConversationContext,
  ConversationMode,
  AIResponse,
  MessageMetadata,
  ToolCall,
  CodeChange,
} from '../types';
import { NeovateAIService, NeovateAIResult } from './NeovateAIService';
import { NeovateSessionManagerDB } from './NeovateSessionManagerDB';
import { GitService } from './GitService';
import { GitLabMCPService } from './GitLabMCPService';
import dayjs from 'dayjs';
import { DEFAULT_NEOVATE_MODEL } from '../constants/neovateModels';

/**
 * 对话 AI 服务类
 * 负责生成 AI 响应、判断是否需要询问用户等
 */
export class ConversationAIService {
  private neovateService: NeovateAIService;
  private sessionManager: NeovateSessionManagerDB;
  private gitService: GitService;
  private gitlabService: GitLabMCPService;

  constructor(
    neovateService: NeovateAIService,
    databaseUrl: string,
    gitService: GitService,
    gitlabService: GitLabMCPService
  ) {
    this.neovateService = neovateService;
    this.sessionManager = new NeovateSessionManagerDB(databaseUrl);
    this.gitService = gitService;
    this.gitlabService = gitlabService;
  }

  /**
   * 生成 AI 响应（流式版本）
   */
  async generateResponseStream(
    context: ConversationContext,
    userMessage: string,
    sessionId: string,
    onChunk: (chunk: string) => void,
    modelOverride?: string
  ): Promise<AIResponse> {
    try {
      console.log(`[ConversationAIService] 流式生成响应 - sessionId: ${sessionId}`);

      // 查询 Neovate 会话 ID
      let neovateSessionId: string | undefined;
      try {
        const existingSessionId = await this.sessionManager.getSessionId(sessionId);
        if (existingSessionId) {
          neovateSessionId = existingSessionId;
        }
      } catch (error) {
        console.error('[ConversationAIService] 查询会话 ID 失败:', error);
      }

      const projectWorkDir = context.mode === ConversationMode.EDIT && context.projectInfo.worktreePath
        ? context.projectInfo.worktreePath
        : context.projectInfo.workDir;
      const selectedModel = modelOverride
        || (typeof context.variables?.model === 'string' ? context.variables.model : DEFAULT_NEOVATE_MODEL);
      
      // 调用流式 AI 服务
      const result = await this.neovateService.modifyCodeStream(
        userMessage,
        sessionId,
        neovateSessionId,
        projectWorkDir,
        onChunk,
        selectedModel
      );

      // 编辑模式：异步提交变更（不阻塞响应）
      if (context.mode === ConversationMode.EDIT && result.success && result.changes.length > 0) {
        this.commitChanges(context, userMessage).catch(error => {
          console.error(`[ConversationAIService] 异步提交变更失败:`, error);
        });
      }

      const metadata: MessageMetadata = {
        codeChanges: result.changes,
        toolCalls: this.extractToolCalls(result),
        gitBranch: context.gitBranch,
        mrUrl: context.mrUrl,
      };

      let content = '';
      if (result.success) {
        content = result.rawOutput || result.message;
      } else {
        content = `执行失败: ${result.error || result.message}`;
      }

      return {
        content,
        metadata,
        shouldPause: false,
      };
    } catch (error) {
      return {
        content: `发生错误: ${error instanceof Error ? error.message : String(error)}`,
        shouldPause: false,
        metadata: {},
      };
    }
  }

  /**
   * 生成 AI 响应
   */
  async generateResponse(
    context: ConversationContext,
    userMessage: string,
    sessionId: string,
    modelOverride?: string
  ): Promise<AIResponse> {
    try {
      console.log(`[ConversationAIService] 生成响应 - sessionId: ${sessionId}`);
      // console.log(`[ConversationAIService] 模式: ${context.mode}`);
      // console.log(`[ConversationAIService] 用户消息: ${userMessage.substring(0, 100)}`);

      // 检查是否需要询问用户（现阶段总是返回 false）
      if (this.shouldAskUser(context, userMessage)) {
        const question = this.generateClarificationQuestion(context, userMessage);
        return {
          content: question,
          shouldPause: true,
          metadata: {
            isQuestion: true,
            requiresResponse: true,
          },
        };
      }

      // 查询是否存在 Neovate 会话 ID
      let neovateSessionId: string | undefined;
      try {
        const existingSessionId = await this.sessionManager.getSessionId(sessionId);
        if (existingSessionId) {
          neovateSessionId = existingSessionId;
          // console.log(`[ConversationAIService] ✅ 找到现有 Neovate 会话: ${existingSessionId}`);
        } else {
          // console.log(`[ConversationAIService] ℹ️ 未找到现有会话，将创建新会话`);
        }
      } catch (error) {
        console.error('[ConversationAIService] ❌ 查询会话 ID 失败:', error);
      }

      // 调用 AI 服务处理消息（传递 Neovate 会话 ID 和正确的工作目录）
      const projectWorkDir = context.mode === ConversationMode.EDIT && context.projectInfo.worktreePath
        ? context.projectInfo.worktreePath
        : context.projectInfo.workDir;
      const selectedModel = modelOverride
        || (typeof context.variables?.model === 'string' ? context.variables.model : DEFAULT_NEOVATE_MODEL);
      // console.log(`[ConversationAIService] 调用 NeovateAIService - conversationId: ${sessionId}, neovateSessionId: ${neovateSessionId || '无'}`);
      // console.log(`[ConversationAIService] context.projectInfo:`, JSON.stringify(context.projectInfo, null, 2));
      // console.log(`[ConversationAIService] projectWorkDir: ${projectWorkDir}`);
      // console.log(`[ConversationAIService] context.workDir: ${context.workDir}`);
      const result = await this.neovateService.modifyCode(
        userMessage,
        sessionId,
        neovateSessionId,
        projectWorkDir,
        selectedModel
      );

      // 编辑模式：异步提交变更（不阻塞响应）
      if (context.mode === ConversationMode.EDIT && result.success && result.changes.length > 0) {
        this.commitChanges(context, userMessage).catch(error => {
          console.error(`[ConversationAIService] 异步提交变更失败:`, error);
        });
      }

      // 构建响应元数据（包含 context 中已有的 gitBranch 和 mrUrl）
      const metadata: MessageMetadata = {
        codeChanges: result.changes,
        toolCalls: this.extractToolCalls(result),
        gitBranch: context.gitBranch,
        mrUrl: context.mrUrl,
      };

      // 返回原始输出，让前端来解析
      let content = '';
      if (result.success) {
        if (result.rawOutput) {
          // 直接返回原始输出，前端会解析 stream-json 格式
          content = result.rawOutput;
        } else {
          // 没有原始输出，使用默认消息
          content = result.message;
          if (result.changes.length > 0) {
            content += `\n\n已完成 ${result.changes.length} 个文件的修改。`;
          }
        }
      } else {
        content = `执行失败: ${result.error || result.message}`;
      }

      return {
        content,
        metadata,
        shouldPause: false,
      };
    } catch (error) {
      return {
        content: `发生错误: ${error instanceof Error ? error.message : String(error)}`,
        shouldPause: false,
        metadata: {},
      };
    }
  }

  /**
   * 提交变更
   */
  private async commitChanges(
    context: ConversationContext,
    userMessage: string
  ): Promise<void> {
    try {
      const workDir = context.mode === ConversationMode.EDIT && context.projectInfo.worktreePath
        ? context.projectInfo.worktreePath
        : context.projectInfo.workDir;

      // 添加所有变更
      await this.gitService.addAll(workDir);

      // 提交变更
      const commitMessage = `AI: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`;
      const commitResult = await this.gitService.commit(commitMessage, workDir);

      if (!commitResult.success) {
        console.warn(`[ConversationAIService] 提交未成功，跳过推送: ${commitResult.message}`);
        return;
      }

      const status = await this.gitService.getStatus(workDir);
      const branchToPush = status.currentBranch || context.gitBranch;
      if (!branchToPush) {
        console.warn('[ConversationAIService] 未获取到当前分支，跳过推送');
        return;
      }

      const pushResult = await this.gitService.push(
        branchToPush,
        'origin',
        false,
        workDir
      );
      if (!pushResult.success) {
        const upstreamResult = await this.gitService.pushWithUpstream(
          branchToPush,
          'origin',
          workDir
        );
        if (!upstreamResult.success) {
          console.error('[ConversationAIService] 推送失败:', upstreamResult.error || upstreamResult.message);
        }
      }
      // console.log(`[ConversationAIService] ✅ 变更已提交并推送`);
    } catch (error) {
      console.error(`[ConversationAIService] ❌ 提交变更失败:`, error);
    }
  }

  /**
   * 判断是否需要询问用户
   * 现阶段：直接让所有消息都发送给 AI 处理，不做拦截
   */
  shouldAskUser(context: ConversationContext, userMessage: string): boolean {
    // 现阶段不需要处理，直接返回 false，让 AI 处理所有消息
    return false;
  }

  /**
   * 生成澄清问题
   */
  generateClarificationQuestion(
    context: ConversationContext,
    userMessage: string
  ): string {
    // 根据不同情况生成不同的问题
    if (userMessage.trim().length < 10) {
      return '请提供更详细的描述,你希望我做什么?';
    }

    if (!context.projectInfo.workDir) {
      return '请指定工作目录路径。';
    }

    // 默认问题
    return '我需要更多信息才能继续。请详细说明你的需求,包括:\n1. 要修改哪些文件?\n2. 具体要做什么修改?\n3. 有什么特殊要求?';
  }

  /**
   * 从 AI 结果中提取工具调用信息
   */
  private extractToolCalls(result: NeovateAIResult): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // 记录代码修改工具调用
    if (result.changes.length > 0) {
      toolCalls.push({
        toolName: 'code_modification',
        parameters: {
          filesModified: result.changes.map(c => c.filePath),
        },
        result: {
          success: result.success,
          changesCount: result.changes.length,
        },
        timestamp: dayjs().toDate(),
      });
    }

    return toolCalls;
  }

  /**
   * 流式生成响应(占位符,未来实现)
   */
  async streamResponse(
    context: ConversationContext,
    userMessage: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    // 目前使用非流式实现
    const response = await this.generateResponse(context, userMessage, sessionId);
    onChunk(response.content);
  }

  /**
   * 检测用户消息中的风险
   */
  detectRisks(userMessage: string): string[] {
    const risks: string[] = [];

    // 检测危险操作
    const dangerousKeywords = [
      '删除所有',
      'rm -rf',
      'drop database',
      '格式化',
      '清空',
    ];

    for (const keyword of dangerousKeywords) {
      if (userMessage.toLowerCase().includes(keyword.toLowerCase())) {
        risks.push(`检测到潜在危险操作: "${keyword}"`);
      }
    }

    return risks;
  }

  /**
   * 生成风险警告消息
   */
  generateRiskWarning(risks: string[]): string {
    let warning = '⚠️ 警告:检测到以下潜在风险:\n\n';
    risks.forEach((risk, index) => {
      warning += `${index + 1}. ${risk}\n`;
    });
    warning += '\n是否继续执行?请回复"是"或"否"。';
    return warning;
  }

  /**
   * 生成选项问题
   */
  generateOptionsQuestion(
    question: string,
    options: string[]
  ): AIResponse {
    let content = question + '\n\n请选择:\n';
    options.forEach((option, index) => {
      content += `${index + 1}. ${option}\n`;
    });

    return {
      content,
      shouldPause: true,
      metadata: {
        isQuestion: true,
        questionOptions: options,
        requiresResponse: true,
      },
    };
  }

  /**
   * 解析用户对选项问题的回答
   */
  parseOptionResponse(response: string, options: string[]): number {
    // 尝试解析数字
    const num = parseInt(response.trim());
    if (!isNaN(num) && num >= 1 && num <= options.length) {
      return num - 1;
    }

    // 尝试匹配选项文本
    const lowerResponse = response.toLowerCase();
    for (let i = 0; i < options.length; i++) {
      if (options[i].toLowerCase().includes(lowerResponse)) {
        return i;
      }
    }

    return -1; // 无效回答
  }

}
