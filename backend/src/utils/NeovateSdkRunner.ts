import { DEFAULT_NEOVATE_MODEL } from '../constants/neovateModels';

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
  const pkg = getLocalPackageInfo();
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

    if (options.sessionId) {
      console.log(
        `[NeovateSdkRunner] 调用 resumeSession: ${JSON.stringify({
          sessionId: options.sessionId,
          model,
          cwd: options.workDir,
          productName: pkg.name,
        })}`
      );
      session = await resumeSession(options.sessionId, {
        model,
        cwd: options.workDir,
        productName: pkg.name,
      });
    } else {
      console.log(
        `[NeovateSdkRunner] 调用 createSession: ${JSON.stringify({
          model,
          cwd: options.workDir,
          productName: pkg.name,
        })}`
      );
      session = await createSession({
        model,
        cwd: options.workDir,
        productName: pkg.name,
      });
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
      const line = `${JSON.stringify(msg)}\n`;
      output += line;
      if (options.onChunk) {
        options.onChunk(line);
      }
      if (
        msg
        && typeof msg === 'object'
        && (msg as any).type === 'result'
        && ((msg as any).isError || (msg as any).subtype === 'error')
      ) {
        error = new Error((msg as any).content || '模型执行失败');
        break;
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
    output,
    durationMs: Date.now() - start,
    sessionId: session?.sessionId,
    error: aborted ? new Error('aborted') : error,
  };
}

async function loadNeovateSdk(): Promise<{
  createSession: typeof import('@neovate/code').createSession;
  resumeSession: typeof import('@neovate/code').resumeSession;
}> {
  return import('@neovate/code');
}

function getLocalPackageInfo(): { name: string; version: string } {
  try {
    const pkg = require('../../package.json');
    return {
      name: typeof pkg?.name === 'string' ? pkg.name : 'neovate-sdk-client',
      version: typeof pkg?.version === 'string' ? pkg.version : '0.0.0',
    };
  } catch (error) {
    return { name: 'neovate-sdk-client', version: '0.0.0' };
  }
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
