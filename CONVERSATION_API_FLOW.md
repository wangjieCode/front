# /api/conversations 工作流程详解

## 📋 概述

`/api/conversations` 是对话管理的核心 API，负责创建对话会话、消息交互、分支管理和 MR 创建。

---

## 🔄 完整工作流程

### 1️⃣ 创建对话会话

**端点**: `POST /api/conversations`

**请求参数**:
```json
{
  "taskId": "task-123",
  "initialPrompt": "修改登录按钮颜色为蓝色",
  "projectInfo": {
    "workDir": "/data/repos/main-site",
    "gitBranch": "main"
  },
  "mode": "edit",           // 可选: "edit" 或 "readonly"
  "projectId": "uuid"       // 可选: 项目 ID
}
```

**处理流程**:
```
1. 验证参数
   ├─ 检查 taskId, initialPrompt
   ├─ 检查 projectInfo.workDir
   └─ 验证 mode 参数

2. 获取用户信息（可选）
   └─ 从 JWT Token 提取 userId

3. 创建会话
   └─ conversationManager.createSession()
      ├─ 生成 sessionId (UUID)
      ├─ 如果有 userId + projectId:
      │  ├─ 获取项目信息
      │  ├─ 生成 Worktree 路径
      │  ├─ 创建 Git Worktree
      │  └─ 更新 workDir 为 Worktree 路径
      │
      ├─ 根据模式处理 Git 操作:
      │  ├─ EDIT 模式:
      │  │  ├─ 检查 Git 状态
      │  │  ├─ Stash 未提交更改
      │  │  ├─ 创建新分支
      │  │  ├─ 推送到远程
      │  │  └─ 保存分支名到 context
      │  │
      │  └─ READONLY 模式:
      │     ├─ 丢弃所有更改
      │     └─ 切换到主分支
      │
      ├─ 创建会话对象
      ├─ 保存到数据库
      └─ 更新 conversations 表（userId, projectId, worktreePath）

4. 返回会话信息
   └─ 包含 sessionId, status, context 等
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "session-uuid",
    "taskId": "task-123",
    "status": "planning",
    "context": {
      "workDir": "/data/worktrees/main-site/zhangsan/session-uuid",
      "gitBranch": "feature/ai-abc123-1234567890",
      "mode": "edit"
    }
  }
}
```

---

### 2️⃣ 发送消息并获取 AI 响应

**端点**: `POST /api/conversations/:sessionId/messages`

**请求参数**:
```json
{
  "content": "请继续实现",
  "branchId": "branch-uuid"  // 可选: 指定分支
}
```

**处理流程**:
```
1. 验证会话存在
   └─ conversationManager.getSession(sessionId)

2. 切换分支（如果指定）
   └─ conversationManager.switchBranch(sessionId, branchId)

3. 处理用户消息
   └─ messageRouter.handleUserMessage(sessionId, content)
      ├─ 添加用户消息到会话
      └─ 保存到数据库

4. 设置 SSE 响应头
   ├─ Content-Type: text/event-stream
   ├─ Cache-Control: no-cache
   └─ Connection: keep-alive

5. 发送用户消息确认
   └─ data: {"type":"user_message","content":"..."}

6. 生成 AI 响应
   └─ aiService.generateResponse(context, content, sessionId)
      ├─ 调用 NeovateAIService
      ├─ 在 Worktree 中执行代码操作
      └─ 返回 stream-json 格式响应

7. 解析并流式发送响应
   ├─ parseAIResponse() 提取文本内容
   ├─ 按块发送 (每次 50 字符)
   │  └─ data: {"type":"chunk","content":"..."}
   └─ 每块延迟 10ms

8. 保存 AI 响应
   └─ messageRouter.handleAIResponse(sessionId, aiResponse)

9. 发送完成信号
   └─ data: {"type":"complete"}
```

**SSE 响应流**:
```
data: {"type":"user_message","content":"请继续实现"}

data: {"type":"chunk","content":"好的，我将继续实现登录按钮"}

data: {"type":"chunk","content":"的颜色修改功能。首先..."}

...

data: {"type":"complete"}
```

---

### 3️⃣ 获取对话历史

**端点**: `GET /api/conversations/:sessionId/messages`

**查询参数**:
- `branchId`: 指定分支（可选）
- `since`: 时间戳，只返回该时间之后的消息（可选）

**处理流程**:
```
1. 验证会话存在
2. 获取消息历史
   └─ conversationManager.getMessageHistory(sessionId, branchId)
3. 过滤消息（如果有 since 参数）
4. 返回消息列表
```

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "msg-uuid-1",
      "role": "user",
      "content": "修改登录按钮颜色",
      "timestamp": "2024-01-01T10:00:00Z"
    },
    {
      "id": "msg-uuid-2",
      "role": "assistant",
      "content": "好的，我将修改...",
      "timestamp": "2024-01-01T10:00:05Z"
    }
  ],
  "total": 2
}
```

---

### 4️⃣ 创建分支

**端点**: `POST /api/conversations/:sessionId/branches`

**请求参数**:
```json
{
  "fromMessageId": "msg-uuid",
  "branchName": "alternative-approach"
}
```

**处理流程**:
```
1. 验证参数
2. 创建分支
   └─ conversationManager.createBranch(sessionId, fromMessageId, branchName)
      ├─ 验证消息存在
      ├─ 创建分支记录
      ├─ 设置父消息 ID
      └─ 保存到数据库
3. 返回分支信息
```

---

### 5️⃣ 切换分支

**端点**: `PUT /api/conversations/:sessionId/branches/:branchId/activate`

**处理流程**:
```
1. 切换分支
   └─ conversationManager.switchBranch(sessionId, branchId)
      ├─ 验证分支存在
      ├─ 停用当前分支
      ├─ 激活目标分支
      └─ 更新 context.currentBranchId
2. 返回更新后的会话
```

---

### 6️⃣ 创建 Merge Request

**端点**: `POST /api/conversations/:sessionId/merge-request`

**处理流程**:
```
1. 验证会话存在
2. 创建 MR
   └─ conversationManager.createMergeRequest(sessionId)
      ├─ 检查模式（必须是 EDIT）
      ├─ 检查是否已有 MR
      ├─ 获取会话上下文
      ├─ 提交所有更改
      │  ├─ git add .
      │  └─ git commit
      ├─ 推送到远程
      │  └─ git push origin <branch>
      ├─ 调用 GitLab API 创建 MR
      │  └─ gitlabService.createMergeRequest()
      └─ 保存 MR URL 到 context
3. 返回 MR URL
```

**响应**:
```json
{
  "success": true,
  "data": {
    "mrUrl": "https://gitlab.com/project/merge_requests/123"
  }
}
```

---

### 7️⃣ 删除会话

**端点**: `DELETE /api/conversations/:sessionId`

**处理流程**:
```
1. 验证会话存在
2. 删除会话
   └─ conversationManager.deleteSession(sessionId)
      ├─ 获取会话信息
      ├─ 清理 Worktree（如果存在）
      │  └─ worktreeService.removeWorktree()
      ├─ 删除数据库记录
      │  ├─ conversations
      │  ├─ conversation_contexts
      │  ├─ branches
      │  └─ messages
      └─ 从内存中移除
3. 返回成功消息
```

---

## 🔐 认证机制

### 可选认证
- 使用 `optionalAuthMiddleware`
- 如果提供 JWT Token，提取 `userId`
- 未提供 Token 也可以使用（向后兼容）

### Token 格式
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

## 🌳 Git Worktree 工作流程

### 创建会话时
```
1. 检查是否有 userId + projectId
2. 如果有，创建独立 Worktree:
   
   主仓库:
   /data/repos/main-site/.git
   
   Worktree:
   /data/repos/main-site-worktrees/
     └─ zhangsan/
         └─ session-abc123/
             ├─ src/
             ├─ package.json
             └─ ...
   
3. 在 Worktree 中创建新分支:
   zhangsan-conversation-abc123-1234567890

4. 所有代码操作在 Worktree 中进行
```

### 删除会话时
```
1. 删除 Worktree 目录
2. 清理 Git 引用
3. 删除数据库记录
```

---

## 📊 数据库表关系

```
users (用户表)
  ├─ id (UUID)
  └─ username

projects (项目表)
  ├─ id (UUID)
  ├─ projectKey
  ├─ repoDir
  └─ worktreeBaseDir

conversations (对话表)
  ├─ id (UUID)
  ├─ sessionId
  ├─ userId (FK → users.id)
  ├─ projectId (FK → projects.id)
  └─ worktreePath

conversation_contexts (上下文表)
  ├─ id (UUID)
  ├─ conversationId (FK → conversations.id)
  ├─ workDir
  ├─ gitBranch
  ├─ mode
  └─ mrUrl

branches (分支表)
  ├─ id (UUID)
  ├─ conversationId (FK → conversations.id)
  ├─ name
  └─ isActive

messages (消息表)
  ├─ id (UUID)
  ├─ conversationId (FK → conversations.id)
  ├─ branchId (FK → branches.id)
  ├─ role (user/assistant)
  └─ content
```

---

## 🎯 关键服务类

### ConversationManager
- 会话生命周期管理
- Worktree 创建和清理
- Git 分支管理
- MR 创建

### MessageRouter
- 消息路由和处理
- 用户消息保存
- AI 响应保存

### ConversationAIService
- AI 响应生成
- 调用 NeovateAIService
- 代码操作执行

### GitService
- Git 操作封装
- 分支创建/切换
- 提交和推送
- Stash 管理

### GitWorktreeService
- Worktree 创建
- Worktree 删除
- Worktree 列表

### GitLabMCPService
- GitLab API 调用
- MR 创建
- 分支管理

---

## 🔍 错误处理

### 常见错误

1. **Git 操作失败**
   - 原因: 未提交的更改冲突
   - 解决: 自动 stash 更改

2. **Worktree 创建失败**
   - 原因: 路径已存在或权限不足
   - 解决: 清理旧 Worktree，重试 3 次

3. **会话不存在**
   - 原因: sessionId 无效
   - 解决: 返回 404 错误

4. **模式验证失败**
   - 原因: 在 READONLY 模式下尝试创建 MR
   - 解决: 返回 400 错误

---

## 📈 性能优化

### SSE 流式响应
- 按块发送（50 字符/块）
- 延迟 10ms/块
- 避免缓冲阻塞

### 数据库查询
- 使用索引（sessionId, userId, projectId）
- 分页查询历史消息
- 缓存会话信息

### Worktree 管理
- 延迟清理（会话删除时）
- 定期 prune 无效引用
- 并发控制（锁机制）

---

## 🚀 使用示例

### 完整对话流程

```javascript
// 1. 创建会话
const session = await fetch('/api/conversations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  },
  body: JSON.stringify({
    taskId: 'task-123',
    initialPrompt: '修改登录按钮颜色为蓝色',
    projectInfo: {
      workDir: '/data/repos/main-site',
      gitBranch: 'main'
    },
    mode: 'edit',
    projectId: 'project-uuid'
  })
});

const { data: { id: sessionId } } = await session.json();

// 2. 发送消息并接收流式响应
const eventSource = new EventSource(
  `/api/conversations/${sessionId}/messages`,
  {
    method: 'POST',
    body: JSON.stringify({ content: '请继续实现' })
  }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'user_message':
      console.log('用户:', data.content);
      break;
    case 'chunk':
      console.log('AI:', data.content);
      break;
    case 'complete':
      console.log('完成');
      eventSource.close();
      break;
    case 'error':
      console.error('错误:', data.message);
      break;
  }
};

// 3. 创建 MR
const mr = await fetch(`/api/conversations/${sessionId}/merge-request`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

const { data: { mrUrl } } = await mr.json();
console.log('MR 已创建:', mrUrl);

// 4. 删除会话
await fetch(`/api/conversations/${sessionId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer ' + token
  }
});
```

---

## 📝 总结

`/api/conversations` 提供了完整的对话管理功能：

✅ **多用户隔离**: 通过 Git Worktree 实现代码编辑隔离  
✅ **流式响应**: SSE 实时推送 AI 生成内容  
✅ **分支管理**: 支持多分支对话探索  
✅ **Git 集成**: 自动创建分支、提交、推送  
✅ **GitLab MCP**: 一键创建 Merge Request  
✅ **错误恢复**: 自动 stash、重试机制  
✅ **性能优化**: 索引、缓存、并发控制
