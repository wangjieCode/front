import path from 'path';
import { ICommandExecutor, CodeChange, ChangeType } from '../types';
import { createCodeChange, detectChangeType, parseFilePathFromDiff } from '../models/CodeChange';
import { NeovateSessionManagerDB } from './NeovateSessionManagerDB';
import { convertToStoredPath } from '../utils/PathUtils';
import { runNeovateSdk } from '../utils/NeovateSdkRunner';

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

interface RunResult {
  output: string;
  neovateSessionId: string | undefined;
  durationMs: number;
}

export class NeovateAIService {
  private sessionManager: NeovateSessionManagerDB;

  constructor(
    private executor: ICommandExecutor,
    private workDir: string,
    databaseUrl: string
  ) {
    this.sessionManager = new NeovateSessionManagerDB(databaseUrl);
  }

  async modifyCodeStream(
    prompt: string,
    conversationId: string | undefined,
    existingSessionId: string | undefined,
    customWorkDir: string | undefined,
    onData: (data: string) => void,
    model?: string,
    abortSignal?: AbortSignal
  ): Promise<NeovateAIResult> {
    return this.execute(prompt, conversationId, existingSessionId, customWorkDir, model, abortSignal, onData);
  }

  async modifyCode(
    prompt: string,
    conversationId?: string,
    existingSessionId?: string,
    customWorkDir?: string,
    model?: string,
    abortSignal?: AbortSignal
  ): Promise<NeovateAIResult> {
    return this.execute(prompt, conversationId, existingSessionId, customWorkDir, model, abortSignal);
  }

  private async execute(
    prompt: string,
    conversationId: string | undefined,
    existingSessionId: string | undefined,
    customWorkDir: string | undefined,
    model: string | undefined,
    abortSignal: AbortSignal | undefined,
    onChunk?: (chunk: string) => void
  ): Promise<NeovateAIResult> {
    const workDir = customWorkDir || this.workDir;
    const gitBaseline = await this.captureGitBaseline(workDir);
    console.log(`[AI-EXEC] 开始执行 Neovate SDK (dir: ${path.resolve(workDir)})`);

    try {
      const { output, neovateSessionId, durationMs } = await this.runWithRetry(
        prompt, workDir, existingSessionId, model, abortSignal, onChunk
      );

      if (neovateSessionId && conversationId) {
        await this.sessionManager.saveSessionId(conversationId, neovateSessionId, workDir).catch(err => {
          console.error('[NeovateAIService] 保存会话 ID 失败:', err);
        });
        console.log(`[NeovateAIService] 已保存会话 ID: ${neovateSessionId}，路径: ${convertToStoredPath(workDir) || workDir}`);
      }

      console.log(`[AI-EXEC] 执行成功 (耗时: ${durationMs}ms)`);
      const changes = await this.parseOutput(output, workDir, gitBaseline);

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

  private async runWithRetry(
    prompt: string,
    workDir: string,
    existingSessionId: string | undefined,
    model: string | undefined,
    abortSignal: AbortSignal | undefined,
    onChunk?: (chunk: string) => void
  ): Promise<RunResult> {
    let { output, durationMs, error, sessionId } = await runNeovateSdk({
      prompt,
      workDir,
      sessionId: existingSessionId,
      model,
      abortSignal,
      onChunk,
    });

    if (existingSessionId && error) {
      console.warn(
        `[AI-EXEC] 恢复会话失败，回退为新建会话重试。sessionId=${existingSessionId}, error=${error?.message}`
      );
      // 通知前端重置之前的残留内容，避免重试输出与旧输出混在一起
      if (onChunk) {
        onChunk(JSON.stringify({ type: 'retry_reset' }) + '\n');
      }
      const retry = await runNeovateSdk({ prompt, workDir, model, abortSignal, onChunk });
      output = retry.output;
      durationMs += retry.durationMs;
      error = retry.error;
      sessionId = retry.sessionId;
    }

    if (error) {
      console.error(`[AI-EXEC] 执行失败 (耗时: ${durationMs}ms): ${error.message}`);
      throw error.message === 'aborted'
        ? Object.assign(new Error('执行已中断'), { isAbort: true })
        : new Error(`neovate 执行失败: ${error.message}`);
    }

    const { cleanOutput, sessionId: parsedSessionId } = this.normalizeOutput(output);
    const neovateSessionId = parsedSessionId || sessionId || undefined;

    return { output: cleanOutput, neovateSessionId, durationMs };
  }

  private normalizeOutput(rawOutput: string): { cleanOutput: string; sessionId?: string } {
    let neovateSessionId: string | undefined;
    const validJsonLines: string[] = [];

    for (const line of rawOutput.split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      try {
        const parsed = JSON.parse(line);
        validJsonLines.push(line);
        if (!neovateSessionId && typeof parsed.sessionId === 'string') {
          neovateSessionId = parsed.sessionId;
          console.log(`[NeovateAIService] 提取到新会话 ID: ${neovateSessionId}`);
        }
      } catch {
        // ignore non-JSON lines
      }
    }

    return {
      cleanOutput: validJsonLines.length > 0 ? validJsonLines.join('\n') : rawOutput,
      sessionId: neovateSessionId,
    };
  }

  private async parseOutput(
    rawOutput: string,
    workDir?: string,
    gitBaseline?: { headSha: string | null }
  ): Promise<CodeChange[]> {
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
        } catch {
          // fall through
        }
      }

      const fileChangePattern = /(Modified|Created|Deleted|Added):\s*(.+)/gi;
      let match;
      while ((match = fileChangePattern.exec(rawOutput)) !== null) {
        const action = match[1].toLowerCase();
        const filePath = match[2].trim();
        const changeType = action === 'created' || action === 'added'
          ? ChangeType.ADDED
          : action === 'deleted' ? ChangeType.DELETED : ChangeType.MODIFIED;
        const diff = await this.getFileDiff(filePath, workDir);
        changes.push(createCodeChange(filePath, changeType, diff));
      }

      if (changes.length === 0) {
        const diffOutput = await this.getAllDiff(workDir);
        if (diffOutput) changes.push(...this.parseDiffOutput(diffOutput));
      }

      if (changes.length === 0 && gitBaseline) {
        changes.push(...await this.collectChangesFromGitBaseline(gitBaseline, workDir));
      }

      return changes;
    } catch {
      return changes;
    }
  }

  private async captureGitBaseline(workDir?: string): Promise<{ headSha: string | null }> {
    try {
      const result = await this.executor.executeCommand('git rev-parse HEAD', workDir || this.workDir);
      return { headSha: (result.stdout || '').trim() || null };
    } catch {
      return { headSha: null };
    }
  }

  private async collectChangesFromGitBaseline(
    baseline: { headSha: string | null },
    workDir?: string
  ): Promise<CodeChange[]> {
    try {
      const targetDir = workDir || this.workDir;
      const currentHeadResult = await this.executor.executeCommand('git rev-parse HEAD', targetDir);
      const currentHead = (currentHeadResult.stdout || '').trim() || null;
      let combinedDiff = '';

      if (baseline.headSha && currentHead && baseline.headSha !== currentHead) {
        const r = await this.executor.executeCommand(`git diff ${baseline.headSha}..${currentHead}`, targetDir);
        combinedDiff += r.stdout || '';
      }

      const worktreeDiff = await this.getAllDiff(targetDir);
      if (worktreeDiff) combinedDiff = combinedDiff ? `${combinedDiff}\n${worktreeDiff}` : worktreeDiff;

      if (!combinedDiff.trim()) return [];

      const parsed = this.parseDiffOutput(combinedDiff);
      const byPath = new Map<string, CodeChange>();
      for (const item of parsed) byPath.set(item.filePath, item);
      return Array.from(byPath.values());
    } catch {
      return [];
    }
  }

  private async getFileDiff(filePath: string, workDir?: string): Promise<string> {
    try {
      const r = await this.executor.executeCommand(`git diff HEAD -- "${filePath}"`, workDir || this.workDir);
      return r.stdout || '';
    } catch {
      return '';
    }
  }

  private async getAllDiff(workDir?: string): Promise<string> {
    try {
      const r = await this.executor.executeCommand('git diff HEAD', workDir || this.workDir);
      return r.stdout || '';
    } catch {
      return '';
    }
  }

  private parseDiffOutput(diffOutput: string): CodeChange[] {
    return diffOutput
      .split(/^diff --git /m)
      .filter(Boolean)
      .map(chunk => {
        const fullDiff = 'diff --git ' + chunk;
        const filePath = parseFilePathFromDiff(fullDiff);
        return filePath ? createCodeChange(filePath, detectChangeType(fullDiff), fullDiff) : null;
      })
      .filter((c): c is CodeChange => c !== null);
  }
}
