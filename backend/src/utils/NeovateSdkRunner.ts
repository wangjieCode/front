import { DEFAULT_NEOVATE_MODEL } from '../constants/neovateModels';

export interface NeovateSdkRunOptions {
  prompt: string;
  workDir: string;
  sessionId?: string;
  model?: string;
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
  const start = Date.now();
  let output = '';

  let error: Error | undefined;
  let session: Awaited<ReturnType<typeof createSession>> | null = null;
  let aborted = false;
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
    if (options.abortSignal?.aborted) {
      handleAbort();
      throw new Error('aborted');
    }

    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', handleAbort, { once: true });
    }

    session = options.sessionId
      ? await resumeSession(options.sessionId, {
          model,
          cwd: options.workDir,
          productName: pkg.name,
        })
      : await createSession({
          model,
          cwd: options.workDir,
          productName: pkg.name,
        });

    await session.send(options.prompt);

    for await (const msg of session.receive()) {
      if (aborted) {
        break;
      }
      const line = `${JSON.stringify(msg)}\n`;
      output += line;
      if (options.onChunk) {
        options.onChunk(line);
      }
    }
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
  } finally {
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
