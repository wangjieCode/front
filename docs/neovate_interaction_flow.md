# NeovateAIService 交互流程

## 整体架构

```
用户请求 → API 路由 → ConversationManager → ConversationAIService → NeovateAIService → Neovate CLI
```

## 详细流程

### 1. 用户发送消息

**入口**: `POST /api/conversations/:sessionId/messages`

```typescript
// backend/src/api/conversationRoutes.ts
router.post('/:sessionId/messages', async (req, res) => {
  const { sessionId } = req.params;
  const { content } = req.body;
  
  // 调用 MessageRouter 处理消息
  await messageRouter.handleUserMessage(sessionId, content);
});
```

### 2. MessageRouter 处理消息

**文件**: `backend/src/services/MessageRouter.ts`

```typescript
async handleUserMessage(sessionId: string, content: string) {
  // 1. 获取会话
  const session = await conversationManager.getSession(sessionId);
  
  // 2. 保存用户消息到数据库
  await conversationManager.addMessage(sessionId, MessageRole.USER, content);
  
  // 3. 触发 AI 响应（在 conversationRoutes 中调用）
}
```

### 3. ConversationAIService 生成响应

**文件**: `backend/src/services/ConversationAIService.ts`

```typescript
async generateResponse(context: ConversationContext, userMessage: string, sessionId: string) {
  // 1. 查询 Neovate 会话 ID（用于会话恢复）
  const neovateSessionId = await sessionManager.getSessionId(sessionId);
  
  // 2. 调用 NeovateAIService
  const result = await neovateService.modifyCode(
    userMessage,
    sessionId,
    neovateSessionId,
    context.projectInfo.workDir  // 使用 worktree 路径
  );
  
  // 3. 编辑模式：自动提交变更
  if (context.mode === ConversationMode.EDIT && result.success) {
    await commitChanges(context, userMessage);
  }
  
  // 4. 返回响应
  return {
    content: result.rawOutput,  // stream-json 格式
    metadata: {
      codeChanges: result.changes,
      toolCalls: extractToolCalls(result),
      gitBranch: context.gitBranch,
      mrUrl: context.mrUrl
    }
  };
}
```

### 4. NeovateAIService 执行 AI 操作

**文件**: `backend/src/services/NeovateAIService.ts`

```typescript
async modifyCode(
  prompt: string,
  conversationId: string,
  existingSessionId?: string,
  customWorkDir?: string
) {
  // 1. 构建 neovate 命令
  const command = buildCommand(prompt, existingSessionId, customWorkDir);
  // 示例: neovate -q --cwd "/path/to/worktree" --output-format stream-json --approval-mode yolo --resume <sessionId> "用户提示词"
  
  // 2. 执行命令（通过 SSHExecutor 或 LocalExecutor）
  const result = await sshExecutor.executeCommand(command, workDir, 60000);
  
  // 3. 解析输出
  // - 提取 Neovate 会话 ID（用于下次恢复）
  // - 清理 JSON 输出
  const neovateSessionId = extractSessionId(result.stdout);
  const cleanOutput = cleanJsonOutput(result.stdout);
  
  // 4. 保存会话 ID 到数据库
  if (conversationId && neovateSessionId) {
    await sessionManager.saveSessionId(conversationId, neovateSessionId, workDir);
  }
  
  // 5. 解析代码变更（通过 git diff）
  const changes = await parseOutput(cleanOutput, workDir);
  
  return {
    success: true,
    message: `成功修改代码，共 ${changes.length} 个文件变更`,
    changes,
    rawOutput: cleanOutput,
    neovateSessionId
  };
}
```

### 5. 会话管理（NeovateSessionManagerDB）

**文件**: `backend/src/services/NeovateSessionManagerDB.ts`

**作用**: 管理 Neovate 会话 ID 与对话 ID 的映射关系

```typescript
// 保存会话 ID
await sessionManager.saveSessionId(conversationId, neovateSessionId, workDir);

// 查询会话 ID
const neovateSessionId = await sessionManager.getSessionId(conversationId);
```

**数据库表**: `neovate_sessions`
- `conversation_id`: 对话 ID
- `neovate_session_id`: Neovate 会话 ID
- `work_dir`: 工作目录

## 关键数据流

### 会话创建流程

```
1. 用户创建对话（选择项目和模式）
   ↓
2. ConversationManager.createSession()
   - 获取项目信息
   - 编辑模式：创建 worktree 和分支
   - 只读模式：使用主仓库目录
   ↓
3. 保存会话到数据库
   - conversations 表：基本信息
   - conversation_contexts 表：上下文（包含 workDir、gitBranch）
```

### 消息处理流程

```
1. 用户发送消息
   ↓
2. MessageRouter.handleUserMessage()
   - 保存用户消息到 messages 表
   ↓
3. ConversationAIService.generateResponse()
   - 查询 Neovate 会话 ID
   - 调用 NeovateAIService
   ↓
4. NeovateAIService.modifyCode()
   - 执行 neovate 命令
   - 解析输出和代码变更
   - 保存 Neovate 会话 ID
   ↓
5. 返回响应
   - 保存 AI 消息到 messages 表
   - 保存元数据到 message_metadata 表
   ↓
6. 编辑模式：自动提交
   - git add .
   - git commit
   - git push
```

## 重要配置

### Neovate 命令参数

```bash
neovate \
  -q \                              # 非交互模式
  --cwd "/path/to/worktree" \       # 工作目录
  --output-format stream-json \     # 流式 JSON 输出
  --approval-mode yolo \            # 自动批准所有操作
  --resume <sessionId> \            # 恢复会话（可选）
  "用户提示词"
```

### 输出格式

Neovate 输出为 stream-json 格式，每行一个 JSON 对象：

```json
{"type":"thinking","content":"正在分析代码..."}
{"type":"action","action":"edit_file","file":"src/App.tsx"}
{"type":"result","success":true,"sessionId":"abc123"}
```

## 数据库表关系

```
conversations (对话基本信息)
  ├── conversation_contexts (对话上下文)
  │   ├── workDir (工作目录路径)
  │   ├── gitBranch (Git 分支)
  │   └── mrUrl (MR URL)
  ├── messages (消息列表)
  │   └── message_metadata (消息元数据)
  │       ├── codeChanges (代码变更)
  │       └── toolCalls (工具调用)
  └── neovate_sessions (Neovate 会话映射)
      └── neovate_session_id (Neovate 会话 ID)
```

## 会话恢复机制

1. **首次对话**: 不传递 `--resume` 参数，Neovate 创建新会话
2. **后续对话**: 传递 `--resume <sessionId>`，Neovate 恢复上下文
3. **会话 ID 存储**: 保存在 `neovate_sessions` 表中
4. **会话 ID 提取**: 从 Neovate 输出的 JSON 中提取 `sessionId` 字段

## 工作目录管理

### 编辑模式
- 使用独立的 worktree: `/path/to/worktrees/project-<uuid>/user-<uuid>`
- 每个对话有独立的 Git 分支
- 代码变更自动提交并推送

### 只读模式
- 使用主仓库目录: `/path/to/project`
- 不创建分支，不提交代码
- 仅用于代码查询和分析

## 错误处理

1. **命令执行失败**: 返回 `success: false` 和错误信息
2. **会话 ID 提取失败**: 不影响功能，下次创建新会话
3. **Git 操作失败**: 记录日志，不中断流程
4. **数据库操作失败**: 抛出异常，回滚事务
