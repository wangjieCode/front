import { ICodeToolProvider, CodeToolResult, CodeChange, ChangeType, ICommandExecutor } from '../types';
import { createCodeChange, detectChangeType, parseFilePathFromDiff } from '../models/CodeChange';
import { NeovateMessageParser } from '../utils/NeovateMessageParser';
import { getNeovateSdkVersion, isNeovateSdkAvailable, runNeovateSdk } from '../utils/NeovateSdkRunner';

/**
 * neovate 工具提供者
 * 实现 ICodeToolProvider 接口
 */
export class NeovateProvider implements ICodeToolProvider {
  readonly name = 'neovate';

  constructor(private executor: ICommandExecutor) {}

  /**
   * 使用 neovate 修改代码
   */
  async modifyCode(prompt: string, workDir: string): Promise<CodeToolResult> {
    const startTime = Date.now();
    console.log('[NeovateProvider] 开始执行 modifyCode');
    console.log('[NeovateProvider] 提示词:', prompt);
    console.log('[NeovateProvider] 工作目录:', workDir);

    try {
      const { output, durationMs, error } = await runNeovateSdk({
        prompt,
        workDir,
      });

      if (error) {
        console.error(`[NeovateProvider] ❌ 执行失败，耗时: ${durationMs}ms`);
        return {
          success: false,
          message: 'neovate 执行失败',
          changes: [],
          error: error.message,
          rawOutput: output,
        };
      }

      const executionTime = Date.now() - startTime;
      console.log(`[NeovateProvider] 执行完成，耗时: ${executionTime}ms`);

      console.log('[NeovateProvider] 开始解析输出...');
      const changes = await this.parseOutput(output, workDir);
      console.log(`[NeovateProvider] 解析完成，找到 ${changes.length} 个文件变更`);

      return {
        success: true,
        message: `成功修改代码，共 ${changes.length} 个文件变更`,
        changes,
        rawOutput: output,
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
      let sessionIdExtracted = false;
      let lineBuffer = '';
      let dataChunks = 0;
      const parser = new NeovateMessageParser();

      const { output, durationMs, error } = await runNeovateSdk({
        prompt,
        workDir,
        sessionId: existingSessionId,
        onChunk: (chunk) => {
          dataChunks++;
          lineBuffer += chunk;

          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || '';

          for (const line of lines) {
            if (!sessionIdExtracted && onSessionId) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.sessionId && typeof parsed.sessionId === 'string') {
                  console.log(`[NeovateProvider] 提取到会话 ID: ${parsed.sessionId}`);
                  onSessionId(parsed.sessionId);
                  sessionIdExtracted = true;
                }
              } catch (error) {
                // ignore
              }
            }

            const message = parser.parseStreamLine(line);
            if (message) {
              onData(JSON.stringify({
                type: 'conversation',
                message,
              }) + '\n');
            } else {
              onData(line + '\n');
            }
          }
        },
      });

      if (error) {
        console.error(`[NeovateProvider] ❌ 流式执行失败，耗时: ${durationMs}ms`);
        if (onError) {
          onError(error.message);
        }
        return {
          success: false,
          message: 'neovate 执行失败',
          changes: [],
          error: error.message,
          rawOutput: output,
        };
      }

      const executionTime = Date.now() - startTime;
      console.log(`[NeovateProvider] 流式执行完成，耗时: ${executionTime}ms`);
      console.log(`[NeovateProvider] 总共接收 ${dataChunks} 个数据块`);

      console.log('[NeovateProvider] 开始解析流式输出...');
      const changes = await this.parseOutput(output, workDir);
      console.log(`[NeovateProvider] 解析完成，找到 ${changes.length} 个文件变更`);

      return {
        success: true,
        message: `成功修改代码，共 ${changes.length} 个文件变更`,
        changes,
        rawOutput: output,
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
   * 解析 neovate 的输出
   */
  private async parseOutput(rawOutput: string, workDir: string): Promise<CodeChange[]> {
    const changes: CodeChange[] = [];

    try {
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
          // ignore
        }
      }

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

        const diff = await this.getFileDiff(filePath, workDir);
        changes.push(createCodeChange(filePath, changeType, diff));
      }

      if (changes.length === 0) {
        const diffOutput = await this.getAllDiff(workDir);
        if (diffOutput) {
          const parsedChanges = this.parseDiffOutput(diffOutput);
          changes.push(...parsedChanges);
        }
      }

      return changes;
    } catch (error) {
      return changes;
    }
  }

  /**
   * 获取指定文件的 diff
   */
  private async getFileDiff(filePath: string, workDir: string): Promise<string> {
    try {
      const result = await this.executor.executeCommand(
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
      const result = await this.executor.executeCommand(
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
    const fileDiffs = diffOutput.split(/^diff --git /m).filter(Boolean);

    for (const fileDiff of fileDiffs) {
      const fullDiff = 'diff --git ' + fileDiff;
      const filePath = parseFilePathFromDiff(fullDiff);
      if (!filePath) continue;

      const changeType = detectChangeType(fullDiff);
      changes.push(createCodeChange(filePath, changeType, fullDiff));
    }

    return changes;
  }

  /**
   * 检查 neovate 是否可用
   */
  async isAvailable(_workDir: string): Promise<boolean> {
    return isNeovateSdkAvailable() && !!process.env.IFLOW_API_KEY;
  }

  /**
   * 获取 neovate 版本
   */
  async getVersion(_workDir: string): Promise<string> {
    return getNeovateSdkVersion() || 'unknown';
  }
}
