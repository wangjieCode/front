import { SSHExecutor } from '../services/SSHExecutor';
import { ICodeToolProvider, CodeToolResult, CodeChange, ChangeType } from '../types';
import { createCodeChange, detectChangeType, parseFilePathFromDiff } from '../models/CodeChange';
import { NeovateMessageParser, ConversationMessage } from '../utils/NeovateMessageParser';

/**
 * neovate 工具提供者
 * 实现 ICodeToolProvider 接口
 * 命令配置与 qodercli 相同
 */
export class NeovateProvider implements ICodeToolProvider {
  readonly name = 'neovate';

  constructor(private sshExecutor: SSHExecutor) {}

  /**
   * 使用 neovate 修改代码
   * @param prompt 用户提示词
   * @param workDir 工作目录
   * @returns 执行结果
   */
  async modifyCode(prompt: string, workDir: string): Promise<CodeToolResult> {
    const startTime = Date.now();
    console.log('[NeovateProvider] 开始执行 modifyCode');
    console.log('[NeovateProvider] 提示词:', prompt);
    console.log('[NeovateProvider] 工作目录:', workDir);
    
    try {
      // 构造 neovate 命令
      const command = this.buildCommand(prompt, workDir);
      console.log('[NeovateProvider] 构造的命令:', command);
      
      // 检查环境变量
      const hasApiKey = !!process.env.IFLOW_API_KEY;
      console.log('[NeovateProvider] IFLOW_API_KEY 是否存在:', hasApiKey);
      if (!hasApiKey) {
        console.warn('[NeovateProvider] ⚠️ 警告: IFLOW_API_KEY 未设置');
      }
      
      // 执行命令
      console.log('[NeovateProvider] 开始执行命令...');
      const result = await this.sshExecutor.executeCommand(command, workDir);
      const executionTime = Date.now() - startTime;
      console.log(`[NeovateProvider] 命令执行完成，耗时: ${executionTime}ms`);
      console.log('[NeovateProvider] 退出码:', result.exitCode);
      
      // 检查执行是否成功
      if (result.exitCode !== 0) {
        console.error('[NeovateProvider] ❌ 执行失败');
        console.error('[NeovateProvider] stderr:', result.stderr);
        console.error('[NeovateProvider] stdout:', result.stdout);
        return {
          success: false,
          message: 'neovate 执行失败',
          changes: [],
          error: result.stderr || result.stdout,
          rawOutput: result.stdout,
        };
      }

      // 记录原始输出用于调试
      console.log('[NeovateProvider] === neovate 原始输出 ===');
      console.log(result.stdout.substring(0, 500) + '...');
      console.log('[NeovateProvider] === neovate 输出结束 ===');

      // 解析输出，提取代码变更
      console.log('[NeovateProvider] 开始解析输出...');
      const changes = await this.parseOutput(result.stdout, workDir);
      console.log(`[NeovateProvider] 解析完成，找到 ${changes.length} 个文件变更`);

      return {
        success: true,
        message: `成功修改代码，共 ${changes.length} 个文件变更`,
        changes,
        rawOutput: result.stdout,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`[NeovateProvider] ❌ 异常，耗时: ${executionTime}ms`);
      console.error('[NeovateProvider] 错误:', error);
      return {
        success: false,
        message: '执行 neovate 时发生错误',
        changes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 使用 neovate 修改代码（流式输出）
   * @param prompt 用户提示词
   * @param workDir 工作目录
   * @param onData 数据回调
   * @param onError 错误回调
   * @param onSessionId 会话 ID 回调（可选）
   * @param existingSessionId 现有的会话 ID（可选，用于恢复会话）
   * @returns 执行结果
   */
  async modifyCodeStream(
    prompt: string,
    workDir: string,
    onData: (data: string) => void,
    onError?: (data: string) => void,
    onSessionId?: (sessionId: string) => void,
    existingSessionId?: string
  ): Promise<CodeToolResult> {
    const startTime = Date.now();
    console.log('[NeovateProvider] 开始执行 modifyCodeStream (流式)');
    console.log('[NeovateProvider] 提示词:', prompt);
    console.log('[NeovateProvider] 工作目录:', workDir);
    console.log('[NeovateProvider] 现有会话 ID:', existingSessionId || '无');
    
    try {
      // 构造 neovate 命令（使用 stream-json 格式，如果有 sessionId 则使用 --resume）
      const command = this.buildCommand(prompt, workDir, true, existingSessionId);
      console.log('[NeovateProvider] 构造的命令 (流式):', command);
      
      // 检查环境变量
      const hasApiKey = !!process.env.IFLOW_API_KEY;
      console.log('[NeovateProvider] IFLOW_API_KEY 是否存在:', hasApiKey);
      
      let fullOutput = '';
      let dataChunks = 0;
      let sessionIdExtracted = false;
      const parser = new NeovateMessageParser();
      
      // 执行命令并流式处理输出
      console.log('[NeovateProvider] 开始流式执行命令...');
      const result = await this.sshExecutor.executeCommandStream(
        command,
        workDir,
        (data: string) => {
          dataChunks++;
          fullOutput += data;
          
          // 尝试解析为对话消息
          const lines = data.split('\n').filter(line => line.trim());
          for (const line of lines) {
            // 尝试提取 session ID（只提取一次）
            if (!sessionIdExtracted && onSessionId) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.sessionId && typeof parsed.sessionId === 'string') {
                  console.log(`[NeovateProvider] 提取到会话 ID: ${parsed.sessionId}`);
                  onSessionId(parsed.sessionId);
                  sessionIdExtracted = true;
                }
              } catch (e) {
                // 不是有效的 JSON，忽略
              }
            }
            
            const message = parser.parseStreamLine(line);
            if (message) {
              // 发送结构化的对话消息
              onData(JSON.stringify({ 
                type: 'conversation', 
                message 
              }) + '\n');
            } else {
              // 发送原始数据（兼容旧格式）
              onData(line + '\n');
            }
          }
          
          if (dataChunks % 10 === 0) {
            console.log(`[NeovateProvider] 已接收 ${dataChunks} 个数据块，总长度: ${fullOutput.length}`);
          }
        },
        onError
      );
      
      const executionTime = Date.now() - startTime;
      console.log(`[NeovateProvider] 流式执行完成，耗时: ${executionTime}ms`);
      console.log(`[NeovateProvider] 总共接收 ${dataChunks} 个数据块`);
      console.log('[NeovateProvider] 退出码:', result.exitCode);
      
      // 检查执行是否成功
      if (result.exitCode !== 0) {
        console.error('[NeovateProvider] ❌ 流式执行失败');
        console.error('[NeovateProvider] stderr:', result.stderr);
        return {
          success: false,
          message: 'neovate 执行失败',
          changes: [],
          error: result.stderr || result.stdout,
          rawOutput: result.stdout,
        };
      }

      // 解析输出，提取代码变更
      console.log('[NeovateProvider] 开始解析流式输出...');
      const changes = await this.parseOutput(fullOutput, workDir);
      console.log(`[NeovateProvider] 解析完成，找到 ${changes.length} 个文件变更`);

      return {
        success: true,
        message: `成功修改代码，共 ${changes.length} 个文件变更`,
        changes,
        rawOutput: fullOutput,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`[NeovateProvider] ❌ 流式执行异常，耗时: ${executionTime}ms`);
      console.error('[NeovateProvider] 错误:', error);
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
   * @param workDir 工作目录
   * @param stream 是否使用流式输出
   * @param sessionId 会话 ID（可选，用于恢复会话）
   * @returns 完整的命令字符串
   */
  private buildCommand(
    prompt: string,
    workDir: string,
    stream: boolean = false,
    sessionId?: string
  ): string {
    // 转义提示词中的特殊字符
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')  // 转义反斜杠
      .replace(/"/g, '\\"')     // 转义双引号
      .replace(/`/g, '\\`')     // 转义反引号
      .replace(/\$/g, '\\$');   // 转义美元符号

    // 获取绝对路径
    const path = require('path');
    const absoluteWorkDir = path.resolve(workDir);

    // 构造 neovate 命令
    // -q: 非交互模式
    // --cwd: 指定工作目录（使用绝对路径）
    // --output-format: 输出格式（stream-json 用于流式，json 用于同步）
    // --approval-mode yolo: 自动批准所有操作
    // --resume: 恢复会话（如果提供了 sessionId）
    // prompt: 作为位置参数放在最后
    const outputFormat = stream ? 'stream-json' : 'json';
    let command = `neovate -q --cwd "${absoluteWorkDir}" --output-format ${outputFormat} --approval-mode yolo`;
    
    // 如果提供了 sessionId，添加 --resume 参数
    if (sessionId) {
      command += ` --resume ${sessionId}`;
      console.log(`[NeovateProvider] 使用会话恢复: ${sessionId}`);
    }
    
    command += ` "${escapedPrompt}"`;
    return command;
  }

  /**
   * 解析 neovate 的输出
   * @param rawOutput 原始输出
   * @param workDir 工作目录
   * @returns 代码变更数组
   */
  private async parseOutput(rawOutput: string, workDir: string): Promise<CodeChange[]> {
    const changes: CodeChange[] = [];

    try {
      // 方法 1: 尝试解析 JSON 格式输出
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
      // 解析失败时返回空数组
      return changes;
    }
  }

  /**
   * 获取指定文件的 diff
   */
  private async getFileDiff(filePath: string, workDir: string): Promise<string> {
    try {
      const result = await this.sshExecutor.executeCommand(
        `git diff HEAD -- "${filePath}"`,
        workDir
      );
      return result.stdout || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * 获取所有文件的 diff
   */
  private async getAllDiff(workDir: string): Promise<string> {
    try {
      const result = await this.sshExecutor.executeCommand(
        'git diff HEAD',
        workDir
      );
      return result.stdout || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * 解析 git diff 输出
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
   * 检查 neovate 是否可用
   */
  async isAvailable(workDir: string): Promise<boolean> {
    try {
      const result = await this.sshExecutor.executeCommand(
        'which neovate',
        workDir
      );
      return result.exitCode === 0 && result.stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取 neovate 版本
   */
  async getVersion(workDir: string): Promise<string> {
    try {
      const result = await this.sshExecutor.executeCommand(
        'neovate --version',
        workDir
      );
      return result.stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }
}
