import { SSHExecutor } from './SSHExecutor';
import { CodeChange, ChangeType } from '../types';
import { createCodeChange, detectChangeType, parseFilePathFromDiff } from '../models/CodeChange';
import { NeovateSessionManagerDB } from './NeovateSessionManagerDB';

/**
 * qodercli 执行结果接口
 */
export interface NeovateAIResult {
  success: boolean;
  message: string;
  changes: CodeChange[];
  rawOutput?: string;
  error?: string;
  neovateSessionId?: string;  // 新增：Neovate 会话 ID
  gitBranch?: string;  // Git 分支名称
  mrUrl?: string;  // MR URL
}

/**
 * qodercli 服务类
 * 负责调用 qodercli 修改代码并解析结果
 */
export class NeovateAIService {
  private absoluteWorkDir: string;
  private sessionManager: NeovateSessionManagerDB;

  constructor(
    private sshExecutor: SSHExecutor,
    private workDir: string,
    databaseUrl: string
  ) {
    // 将工作目录转换为绝对路径
    const path = require('path');
    this.absoluteWorkDir = path.resolve(workDir);
    this.sessionManager = new NeovateSessionManagerDB(databaseUrl);
  }

  /**
   * 使用 AI 修改代码
   * @param prompt 用户提示词
   * @param conversationId 对话 ID（用于会话管理）
   * @param existingSessionId 现有的 Neovate 会话 ID（可选）
   * @returns AI 执行结果
   */
  async modifyCode(
    prompt: string,
    conversationId?: string,
    existingSessionId?: string,
    customWorkDir?: string
  ): Promise<NeovateAIResult> {
    try {
      console.log('[NeovateAIService] ========== 开始执行 ==========');
      console.log('[NeovateAIService] conversationId:', conversationId);
      console.log('[NeovateAIService] existingSessionId:', existingSessionId);
      
      // 使用自定义工作目录或默认工作目录
      const workDir = customWorkDir || this.workDir;
      console.log('[NeovateAIService] workDir:', workDir);
      
      // 构造 neovate 命令（支持会话恢复和工作目录）
      const command = this.buildCommand(prompt, existingSessionId, workDir);
      
      console.log('[NeovateAIService] 执行命令:', command);
      
      // 执行命令
      const result = await this.sshExecutor.executeCommand(command, workDir);
      
      // 检查执行是否成功
      if (result.exitCode !== 0) {
        return {
          success: false,
          message: 'neovate 执行失败',
          changes: [],
          error: result.stderr || result.stdout,
          rawOutput: result.stdout,
        };
      }

      // 记录原始输出用于调试
      console.log('[NeovateAIService] === neovate 原始输出 ===');
      console.log('[NeovateAIService] result.stdout 长度:', result.stdout.length);
      console.log('[NeovateAIService] result.stdout 最后100字符:', JSON.stringify(result.stdout.slice(-100)));
      console.log(result.stdout.substring(0, 500) + '...');
      console.log('[NeovateAIService] === neovate 输出结束 ===');
      
      // 验证 JSON 完整性
      try {
        JSON.parse(result.stdout);
        console.log('[NeovateAIService] ✅ JSON 格式有效');
      } catch (e) {
        console.error('[NeovateAIService] ❌ JSON 格式无效:', (e as Error).message);
        console.error('[NeovateAIService] 最后100字符:', JSON.stringify(result.stdout.slice(-100)));
      }

      // 提取 Neovate 会话 ID
      let neovateSessionId: string | undefined;
      try {
        console.log('[NeovateAIService] 开始提取会话 ID...');
        
        // 按行解析（Neovate 输出是 stream-json 格式，每行一个 JSON）
        const lines = result.stdout.split('\n').filter(line => line.trim());
        console.log(`[NeovateAIService] 总共 ${lines.length} 行输出`);
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.sessionId && typeof parsed.sessionId === 'string') {
              neovateSessionId = parsed.sessionId;
              console.log(`[NeovateAIService] ✅ 提取到会话 ID: ${neovateSessionId}`);
              break;
            }
          } catch (e2) {
            // 跳过无法解析的行
          }
        }

        // 保存会话 ID
        if (conversationId && neovateSessionId) {
          console.log(`[NeovateAIService] 💾 保存会话映射: ${conversationId} -> ${neovateSessionId}`);
          await this.sessionManager.saveSessionId(
            conversationId,
            neovateSessionId,
            this.workDir
          );
          console.log(`[NeovateAIService] ✅ 会话 ID 映射已保存`);
        } else {
          console.log(`[NeovateAIService] ⚠️ 未保存会话映射 - conversationId: ${conversationId}, neovateSessionId: ${neovateSessionId}`);
        }
      } catch (error) {
        console.error('[NeovateAIService] ❌ 提取会话 ID 失败:', error);
      }

      // 解析输出，提取代码变更
      const changes = await this.parseOutput(result.stdout, workDir);

      return {
        success: true,
        message: `成功修改代码，共 ${changes.length} 个文件变更`,
        changes,
        rawOutput: result.stdout,
        neovateSessionId,
      };
    } catch (error) {
      return {
        success: false,
        message: '执行 neovate 时发生错误',
        changes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 构造 neovate 命令
   * @param prompt 用户提示词
   * @param sessionId 会话 ID（可选，用于恢复会话）
   * @param customWorkDir 自定义工作目录（可选，用于覆盖默认工作目录）
   * @returns 完整的命令字符串
   */
  private buildCommand(prompt: string, sessionId?: string, customWorkDir?: string): string {
    // 转义提示词中的特殊字符
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')  // 转义反斜杠
      .replace(/"/g, '\\"')     // 转义双引号
      .replace(/`/g, '\\`')     // 转义反引号
      .replace(/\$/g, '\\$');   // 转义美元符号

    // 使用自定义工作目录或默认绝对路径
    const workDir = customWorkDir ? require('path').resolve(customWorkDir) : this.absoluteWorkDir;
    console.log(`[NeovateAIService] buildCommand 使用工作目录: ${workDir}`);

    // 构造 neovate 命令
    // -q: 非交互模式
    // --cwd: 指定工作目录（使用绝对路径）
    // --output-format stream-json: 使用流式 JSON 输出格式（每行一个 JSON 对象）
    // --approval-mode yolo: 自动批准所有操作
    // --resume: 恢复会话（如果提供了 sessionId）
    let command = `neovate -q --cwd "${workDir}" --output-format stream-json --approval-mode yolo`;
    
    // 如果提供了 sessionId，添加 --resume 参数
    if (sessionId) {
      command += ` --resume ${sessionId}`;
      console.log(`[NeovateAIService] 使用会话恢复: ${sessionId}`);
    }
    
    command += ` "${escapedPrompt}"`;
    return command;
  }

  /**
   * 解析 qodercli 的输出
   * @param rawOutput 原始输出
   * @param workDir 工作目录
   * @returns 代码变更数组
   */
  private async parseOutput(rawOutput: string, workDir?: string): Promise<CodeChange[]> {
    const changes: CodeChange[] = [];

    try {
      // 方法 1: 尝试解析 JSON 格式输出
      // 假设 qodercli 可能输出 JSON 格式的变更信息
      if (rawOutput.trim().startsWith('{') || rawOutput.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(rawOutput);
          if (Array.isArray(parsed)) {
            return parsed.map(item => createCodeChange(
              item.filePath || item.file,
              item.changeType || item.type || ChangeType.MODIFIED,
              item.diff || item.content || ''
            ));
          }
        } catch (jsonError) {
          // JSON 解析失败，继续尝试其他方法
        }
      }

      // 方法 2: 从输出中提取文件变更信息
      // 查找类似 "Modified: file.ts" 或 "Created: file.ts" 的行
      const fileChangePattern = /(Modified|Created|Deleted|Added):\s*(.+)/gi;
      let match;
      
      while ((match = fileChangePattern.exec(rawOutput)) !== null) {
        const action = match[1].toLowerCase();
        const filePath = match[2].trim();
        
        let changeType: ChangeType;
        if (action === 'created' || action === 'added') {
          changeType = ChangeType.ADDED;
        } else if (action === 'deleted') {
          changeType = ChangeType.DELETED;
        } else {
          changeType = ChangeType.MODIFIED;
        }

        // 尝试获取该文件的 diff
        const diff = await this.getFileDiff(filePath, workDir);
        
        changes.push(createCodeChange(filePath, changeType, diff));
      }

      // 方法 3: 如果没有找到明确的文件变更标记，尝试通过 git diff 获取
      if (changes.length === 0) {
        const diffOutput = await this.getAllDiff(workDir);
        if (diffOutput) {
          const parsedChanges = this.parseDiffOutput(diffOutput);
          changes.push(...parsedChanges);
        }
      }

      return changes;
    } catch (error) {
      // 解析失败时记录错误（生产环境应使用日志系统）
      // console.error('解析 qodercli 输出时出错:', error);
      // 即使解析失败，也返回空数组而不是抛出错误
      return changes;
    }
  }

  /**
   * 获取指定文件的 diff
   * @param filePath 文件路径
   * @param workDir 工作目录（可选，默认使用 this.workDir）
   * @returns diff 内容
   */
  private async getFileDiff(filePath: string, workDir?: string): Promise<string> {
    try {
      const targetWorkDir = workDir || this.workDir;
      const result = await this.sshExecutor.executeCommand(
        `git diff HEAD -- "${filePath}"`,
        targetWorkDir
      );
      return result.stdout || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * 获取所有文件的 diff
   * @param workDir 工作目录（可选，默认使用 this.workDir）
   * @returns diff 内容
   */
  private async getAllDiff(workDir?: string): Promise<string> {
    try {
      const targetWorkDir = workDir || this.workDir;
      const result = await this.sshExecutor.executeCommand(
        'git diff HEAD',
        targetWorkDir
      );
      return result.stdout || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * 解析 git diff 输出
   * @param diffOutput git diff 输出
   * @returns 代码变更数组
   */
  private parseDiffOutput(diffOutput: string): CodeChange[] {
    const changes: CodeChange[] = [];
    
    // 按文件分割 diff
    const fileDiffs = diffOutput.split(/^diff --git /m).filter(Boolean);
    
    for (const fileDiff of fileDiffs) {
      const fullDiff = 'diff --git ' + fileDiff;
      
      // 提取文件路径
      const filePath = parseFilePathFromDiff(fullDiff);
      if (!filePath) continue;
      
      // 检测变更类型
      const changeType = detectChangeType(fullDiff);
      
      changes.push(createCodeChange(filePath, changeType, fullDiff));
    }
    
    return changes;
  }

  /**
   * 验证 qodercli 是否可用
   * @returns 如果可用返回 true
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.sshExecutor.executeCommand(
        'which qodercli',
        this.workDir
      );
      return result.exitCode === 0 && result.stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取 qodercli 版本
   * @returns 版本字符串
   */
  async getVersion(): Promise<string> {
    try {
      const result = await this.sshExecutor.executeCommand(
        'qodercli --version',
        this.workDir
      );
      return result.stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }
}
