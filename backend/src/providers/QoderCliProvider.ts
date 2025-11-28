import { SSHExecutor } from '../services/SSHExecutor';
import { ICodeToolProvider, CodeToolResult, CodeChange, ChangeType } from '../types';
import { createCodeChange, detectChangeType, parseFilePathFromDiff } from '../models/CodeChange';

/**
 * qodercli 工具提供者
 * 实现 ICodeToolProvider 接口
 */
export class QoderCliProvider implements ICodeToolProvider {
  readonly name = 'qodercli';

  constructor(private sshExecutor: SSHExecutor) {}

  /**
   * 使用 qodercli 修改代码
   * @param prompt 用户提示词
   * @param workDir 工作目录
   * @returns 执行结果
   */
  async modifyCode(prompt: string, workDir: string): Promise<CodeToolResult> {
    try {
      // 构造 qodercli 命令（使用 stream-json 格式）
      const command = this.buildCommand(prompt, workDir);
      
      // 执行命令
      const result = await this.sshExecutor.executeCommand(command, workDir);
      
      // 检查执行是否成功
      if (result.exitCode !== 0) {
        return {
          success: false,
          message: 'qodercli 执行失败',
          changes: [],
          error: result.stderr || result.stdout,
          rawOutput: result.stdout,
        };
      }

      // 记录原始输出用于调试
      console.log('=== qodercli 原始输出 ===');
      console.log(result.stdout);
      console.log('=== qodercli 输出结束 ===');

      // 解析输出，提取代码变更
      const changes = await this.parseOutput(result.stdout, workDir);

      return {
        success: true,
        message: `成功修改代码，共 ${changes.length} 个文件变更`,
        changes,
        rawOutput: result.stdout,
      };
    } catch (error) {
      return {
        success: false,
        message: '执行 qodercli 时发生错误',
        changes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 使用 qodercli 修改代码（流式输出）
   * @param prompt 用户提示词
   * @param workDir 工作目录
   * @param onData 数据回调
   * @param onError 错误回调
   * @returns 执行结果
   */
  async modifyCodeStream(
    prompt: string,
    workDir: string,
    onData: (data: string) => void,
    onError?: (data: string) => void
  ): Promise<CodeToolResult> {
    try {
      // 构造 qodercli 命令（使用 stream-json 格式）
      const command = this.buildCommand(prompt, workDir, true);
      
      let fullOutput = '';
      
      // 执行命令并流式处理输出
      const result = await this.sshExecutor.executeCommandStream(
        command,
        workDir,
        (data: string) => {
          fullOutput += data;
          onData(data);
        },
        onError
      );
      
      // 检查执行是否成功
      if (result.exitCode !== 0) {
        return {
          success: false,
          message: 'qodercli 执行失败',
          changes: [],
          error: result.stderr || result.stdout,
          rawOutput: result.stdout,
        };
      }

      // 解析输出，提取代码变更
      const changes = await this.parseOutput(fullOutput, workDir);

      return {
        success: true,
        message: `成功修改代码，共 ${changes.length} 个文件变更`,
        changes,
        rawOutput: fullOutput,
      };
    } catch (error) {
      return {
        success: false,
        message: '执行 qodercli 时发生错误',
        changes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 构造 qodercli 命令
   * @param prompt 用户提示词
   * @param workDir 工作目录
   * @param stream 是否使用流式输出
   * @returns 完整的命令字符串
   */
  private buildCommand(prompt: string, workDir: string, stream: boolean = false): string {
    // 转义提示词中的特殊字符
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')  // 转义反斜杠
      .replace(/"/g, '\\"')     // 转义双引号
      .replace(/`/g, '\\`')     // 转义反引号
      .replace(/\$/g, '\\$');   // 转义美元符号

    // 获取绝对路径
    const path = require('path');
    const absoluteWorkDir = path.resolve(workDir);

    // 构造 qodercli 命令
    // -p: 非交互模式执行单个提示
    // -w: 指定工作目录（使用绝对路径）
    // --output-format: 输出格式（stream-json 用于流式，json 用于同步）
    // --yolo: 跳过所有权限检查（自动执行）
    const outputFormat = stream ? 'stream-json' : 'json';
    return `qodercli -p "${escapedPrompt}" -w "${absoluteWorkDir}" --output-format=${outputFormat} --yolo`;
  }

  /**
   * 解析 qodercli 的输出
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
   * 检查 qodercli 是否可用
   */
  async isAvailable(workDir: string): Promise<boolean> {
    try {
      const result = await this.sshExecutor.executeCommand(
        'which qodercli',
        workDir
      );
      return result.exitCode === 0 && result.stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取 qodercli 版本
   */
  async getVersion(workDir: string): Promise<string> {
    try {
      const result = await this.sshExecutor.executeCommand(
        'qodercli --version',
        workDir
      );
      return result.stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }
}
