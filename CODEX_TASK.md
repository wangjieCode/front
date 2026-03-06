# Codex Task: 为项目添加 Skill 支持

## 背景

当前系统通过 `NeovateSdkRunner.ts` 调用 Neovate SDK，但 `createSession`/`resumeSession` 未传入 `skills` 参数，导致无法加载自定义 Skill。

Neovate SDK（`@neovate/code`）的 `SDKSessionOptions` 已原生支持 `skills?: string[]`，接受 `SKILL.md` 文件或目录的绝对路径。

本任务目标：**打通 skills 参数链路，创建项目级 `skills/` 目录，并实现 `zadig-workflow-deploy` 作为首个落地 Skill。**

---

## 执行规则

- 每一步修改完成后执行 `pnpm -C backend build` 确认零 TypeScript 错误
- Skill 文件放在项目根目录的 `skills/<skill-name>/` 下
- `SKILL.md` 的 `name` 字段使用 kebab-case
- 不修改数据库 schema，不跑 migration
- 不修改前端代码（本任务仅后端 + skill 文件）

---

## Step 1：扩展 NeovateSdkRunner 支持 skills 参数

### 1.1 `backend/src/utils/NeovateSdkRunner.ts`

在 `NeovateSdkRunOptions` interface 中添加 `skills` 字段：

```ts
export interface NeovateSdkRunOptions {
  prompt: string;
  workDir: string;
  sessionId?: string;
  model?: string;
  timeoutMs?: number;
  onChunk?: (chunk: string) => void;
  abortSignal?: AbortSignal;
  skills?: string[];  // 新增
}
```

在 `createSession` 调用处传入 skills：

```ts
// 改前：
session = await createSession({
  model,
  cwd: options.workDir,
});

// 改后：
session = await createSession({
  model,
  cwd: options.workDir,
  ...(options.skills?.length ? { skills: options.skills } : {}),
});
```

在 `resumeSession` 调用处同样传入 skills：

```ts
// 改前：
session = await resumeSession(options.sessionId, {
  model,
  cwd: options.workDir,
});

// 改后：
session = await resumeSession(options.sessionId, {
  model,
  cwd: options.workDir,
  ...(options.skills?.length ? { skills: options.skills } : {}),
});
```

---

## Step 2：在 NeovateAIService 透传 skills

### 2.1 `backend/src/services/NeovateAIService.ts`

在 `modifyCodeStream` 和 `modifyCode` 方法签名添加 `skills` 参数：

```ts
async modifyCodeStream(
  prompt: string,
  conversationId: string | undefined,
  existingSessionId: string | undefined,
  customWorkDir: string | undefined,
  onData: (data: string) => void,
  model?: string,
  abortSignal?: AbortSignal,
  skills?: string[]  // 新增，放最后
): Promise<NeovateAIResult>

async modifyCode(
  prompt: string,
  conversationId?: string,
  existingSessionId?: string,
  customWorkDir?: string,
  model?: string,
  abortSignal?: AbortSignal,
  skills?: string[]  // 新增，放最后
): Promise<NeovateAIResult>
```

在私有 `execute` 方法签名添加 `skills` 参数，并透传给 `runWithRetry`：

```ts
private async execute(
  prompt: string,
  conversationId: string | undefined,
  existingSessionId: string | undefined,
  customWorkDir: string | undefined,
  model: string | undefined,
  abortSignal: AbortSignal | undefined,
  onChunk?: (chunk: string) => void,
  skills?: string[]  // 新增
): Promise<NeovateAIResult>
```

`runWithRetry` 同理接收并传给 `runNeovateSdk`：

```ts
private async runWithRetry(
  prompt: string,
  workDir: string,
  existingSessionId: string | undefined,
  model: string | undefined,
  abortSignal: AbortSignal | undefined,
  onChunk?: (chunk: string) => void,
  skills?: string[]  // 新增
): Promise<RunResult>
```

在 `runNeovateSdk` 调用处传入 skills：

```ts
let { output, durationMs, error, sessionId } = await runNeovateSdk({
  prompt,
  workDir,
  sessionId: existingSessionId,
  model,
  abortSignal,
  onChunk,
  skills,  // 新增
});
```

重试调用也同样传入：

```ts
const retry = await runNeovateSdk({ prompt, workDir, model, abortSignal, onChunk, skills });
```

---

## Step 3：在 ConversationAIService 解析并注入 skills

### 3.1 `backend/src/services/ConversationAIService.ts`

添加一个私有方法，用于从项目目录解析 skills 路径：

```ts
private resolveSkills(workDir: string): string[] {
  // 约定：项目根目录的 skills/ 子目录下每个子文件夹即一个 skill
  const skillsDir = path.join(workDir, 'skills');
  try {
    const fs = require('fs');
    if (!fs.existsSync(skillsDir)) return [];
    return fs.readdirSync(skillsDir)
      .map((name: string) => path.join(skillsDir, name))
      .filter((p: string) => fs.statSync(p).isDirectory());
  } catch {
    return [];
  }
}
```

> 注意：`workDir` 应指向**项目仓库根目录**（即 worktreePath 或 workDir），`skills/` 目录在代码仓库中存在。

在调用 `neovateAIService.modifyCodeStream` 和 `neovateAIService.modifyCode` 处，传入 `skills`：

```ts
// 解析 skills 路径
const skills = this.resolveSkills(projectWorkDir);

// 传给 modifyCodeStream：
await this.neovateAIService.modifyCodeStream(
  prompt,
  conversationId,
  existingSessionId,
  projectWorkDir,
  onData,
  model,
  abortSignal,
  skills  // 新增
);
```

---

## Step 4：编译验证

```bash
pnpm -C backend build
```

零错误则 Step 1-3 完成。

---

## Step 5：创建 skills 目录结构

在项目根目录创建 `skills/zadig-workflow-deploy/`：

```
skills/
└── zadig-workflow-deploy/
    ├── SKILL.md
    └── deploy.js
```

### 5.1 `skills/zadig-workflow-deploy/SKILL.md`

```markdown
---
name: zadig-workflow-deploy
description: 当用户需要发布到 Zadig 测试环境时使用。支持指定 workflow（FE-test01/test02/test03）、repo 和 branch 参数触发工作流发布。需要环境变量 ZADIG_TOKEN。
---

# Zadig Workflow Deploy

## 使用场景

当用户说"发布到测试环境"、"触发 Zadig 发布"、"部署到 FE-test01"等时调用本 skill。

## 参数

- `$1`：workflow 名称，允许值：`FE-test01`、`test02`、`test03`
- `$2`：repo 名称（用于在 preset 中匹配目标服务）
- `$3`：分支名称

## 执行步骤

1. 确认用户已设置 `ZADIG_TOKEN` 环境变量
2. 运行 `node $SKILL_DIR/deploy.js --workflow $1 --repo $2 --branch $3`
3. 如需预览 payload 不触发发布，追加 `--dry-run`

## 注意事项

- Token 仅从环境变量 `ZADIG_TOKEN` 读取，不接受命令行传入
- 若 repo 在 preset 中未匹配到，脚本会以非零退出码失败
- 若匹配到多个 target（>1），脚本会强制失败
```

### 5.2 `skills/zadig-workflow-deploy/deploy.js`

实现以下逻辑（Node.js 18+，使用内置 fetch）：

```js
#!/usr/bin/env node
/**
 * Zadig Workflow Deploy Script
 * 用法: node deploy.js --workflow <name> --repo <repo> --branch <branch> [--dry-run]
 *
 * 环境变量:
 *   ZADIG_TOKEN  Bearer token for Zadig Aslan API
 */

const BASE_URL = 'https://zadig.dtminds.cn';
const PROJECT = 'smp';
const ALLOWED_WORKFLOWS = ['FE-test01', 'test02', 'test03'];

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { workflow: '', repo: '', branch: '', dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workflow') result.workflow = args[++i];
    else if (args[i] === '--repo') result.repo = args[++i];
    else if (args[i] === '--branch') result.branch = args[++i];
    else if (args[i] === '--dry-run') result.dryRun = true;
  }
  return result;
}

async function apiFetch(method, path, body) {
  const token = process.env.ZADIG_TOKEN;
  if (!token) {
    console.error('[ERROR] 环境变量 ZADIG_TOKEN 未设置');
    process.exit(1);
  }
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[ERROR] ${method} ${url} => ${res.status}\n${text}`);
    process.exit(1);
  }
  return res.json();
}

async function main() {
  const { workflow, repo, branch, dryRun } = parseArgs();

  if (!workflow || !repo || !branch) {
    console.error('[ERROR] 必须提供 --workflow、--repo、--branch 参数');
    process.exit(1);
  }
  if (!ALLOWED_WORKFLOWS.includes(workflow)) {
    console.error(`[ERROR] workflow 仅允许: ${ALLOWED_WORKFLOWS.join(', ')}`);
    process.exit(1);
  }

  // 1. 获取 workflow 信息，推导 env
  const wfInfo = await apiFetch('GET', `/api/aslan/workflow/workflow/find/${workflow}`);
  const env = wfInfo.default_base_namespace || wfInfo.env_name;
  if (!env) {
    console.error('[ERROR] 无法从 workflow 信息推导 env，请检查 Zadig 返回结构');
    process.exit(1);
  }

  // 2. 获取 preset
  const preset = await apiFetch('GET', `/api/aslan/workflow/workflowtask/preset/${env}/${workflow}`);

  // 3. 按 repo 裁剪 targets，覆盖 branch
  const targets = (preset.targets || []).filter(t =>
    (t.repos || []).some(r => r.repo_name === repo || r.repo === repo)
  );

  if (targets.length !== 1) {
    console.error(`[ERROR] 期望命中 1 个 target，实际命中 ${targets.length}。repo="${repo}"\n命中详情: ${JSON.stringify(targets.map(t => t.name))}`);
    process.exit(1);
  }

  // 覆盖 branch
  targets[0].repos = (targets[0].repos || []).map(r => {
    if (r.repo_name === repo || r.repo === repo) {
      console.log(`[INFO] 覆盖分支: ${r.branch || '(无)'} → ${branch}`);
      return { ...r, branch };
    }
    return r;
  });

  const payload = { ...preset, targets };

  if (dryRun) {
    console.log('[DRY-RUN] 最终 payload:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('[DRY-RUN] 不触发发布');
    return;
  }

  // 4. 触发发布
  const result = await apiFetch('POST', `/api/aslan/workflow/workflowtask/${workflow}`, payload);
  console.log('[SUCCESS] 发布触发成功:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
```

---

## Step 6：整体验证

```bash
# 后端编译确认零错误
pnpm -C backend build

# 手动测试 dry-run（需设置 ZADIG_TOKEN）
ZADIG_TOKEN=<token> node skills/zadig-workflow-deploy/deploy.js \
  --workflow FE-test01 --repo front-app --branch main --dry-run
```

dry-run 输出完整 payload 且无报错则完成。

---

## 注意事项

1. `resolveSkills` 解析的是 **worktreePath**（即 AI 工作目录），该路径是仓库 checkout 的副本，`skills/` 目录会随代码一起 checkout 进来
2. 若项目无 `skills/` 目录，`resolveSkills` 返回空数组，不影响现有行为
3. `ZADIG_TOKEN` 由使用者在运行环境中配置，不提交到仓库
4. `deploy.js` 中 `wfInfo.default_base_namespace` 和 `wfInfo.env_name` 字段名需根据实际 Zadig API 返回结构确认，若字段不存在需调整
5. 后续新增 Skill 只需在 `skills/` 下新建子目录并放入 `SKILL.md` 即可自动加载，无需修改后端代码
