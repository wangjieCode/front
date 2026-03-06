# Codex Task: 去掉模式选择 + 简化 Worktree

## 背景

当前系统有两种对话模式（`ConversationMode`）：
- `EDIT`（编辑模式）：创建 git worktree，AI 可修改文件、commit、push、创建 MR
- `READONLY`（只读模式）：不创建 worktree，直接使用主仓库目录，AI 只能读

`READONLY` 模式几乎没有实际使用，维护它的分支逻辑散布全链路。
本任务目标：**删除 READONLY 模式和所有 mode 选择 UI，所有对话统一走编辑模式流程，同时去掉 WorktreeManager 中无意义的缓存层。**

---

## 执行规则

- 每一步修改完成后执行 `pnpm -C backend build` 和 `pnpm -C frontend build` 确认零错误
- 不跑数据库 migration（DB 的 `conversation_contexts.mode` 列保留，历史兼容）
- 删除文件前确认没有其他引用
- 测试文件中的 mode 相关 mock 也一并清理

---

## Step 1：后端 - 删除 ConversationMode 和 ModeValidator

### 1.1 `backend/src/types/index.ts`

**删除** `ConversationMode` enum（整个枚举块）：
```ts
// 删除这段：
export enum ConversationMode {
  EDIT = 'edit',
  READONLY = 'readonly'
}
```

**删除** `CreateConversationRequest` 中的 mode 字段：
```ts
// 删除：
mode?: ConversationMode;
```

**删除** `ConversationContext` 中的 mode 字段：
```ts
// 找到 ConversationContext interface，删除：
mode?: ConversationMode;
// 或
mode: ConversationMode;
```

**删除** `OperationType` 枚举中 `PREVIEW_PROJECT` 以外不再需要的内容（如果 OperationType 只用于 ModeValidator，则整个删除；如果还有其他地方用到则保留）。
> 检查方式：grep `OperationType` 看是否还有 ModeValidator 以外的引用。如果没有，整个删除 `OperationType` enum 和 `ValidationResult` interface。

**删除** `ValidationResult` interface（仅 ModeValidator 使用）。

### 1.2 `backend/src/services/ModeValidator.ts`

**删除整个文件**。

### 1.3 `backend/src/api/conversationRoutes.ts`

删除 mode 参数的解构和验证逻辑：
```ts
// 删除：
const { ..., mode, ... } = req.body;

// 删除：
if (mode && mode !== 'edit' && mode !== 'readonly') {
  return res.status(400).json({
    success: false,
    error: '无效的 mode 参数，必须是 "edit" 或 "readonly"',
  });
}
```

`createSession` 调用去掉 mode 参数：
```ts
// 改为（去掉 mode 参数）：
const session = await conversationManager.createSession(
  initialPrompt,
  projectInfo,
  req.userId!,
  resolvedModel
);
```

### 1.4 `backend/src/services/ConversationManager.ts`

**删除 import**：
```ts
import { ModeValidator } from "./ModeValidator";
// 同时删除：
import {
  ...
  ConversationMode,
  OperationType,
  ValidationResult,
  ...
} from "../types";
// ConversationMode、OperationType、ValidationResult 从 import 中移除
```

**删除属性**：
```ts
private modeValidator: ModeValidator;
private worktreeManager?: WorktreeManager;  // 注入但从未实际使用
```

**修改构造函数**，删除 `worktreeManager` 参数和 `modeValidator` 初始化：
```ts
constructor(
  storage: IConversationStorage,
  projectService: ProjectService,
  gitlabService?: GitLabMCPService,
  // 删除 worktreeManager?: WorktreeManager
) {
  this.storage = storage;
  this.projectService = projectService;
  // 删除 this.modeValidator = new ModeValidator();
  // 删除 this.worktreeManager = worktreeManager;
  this.gitlabService = gitlabService;
  ...
}
```

**修改 `createSession` 方法**，删除 mode 参数，内联 EDIT 模式逻辑：
```ts
// 改前：
async createSession(
  initialPrompt: string,
  projectInfo: ProjectInfo,
  mode: ConversationMode = ConversationMode.EDIT,
  userId: string,
  model?: string
)

// 改后：
async createSession(
  initialPrompt: string,
  projectInfo: ProjectInfo,
  userId: string,
  model?: string
)
```

在方法体内，删除 mode 参数写入 context（或固定写 'edit'，保持 DB 兼容）：
```ts
// context 构建时删除 mode 字段（或保留为固定字符串 'edit' 用于 DB 写入）
const context: ConversationContext = {
  projectInfo: completeProjectInfo,
  taskDescription: initialPrompt,
  messageHistory: [],
  variables: { environment: ..., model: ... },
  // 删除 mode,
};
```

替换 mode 分支，直接执行 EDIT 路径：
```ts
// 删除：
if (mode === ConversationMode.EDIT) {
  ...worktree 逻辑...
} else if (mode === ConversationMode.READONLY) {
  ...readonly 逻辑...
}

// 改为直接：
if (!this.worktreeManager && !projectWorktreeManager) {
  // 注意：worktreeManager 已从构造函数移除，此处直接调用 handleEditModeSetup
}
const gitResult = await this.handleEditModeSetup(sessionId, userId, project, completeProjectInfo.gitBranch);
if (!gitResult.success) throw new Error(`Git 操作失败: ${gitResult.error}`);
context.gitBranch = gitResult.branchName;
if (gitResult.worktreePath) {
  context.projectInfo = { ...context.projectInfo, workDir: gitResult.worktreePath, worktreePath: gitResult.worktreePath };
}
```

**修改 `validateMRPreconditions`**，删除 mode 检查：
```ts
// 删除：
if (session.context.mode !== ConversationMode.EDIT) return { error: "只有编辑模式才能创建 MR" };
```

所有其他 `ConversationMode` 引用一并清理（grep 确认）。

### 1.5 `backend/src/services/ConversationAIService.ts`

3处 `context.mode === ConversationMode.EDIT` 条件，直接取 true 分支：

**第1处**（约 line 115）：
```ts
// 改前：
const projectWorkDir = context.mode === ConversationMode.EDIT && context.projectInfo.worktreePath
  ? context.projectInfo.worktreePath
  : context.projectInfo.workDir;

// 改后：
const projectWorkDir = context.projectInfo.worktreePath ?? context.projectInfo.workDir;
```

**第2处**（约 line 135）：
```ts
// 改前：
if (context.mode === ConversationMode.EDIT && result.success && result.changes.length > 0) {

// 改后：
if (result.success && result.changes.length > 0) {
```

**第3处**（约 line 227，generateResponse 方法中）：
同第1处处理方式。

**第4处**（约 line 245，generateResponse 中的 commit 判断）：
同第2处处理方式。

**第5处**（约 line 298，commitChanges 方法中）：
```ts
// 改前：
const workDir = context.mode === ConversationMode.EDIT && context.projectInfo.worktreePath
  ? context.projectInfo.worktreePath
  : context.projectInfo.workDir;

// 改后：
const workDir = context.projectInfo.worktreePath ?? context.projectInfo.workDir;
```

删除 `ConversationMode` 的 import。

### 1.6 `backend/src/storage/ConversationStorageAdapter.ts`

删除 `ConversationMode` import。

所有 `mode` 字段处理：
- `saveSession`/`saveContext` 中写 mode 的地方：改为固定字符串 `'edit'` 或直接删除该字段（DB 列有 default 'edit'）
- `loadSession`/`loadContext` 中读 mode 的地方：删除赋值到 context.mode 的代码（context 类型已无 mode 字段）

### 1.7 `backend/src/storage/DrizzleConversationStorage.ts`

同 1.6，所有 `mode` 字段读写：
- 写入时固定 `'edit'` 或省略（DB default）
- 读取时不再赋给 context 对象

### 1.8 `backend/src/services/init.ts`

构造 `ConversationManager` 时删除 `worktreeManager` 参数：
```ts
// 改前：
new ConversationManager(storage, projectService, gitlabService, worktreeManager)

// 改后：
new ConversationManager(storage, projectService, gitlabService)
```

如果 `worktreeManager` 只在 `ConversationManager` 中使用，检查是否还有其他地方引用，没有则删除其实例化。

### 1.9 测试文件清理

- `backend/src/__tests__/conversationManager.test.ts`：删除 READONLY 相关测试用例，其他用例去掉 mode 参数
- `backend/src/__tests__/conversationAIService.test.ts`：删除 `mode: ConversationMode.EDIT` 字段
- `backend/src/__tests__/drizzleConversationStorage.test.ts`：删除 `mode: 'edit'`/`mode: 'readonly'` 字段

---

## Step 2：后端 - WorktreeManager 去缓存层

### 2.1 `backend/src/services/WorktreeManager.ts`

**删除**以下属性和相关 import：
```ts
private cache = new LruCacheService();
private cacheStrategyManager = new CacheStrategyManager(this.cache);
private worktreeInfoCacheTtlSeconds = 0;
```

**删除** import：
```ts
import { LruCacheService } from './LruCacheService';
import { CacheStrategyManager } from './CacheStrategyManager';
```

**修改 `createConversationWorktree`**，删除末尾的 cache set：
```ts
// 删除：
await this.cacheStrategyManager.set(this.getWorktreeCacheKey(userId, sessionId), worktreeInfo, this.worktreeInfoCacheTtlSeconds);
```

**修改 `getWorktreeInfo`**，删除缓存读写，直接计算：
```ts
async getWorktreeInfo(userId: string, sessionId: string): Promise<WorktreeInfo> {
  const worktreePath = this.getConversationWorktreePath(userId, sessionId);
  const exists = await this.conversationWorktreeExists(userId, sessionId);
  if (!exists) {
    throw new Error(`对话 ${sessionId} 的 worktree 不存在`);
  }
  const branchResult = await this.executor.executeCommand('git branch --show-current', worktreePath);
  const now = new Date();
  return {
    userId,
    sessionId,
    worktreePath,
    branchName: branchResult.stdout.trim(),
    createdAt: now,
    lastUsedAt: now,
  };
}
```

**删除** `getWorktreeCacheKey` 私有方法（不再需要）。

**修改 `removeConversationWorktree`**，删除末尾的 cache del：
```ts
// 删除：
await this.cacheStrategyManager.del(this.getWorktreeCacheKey(userId, sessionId));
```

---

## Step 3：前端 - 删除模式选择 UI

### 3.1 删除文件

```
frontend/src/components/ModeSelector.tsx          → 删除
frontend/src/mobile-components/MobileModeSelector.tsx → 删除
```

### 3.2 `frontend/src/hooks/useAppLogic.ts`

**删除** mode state 和相关逻辑：
```ts
// 删除：
const [mode, setMode] = useState<ConversationMode>(ConversationMode.READONLY);

// handleSubmit 签名去掉 conversationMode 参数：
const handleSubmit = async (
  promptText: string,
  // 删除 conversationMode: ConversationMode,
  projectId?: string,
  baseBranch?: string,
  model?: string,
  initialImages?: ImageAttachment[]
) => {

// 删除 API 调用中的 mode：
const response = await conversationService.createConversation({
  initialPrompt: promptText,
  projectId,
  baseBranch,
  // 删除 mode: conversationMode,
  model,
});

// handleConversationClick 中删除：
setMode(conversation.context?.mode || ConversationMode.EDIT);
// 改为只保留 navigate：
navigate(`/chat/${conversation.id}`, { state: { session: conversation } });

// handleNewConversation 中删除：
setMode(ConversationMode.READONLY);

// return 中删除 mode 和 setMode
```

**删除** `ConversationMode` import。

### 3.3 `frontend/src/App.tsx`

删除 `mode` 和 `setMode` 的解构，删除 `ChatRoute` 的 mode/onModeChange props：
```tsx
// 解构中删除：
mode,
setMode,

// ChatRoute 中删除：
mode={mode}
onModeChange={setMode}
```

### 3.4 `frontend/src/components/ChatRoute.tsx`

删除 mode/onModeChange props 定义和传递：
```tsx
// interface 中删除：
mode: ConversationMode;
onModeChange: (mode: ConversationMode) => void;

// 组件参数中删除，传给 ConversationView 时删除：
mode={mode}
onModeChange={onModeChange}
```

### 3.5 `frontend/src/components/ConversationView.tsx`

**删除** mode/onModeChange props：
```tsx
// interface 中删除：
mode?: ConversationMode;
onModeChange?: (mode: ConversationMode) => void;

// 默认值中删除：
mode = ConversationMode.READONLY,

// onNewConversation 类型签名去掉 mode 参数：
onNewConversation: (
  prompt: string,
  // 删除 mode: ConversationMode,
  projectId?: string,
  baseBranch?: string,
  model?: string,
  attachments?: ImageAttachment[]
) => void;
```

**删除** `<ModeSelector>` 渲染（约 line 1008-1012）：
```tsx
// 删除整个 div.create-field-mode：
<div className="create-field create-field-mode">
  ...
  <ModeSelector value={mode} onChange={onModeChange || (() => { })} />
</div>
```

**修改** `onNewConversation` 调用，去掉 mode 参数（约 line 393）：
```tsx
await onNewConversation(prompt, /* 删除 mode, */ selectedProjectId, baseBranch, selectedModel, createAttachments);
```

**保留** `session.context?.mode === 'edit'` 的读取判断（约 line 1281, 1340）——这些是根据已有会话数据判断，不是让用户选择，可暂时保留（DB 数据兼容）。

**删除** `ModeSelector` import。
**删除** `ConversationMode` import（如无其他引用）。

### 3.6 `frontend/src/components/ConversationList.tsx`

删除 mode-pill 显示（约 line 41, 90-92）：
```tsx
// 删除：
const mode = conv?.context?.mode || ConversationMode.EDIT;

// 删除 mode-pill div：
<div className={`mode-pill ${mode === ConversationMode.EDIT ? 'edit' : ''}`}>
  {mode === ConversationMode.EDIT ? <EditOutlined .../> : <ReadOutlined .../>}
  <span>{mode === ConversationMode.EDIT ? '编辑' : '只读'}</span>
</div>
```

删除 `ConversationMode` import，删除 `EditOutlined`/`ReadOutlined` import（如仅用于 mode-pill）。

### 3.7 Mobile 同步修改

对以下 mobile 文件做与桌面版相同的修改：

- `frontend/src/AppMobile.tsx` — 同 App.tsx
- `frontend/src/mobile-components/MobileChatRoute.tsx` — 同 ChatRoute.tsx
- `frontend/src/mobile-components/MobileConversationView.tsx` — 同 ConversationView.tsx（删 MobileModeSelector，删 mode prop，修改 onNewConversation 签名）
- `frontend/src/mobile-components/MobileCreateConversation.tsx` — 删除 mode/onModeChange props，删 `<MobileModeSelector>`，修改 onNewConversation 调用
- `frontend/src/mobile-components/MobileConversationList.tsx` — 同 ConversationList.tsx

### 3.8 `frontend/src/components/__tests__/ConversationView.test.tsx`

删除 `mode: ConversationMode.EDIT` mock 字段。

---

## Step 4：清理共享类型（frontend shared）

检查 `frontend/src/types/conversation.ts`（或类似路径）中是否有 `ConversationMode` 定义，如有则删除。

检查 `packages/shared` 或 `shared/` 目录下是否有 `ConversationMode` 导出，如有则删除。

---

## Step 5：验证

```bash
# 后端编译
pnpm -C backend build

# 前端编译
pnpm -C frontend build
```

两者均无 TypeScript 错误则完成。

---

## 注意事项

1. **不要**修改 `DB schema` 或跑 migration，`conversation_contexts.mode` 列保留
2. `session.context?.mode === 'edit'` 这类**读取已有会话数据**的判断（ConversationView 约 line 1281/1340，MobileConversationView 约 line 1170/1229）暂时保留，因为历史 DB 数据中有 mode 字段
3. `ConversationContext` 类型的 `mode` 字段删除后，上述读取会变成 `(session.context as any)?.mode === 'edit'` 或者直接删除该条件判断（因为所有新会话都会有 worktreePath，可改用 `session.context?.projectInfo?.worktreePath` 来判断）
4. `WorktreeManager` 的 `globalCleanupWorktrees`、`cleanupArchivedWorktrees` 等方法保持不变，`CleanupTask.ts` 无需修改
5. `handleEditModeSetup` 在 `ConversationManager` 中保留（内部逻辑无需改动）
