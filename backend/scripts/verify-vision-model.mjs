import { existsSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const DEFAULT_MODEL = 'qwen3-vl-plus';
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_PROMPT = '请识别图片中的核心内容，只回复 OK。';
const DEFAULT_IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAFUlEQVRYR+3BAQ0AAADCoPdPbQ43oAAAAAAAAF4G4kAAAXYQ8xQAAAAASUVORK5CYII=';

const envProductionPath = path.resolve(process.cwd(), '.env');
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
      options.help = true;
      continue;
    }

    if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
      continue;
    }
    if (arg === '--model') {
      options.model = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
      continue;
    }
    if (arg === '--base-url') {
      options.baseUrl = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--api-key=')) {
      options.apiKey = arg.slice('--api-key='.length);
      continue;
    }
    if (arg === '--api-key') {
      options.apiKey = argv[i + 1];
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
      options.timeoutMs = Number(arg.slice('--timeout='.length));
      continue;
    }
    if (arg === '--timeout') {
      options.timeoutMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg.startsWith('--image-url=')) {
      options.imageUrl = arg.slice('--image-url='.length);
      continue;
    }
    if (arg === '--image-url') {
      options.imageUrl = argv[i + 1];
      i += 1;
      continue;
    }
  }

  return options;
}

function printHelp() {
  console.log('Usage: pnpm --dir backend verify:vision [options]');
  console.log('');
  console.log('Options:');
  console.log('  --model <model>         覆盖视觉模型（默认 MIDSCENE_MODEL_NAME 或 qwen3-vl-plus）');
  console.log('  --base-url <url>        覆盖视觉模型 Base URL（默认 MIDSCENE_MODEL_BASE_URL）');
  console.log('  --api-key <key>         覆盖视觉模型 API Key（默认 MIDSCENE_MODEL_API_KEY）');
  console.log('  --prompt <text>         覆盖验证提示词');
  console.log('  --timeout <ms>          请求超时（默认 20000）');
  console.log('  --image-url <url/data>  覆盖测试图片 URL 或 data URL');
}

function maskApiKey(apiKey) {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
}

function requireEnvValue(value, name) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} 未设置，请先配置环境变量。`);
  }
  return normalized;
}

function extractResponseText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        if (part && typeof part.content === 'string') return part.content;
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

async function verifyVisionModel() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const baseUrl = requireEnvValue(args.baseUrl || process.env.MIDSCENE_MODEL_BASE_URL, 'MIDSCENE_MODEL_BASE_URL');
  const apiKey = requireEnvValue(args.apiKey || process.env.MIDSCENE_MODEL_API_KEY, 'MIDSCENE_MODEL_API_KEY');
  const model = (args.model || process.env.MIDSCENE_MODEL_NAME || DEFAULT_MODEL).trim();
  const prompt = args.prompt || DEFAULT_PROMPT;
  const imageUrl = args.imageUrl || DEFAULT_IMAGE_DATA_URL;
  const timeoutMs = Number.isFinite(args.timeoutMs) ? Number(args.timeoutMs) : DEFAULT_TIMEOUT_MS;

  const endpoint = new URL('chat/completions', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();

  console.log('[VisionVerify] 开始验证视觉模型提供方可用性');
  console.log(`[VisionVerify] baseUrl: ${baseUrl}`);
  console.log(`[VisionVerify] endpoint: ${endpoint}`);
  console.log(`[VisionVerify] apiKey: ${maskApiKey(apiKey)}`);
  console.log(`[VisionVerify] model: ${model}`);
  console.log(`[VisionVerify] timeoutMs: ${timeoutMs}`);

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你是视觉模型可用性验证助手，请简短回答。',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        temperature: 0,
        stream: false,
      }),
      signal: abortController.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const providerMessage = payload?.error?.message || response.statusText || 'unknown error';
      throw new Error(`提供方返回失败: HTTP ${response.status} - ${providerMessage}`);
    }

    const text = extractResponseText(payload);
    if (!text) {
      throw new Error('提供方请求成功，但未返回有效文本内容。');
    }

    console.log('[VisionVerify] ✅ 验证成功，视觉模型与提供方可用。');
    console.log('[VisionVerify] 视觉模型提取特征:');
    console.log(text);
  } finally {
    clearTimeout(timeout);
  }
}

verifyVisionModel().catch((error) => {
  console.error('[VisionVerify] ❌ 验证失败:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
