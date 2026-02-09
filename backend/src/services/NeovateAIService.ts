import { ICommandExecutor, CodeChange, ChangeType } from '../types';
import { createCodeChange, detectChangeType, parseFilePathFromDiff } from '../models/CodeChange';
import { NeovateSessionManagerDB } from './NeovateSessionManagerDB';
import { convertToStoredPath } from '../utils/PathUtils';
import { runNeovateSdk } from '../utils/NeovateSdkRunner';

/**
 * Neovate 执行结果接口
 */
export interface NeovateAIResult {
  success: boolean;
  message: string;
  changes: CodeChange[];
  rawOutput?: string;
  error?: string;
  neovateSessionId?: string;
  gitBranch?: string;
  mrUrl?: string;
}

/**
 * Neovate SDK 服务类
 * 负责调用 SDK 修改代码并解析结果
 */
export class NeovateAIService {
  private sessionManager: NeovateSessionManagerDB;

  constructor(
    private executor: ICommandExecutor,
    private workDir: string,
    databaseUrl: string
  ) {
    this.sessionManager = new NeovateSessionManagerDB(databaseUrl);
  }

  /**
   * 使用 AI 修改代码（流式版本）
   */
  async modifyCodeStream(
    prompt: string,
    conversationId: string | undefined,
    existingSessionId: string | undefined,
    customWorkDir: string | undefined,
    onData: (data: string) => void,
    model?: string,
    abortSignal?: AbortSignal
  ): Promise<NeovateAIResult> {
    const workDir = customWorkDir || this.workDir;
    const displayWorkDir = require('path').resolve(workDir);
    console.log(`[AI-EXEC] 开始流式执行 Neovate SDK (dir: ${displayWorkDir})`);

    let neovateSessionId: string | undefined = existingSessionId;

    try {
      let { output, durationMs, error, sessionId } = await runNeovateSdk({
        prompt,
        workDir,
        sessionId: existingSessionId,
        model,
        abortSignal,
        onChunk: (chunk) => {
          onData(chunk);
        },
      });

      const shouldRetryWithoutSession = !!existingSessionId && !!error;
      if (shouldRetryWithoutSession) {
        console.warn(
          `[AI-EXEC] 恢复会话失败，回退为新建会话重试。sessionId=${existingSessionId}, model=${model || 'default'}, error=${error?.message}`
        );
        const retryResult = await runNeovateSdk({
          prompt,
          workDir,
          model,
          abortSignal,
          onChunk: (chunk) => {
            onData(chunk);
          },
        });
        output = retryResult.output;
        durationMs += retryResult.durationMs;
        error = retryResult.error;
        sessionId = retryResult.sessionId;
        neovateSessionId = undefined;
      }

      if (!neovateSessionId && sessionId) {
        neovateSessionId = sessionId;
        console.log(`[NeovateAIService] 提取到新会话 ID: ${neovateSessionId}`);
      }

      if (error) {
        console.error(`[AI-EXEC] 执行失败 (耗时: ${durationMs}ms): ${error.message}`);
        return {
          success: false,
          message: error.message === 'aborted' ? '执行已中断' : 'neovate 执行失败',
          changes: [],
          error: error.message,
          rawOutput: output,
        };
      }

      console.log(`[AI-EXEC] 执行成功 (耗时: ${durationMs}ms)`);

      if (conversationId && neovateSessionId) {
        await this.sessionManager.saveSessionId(
          conversationId,
          neovateSessionId,
          workDir
        ).catch(err => {
          console.error('[NeovateAIService] 保存会话 ID 失败:', err);
        });
        const displaySavedPath = convertToStoredPath(workDir) || workDir;
        console.log(`[NeovateAIService] 已保存会话 ID: ${neovateSessionId}，路径: ${displaySavedPath}`);
      }

      const changes = await this.parseOutput(output, workDir);

      return {
        success: true,
        message: `成功修改代码，共 ${changes.length} 个文件变更`,
        changes,
        rawOutput: output,
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
   * 使用 AI 修改代码
   */
  async modifyCode(
    prompt: string,
    conversationId?: string,
    existingSessionId?: string,
    customWorkDir?: string,
    model?: string,
    abortSignal?: AbortSignal
  ): Promise<NeovateAIResult> {
    const workDir = customWorkDir || this.workDir;
    const displayWorkDir = require('path').resolve(workDir);
    console.log(`[AI-EXEC] 开始执行 Neovate SDK (dir: ${displayWorkDir})`);

    try {
      let { output, durationMs, error, sessionId } = await runNeovateSdk({
        prompt,
        workDir,
        sessionId: existingSessionId,
        model,
        abortSignal,
      });

      const shouldRetryWithoutSession = !!existingSessionId && !!error;
      if (shouldRetryWithoutSession) {
        console.warn(
          `[AI-EXEC] 恢复会话失败，回退为新建会话重试。sessionId=${existingSessionId}, model=${model || 'default'}, error=${error?.message}`
        );
        const retryResult = await runNeovateSdk({
          prompt,
          workDir,
          model,
          abortSignal,
        });
        output = retryResult.output;
        durationMs += retryResult.durationMs;
        error = retryResult.error;
        sessionId = retryResult.sessionId;
      }

      if (error) {
        console.error(`[AI-EXEC] 执行失败 (耗时: ${durationMs}ms): ${error.message}`);
        return {
          success: false,
          message: error.message === 'aborted' ? '执行已中断' : 'neovate 执行失败',
          changes: [],
          error: error.message,
          rawOutput: output,
        };
      }

      console.log(`[AI-EXEC] 执行成功 (耗时: ${durationMs}ms)`);

      const { cleanOutput, sessionId: parsedSessionId } = this.normalizeOutput(output);
      const neovateSessionId = parsedSessionId || sessionId;

      if (conversationId && neovateSessionId) {
        await this.sessionManager.saveSessionId(
          conversationId,
          neovateSessionId,
          workDir
        ).catch(err => {
          console.error('[NeovateAIService] 保存会话 ID 失败:', err);
        });
        const displaySavedPath = convertToStoredPath(workDir) || workDir;
        console.log(`[NeovateAIService] 已保存会话 ID: ${neovateSessionId}，路径: ${displaySavedPath}`);
      }

      const changes = await this.parseOutput(cleanOutput, workDir);

      return {
        success: true,
        message: `成功修改代码，共 ${changes.length} 个文件变更`,
        changes,
        rawOutput: cleanOutput,
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

  private normalizeOutput(rawOutput: string): { cleanOutput: string; sessionId?: string } {
    let neovateSessionId: string | undefined;
    const lines = rawOutput.split('\n').filter(line => line.trim());
    const validJsonLines: string[] = [];

    for (const line of lines) {
      if (!line.trim().startsWith('{')) {
        continue;
      }
      try {
        const parsed = JSON.parse(line);
        validJsonLines.push(line);

        if (!neovateSessionId && parsed.sessionId && typeof parsed.sessionId === 'string') {
          neovateSessionId = parsed.sessionId;
          console.log(`[NeovateAIService] 提取到新会话 ID: ${neovateSessionId}`);
        }
      } catch (error) {
        // ignore
      }
    }

    return {
      cleanOutput: validJsonLines.length > 0 ? validJsonLines.join('\n') : rawOutput,
      sessionId: neovateSessionId,
    };
  }

  /**
   * 解析 Neovate 输出
   */
  private async parseOutput(rawOutput: string, workDir?: string): Promise<CodeChange[]> {
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
  private async getFileDiff(filePath: string, workDir?: string): Promise<string> {
    try {
      const targetWorkDir = workDir || this.workDir;
      const result = await this.executor.executeCommand(
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
   */
  private async getAllDiff(workDir?: string): Promise<string> {
    try {
      const targetWorkDir = workDir || this.workDir;
      const result = await this.executor.executeCommand(
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
}
