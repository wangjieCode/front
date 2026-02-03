import { existsSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createSession } from '@neovate/code';

const DEFAULT_MODEL = 'iflow/qwen3-coder-plus';

const envProductionPath = path.resolve(process.cwd(), '.env.production');
if (existsSync(envProductionPath)) {
  dotenv.config({ path: envProductionPath });
} else {
  dotenv.config();
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg.startsWith('--model=')) {
      options.model = arg.split('=')[1];
      continue;
    }

    if (arg === '--model') {
      options.model = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--workdir=')) {
      options.workDir = arg.split('=')[1];
      continue;
    }

    if (arg === '--workdir') {
      options.workDir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--prompt=')) {
      options.prompt = arg.slice('--prompt='.length);
      continue;
    }

    if (arg === '--prompt') {
      options.prompt = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--timeout=')) {
      options.timeoutMs = Number(arg.split('=')[1]);
      continue;
    }

    if (arg === '--timeout') {
      options.timeoutMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  return options;
}

function printHelp() {
  console.log('Usage: pnpm --dir backend verify:neovate [options]');
  console.log('');
  console.log('Options:');
  console.log('  --model <model>       Override model (default: iflow/qwen3-coder-plus)');
  console.log('  --workdir <path>      Working directory (default: process.cwd())');
  console.log('  --prompt <text>       Prompt to send (default: Respond with "OK" only.)');
  console.log('  --timeout <ms>        Timeout in ms (default: 20000)');
}

function requireApiKey() {
  const apiKey = process.env.IFLOW_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('IFLOW_API_KEY 未设置，请先配置环境变量。');
  }
  return apiKey;
}

function maskApiKey(apiKey) {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
}

function extractAssistantText(message) {
  if (typeof message?.text === 'string') {
    return message.text;
  }

  if (Array.isArray(message?.content)) {
    const parts = message.content
      .filter((item) => item?.type === 'text' && typeof item?.text === 'string')
      .map((item) => item.text);
    return parts.join('');
  }

  return '';
}

async function verifyNeovateSdk() {
  const apiKey = requireApiKey();

  const args = parseArgs(process.argv.slice(2));
  const options = {
    model: args.model || DEFAULT_MODEL,
    workDir: args.workDir || process.cwd(),
    prompt: args.prompt || 'Respond with "OK" only.',
    timeoutMs: Number.isFinite(args.timeoutMs) ? Number(args.timeoutMs) : 20000,
  };

  console.log('[NeovateVerify] 开始验证 IFLOW_API_KEY 与模型可用性');
  console.log(`[NeovateVerify] apiKey: ${maskApiKey(apiKey)}`);
  console.log(`[NeovateVerify] model: ${options.model}`);
  console.log(`[NeovateVerify] workDir: ${options.workDir}`);
  console.log(`[NeovateVerify] timeoutMs: ${options.timeoutMs}`);

  let session = null;
  let timedOut = false;
  let receivedMessages = 0;
  let receivedAssistant = false;
  let assistantText = '';
  let resultMessage = null;

  const timeout = setTimeout(() => {
    timedOut = true;
    if (session) {
      try {
        session.close();
      } catch {
        // ignore
      }
    }
  }, options.timeoutMs);

  try {
    session = await createSession({
      model: options.model,
      cwd: options.workDir,
      productName: 'neovate-sdk-verify',
    });

    await session.send(options.prompt);

    for await (const message of session.receive()) {
      receivedMessages += 1;

      if (message?.type === 'result') {
        resultMessage = message;
        break;
      }

      if (message?.role === 'assistant' && message?.type === 'message') {
        receivedAssistant = true;
        assistantText += extractAssistantText(message);
      }

      if (timedOut) {
        break;
      }
    }
  } finally {
    clearTimeout(timeout);
    if (session) {
      try {
        session.close();
      } catch {
        // ignore
      }
    }
  }

  if (timedOut) {
    throw new Error('验证超时，未在规定时间内收到响应。');
  }

  if (!resultMessage && !receivedAssistant) {
    throw new Error('未收到模型响应，请检查 IFLOW_API_KEY 与网络环境。');
  }

  if (resultMessage?.isError || resultMessage?.subtype === 'error') {
    throw new Error(`模型返回错误结果：${resultMessage?.content || 'unknown error'}`);
  }

  console.log('[NeovateVerify] ✅ 验证成功，已与模型完成交互。');
  if (assistantText.trim()) {
    console.log(`[NeovateVerify] assistant: ${assistantText.trim().slice(0, 200)}`);
  }
  console.log(`[NeovateVerify] messages: ${receivedMessages}`);
}

verifyNeovateSdk().catch((error) => {
  console.error('[NeovateVerify] ❌ 验证失败:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
