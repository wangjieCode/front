import { DEFAULT_NEOVATE_MODEL } from '@front/shared';

export interface NeovateSdkRunOptions {
  prompt: string;
  workDir: string;
  sessionId?: string;
  model?: string;
  timeoutMs?: number;
  onChunk?: (chunk: string) => void;
  abortSignal?: AbortSignal;
}

export interface NeovateSdkRunResult {
  output: string;
  durationMs: number;
  sessionId?: string;
  error?: Error;
}

export async function runNeovateSdk(options: NeovateSdkRunOptions): Promise<NeovateSdkRunResult> {
  const { createSession, resumeSession } = await loadNeovateSdk();
  const model = options.model || DEFAULT_NEOVATE_MODEL;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Number(options.timeoutMs)
    : Number(process.env.NEOVATE_EXEC_TIMEOUT_MS || 180000);
  const start = Date.now();
  let output = '';

  let error: Error | undefined;
  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  let aborted = false;
  let timeout: NodeJS.Timeout | null = null;
  const logPayload = {
    model,
    cwd: options.workDir,
    hasSessionId: !!options.sessionId,
    sessionId: options.sessionId || null,
    timeoutMs,
    hasAbortSignal: !!options.abortSignal,
    hasOnChunk: !!options.onChunk,
    promptLength: options.prompt?.length || 0,
  };
  console.log(`[NeovateSdkRunner] 准备调用 SDK: ${JSON.stringify(logPayload)}`);
  const handleAbort = () => {
    aborted = true;
    if (session) {
      try {
        session.close();
      } catch (closeError) {
        // ignore
      }
    }
  };
  try {
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        handleAbort();
      }, timeoutMs);
    }

    if (options.abortSignal?.aborted) {
      handleAbort();
      throw new Error('aborted');
    }

    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', handleAbort, { once: true });
    }

    // 禁用 subagent（Agent tool），避免模型输出 [task:...] 标记而不实际执行
    const disableSubagentPlugin = {
      name: 'disable-subagent',
      config: () => ({
        tools: { Agent: false },
      }),
    };

    const sessionOpts = {
      model,
      cwd: options.workDir,
      plugins: [disableSubagentPlugin],
    };

    if (options.sessionId) {
      console.log(
        `[NeovateSdkRunner] 调用 resumeSession: ${JSON.stringify({
          sessionId: options.sessionId,
          model,
          cwd: options.workDir,
        })}`
      );
      session = await resumeSession(options.sessionId, sessionOpts);
    } else {
      console.log(
        `[NeovateSdkRunner] 调用 createSession: ${JSON.stringify({
          model,
          cwd: options.workDir,
        })}`
      );
      session = await createSession(sessionOpts);
    }

    await session.send(options.prompt);
    console.log(
      `[NeovateSdkRunner] session.send 完成: ${JSON.stringify({
        sessionId: session.sessionId,
        model,
        promptLength: options.prompt?.length || 0,
      })}`
    );

    for await (const msg of session.receive()) {
      if (aborted) {
        break;
      }

      // 过滤纯 SDK 内部控制消息（所有 text 块都只含标记），不推送给客户端
      // 混合内容（正常文本 + 标记）仍推送，由前端 strip
      const SDK_MARKER_RE = /^\[(NOTE|System|task[:\(][^\]]*)\]$/i;
      const isInternalMsg = msg && typeof msg === 'object'
        && (msg as any).role === 'assistant'
        && Array.isArray((msg as any).content)
        && (msg as any).content.length > 0
        && (msg as any).content.every(
          (block: any) => block.type === 'text' && typeof block.text === 'string'
            && SDK_MARKER_RE.test(block.text.trim())
        );

      if (isInternalMsg) {
        console.log(`[NeovateSdkRunner] 过滤 SDK 内部消息，不推送客户端: ${JSON.stringify(msg).substring(0, 200)}`);
      }

      const line = `${JSON.stringify(msg)}\n`;
      output += line;
      if (options.onChunk && !isInternalMsg) {
        options.onChunk(line);
      }
      // 记录 result 事件用于诊断
      if (msg && typeof msg === 'object' && (msg as any).type === 'result') {
        console.log(`[NeovateSdkRunner] 收到 result 事件: ${JSON.stringify({
          subtype: (msg as any).subtype,
          isError: (msg as any).isError,
          contentLength: typeof (msg as any).content === 'string' ? (msg as any).content.length : 0,
        })}`);
        if ((msg as any).isError || (msg as any).subtype === 'error') {
          error = new Error((msg as any).content || '模型执行失败');
          break;
        }
      }
    }
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
    console.error(
      `[NeovateSdkRunner] SDK 调用异常: ${JSON.stringify({
        model,
        sessionId: options.sessionId || null,
        error: error.message,
      })}`
    );
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
    if (options.abortSignal) {
      options.abortSignal.removeEventListener('abort', handleAbort);
    }
    if (session) {
      try {
        session.close();
      } catch (closeError) {
        // ignore
      }
    }
  }

  return {
    // abort 后清空 output，防止部分数据被后续流程当作有效结果处理
    output: aborted ? '' : output,
    durationMs: Date.now() - start,
    sessionId: session?.sessionId,
    error: aborted ? new Error('aborted') : error,
  };
}

async function loadNeovateSdk(): Promise<{
  createSession: typeof import('@neovate/code').createSession;
  resumeSession: typeof import('@neovate/code').resumeSession;
}> {
  const dynamicImport = new Function(
    'specifier',
    'return import(specifier)'
  ) as (specifier: string) => Promise<{
    createSession: typeof import('@neovate/code').createSession;
    resumeSession: typeof import('@neovate/code').resumeSession;
  }>;

  return dynamicImport('@neovate/code');
}

export function getNeovateSdkVersion(): string | null {
  try {
    const pkg = require('@neovate/code/package.json');
    return typeof pkg?.version === 'string' ? pkg.version : null;
  } catch (error) {
    return null;
  }
}

export function isNeovateSdkAvailable(): boolean {
  try {
    require.resolve('@neovate/code');
    return true;
  } catch (error) {
    return false;
  }
}
