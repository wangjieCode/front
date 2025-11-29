# API 接口文档

## 基础信息

**Base URL**: `http://localhost:3001`

**Content-Type**: `application/json`

## 对话管理 API

### 1. 创建对话

创建新的对话会话。

```http
POST /api/conversations
```

**请求体**:
```json
{
  "taskId": "string",           // 任务 ID
  "initialPrompt": "string",    // 初始提示词
  "projectInfo": {
    "workDir": "string",        // 工作目录
    "gitBranch": "string"       // Git 分支（可选）
  },
  "mode": "edit" | "readonly"   // 对话模式（可选，默认 edit）
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "string",
    "taskId": "string",
    "status": "planning",
    "context": {
      "mode": "edit",
      "currentBranchId": "string",
      "branches": [...]
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**模式说明**:
- `edit`: 编辑模式，AI 可以修改代码
- `readonly`: 只读模式，AI 只能查询代码

---

### 2. 获取对话列表

获取所有对话会话。

```http
GET /api/conversations
```

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "taskId": "string",
      "status": "completed",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 10
}
```

---

### 3. 获取对话详情

获取指定对话会话的详细信息。

```http
GET /api/conversations/:sessionId
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "string",
    "taskId": "string",
    "status": "executing",
    "context": {
      "projectInfo": {...},
      "taskDescription": "string",
      "messageHistory": ["msg1", "msg2"],
      "currentBranchId": "string",
      "branches": [...],
      "mode": "edit"
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 4. 发送消息（SSE 流式）

向对话发送用户消息，并通过 SSE 流式接收 AI 响应。

```http
POST /api/conversations/:sessionId/messages
```

**请求体**:
```json
{
  "content": "string",      // 消息内容
  "branchId": "string"      // 分支 ID（可选）
}
```

**响应**: SSE 流

```
data: {"type":"user_message","content":"用户消息"}

data: {"type":"chunk","content":"AI"}

data: {"type":"chunk","content":" 响应"}

data: {"type":"chunk","content":" 片段"}

data: {"type":"complete"}
```

**SSE 事件类型**:
- `user_message`: 用户消息确认
- `chunk`: AI 响应片段
- `complete`: 响应完成
- `error`: 错误信息

**前端接收示例**:
```javascript
const response = await fetch('/api/conversations/xxx/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: '你好' })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  const lines = text.split('\n\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      
      if (data.type === 'chunk') {
        // 处理 AI 响应片段
        console.log(data.content);
      } else if (data.type === 'complete') {
        // 响应完成
        break;
      }
    }
  }
}
```

---

### 5. 获取消息历史

获取对话的消息历史。

```http
GET /api/conversations/:sessionId/messages
```

**查询参数**:
- `branchId` (可选): 指定分支 ID
- `since` (可选): 时间戳，只返回该时间之后的消息

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "sessionId": "string",
      "branchId": "string",
      "role": "user" | "assistant",
      "content": "string",
      "metadata": {
        "isQuestion": false,
        "requiresResponse": false
      },
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 20
}
```

---

### 6. 获取单条消息

获取指定消息的详细信息。

```http
GET /api/conversations/:sessionId/messages/:messageId
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "string",
    "sessionId": "string",
    "branchId": "string",
    "role": "user",
    "content": "string",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 7. 获取会话状态

获取会话当前状态（用于轮询）。

```http
GET /api/conversations/:sessionId/status
```

**响应**:
```json
{
  "success": true,
  "data": {
    "status": "executing",
    "lastMessageId": "string",
    "hasNewMessages": true,
    "pendingQuestion": {
      "question": "string",
      "options": ["选项1", "选项2"]
    }
  }
}
```

---

## 分支管理 API

### 8. 创建分支

从指定消息创建新分支。

```http
POST /api/conversations/:sessionId/branches
```

**请求体**:
```json
{
  "fromMessageId": "string",    // 分支起点消息 ID
  "branchName": "string"        // 分支名称
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "parentMessageId": "string",
    "messageIds": ["msg1", "msg2"],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "isActive": false
  }
}
```

---

### 9. 切换分支

切换到指定分支。

```http
PUT /api/conversations/:sessionId/branches/:branchId/activate
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "string",
    "context": {
      "currentBranchId": "string",
      "branches": [...]
    }
  }
}
```

---

### 10. 获取分支列表

获取会话的所有分支。

```http
GET /api/conversations/:sessionId/branches
```

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "主分支",
      "parentMessageId": "",
      "messageIds": ["msg1", "msg2"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "isActive": true
    }
  ],
  "total": 3
}
```

---

## 健康检查 API

### 11. 健康检查

检查服务器状态。

```http
GET /health
```

**响应**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 12345.67
}
```

---

## 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 错误响应

所有错误响应遵循统一格式：

```json
{
  "success": false,
  "error": "错误信息描述"
}
```

---

## 数据模型

### ConversationStatus

对话状态枚举：

- `planning`: 规划中
- `executing`: 执行中
- `paused`: 已暂停
- `completed`: 已完成
- `failed`: 失败

### MessageRole

消息角色枚举：

- `user`: 用户消息
- `assistant`: AI 助手消息

### ConversationMode

对话模式枚举：

- `edit`: 编辑模式（可修改代码）
- `readonly`: 只读模式（仅查询）

---

## 使用示例

### 完整对话流程

```bash
# 1. 创建对话
curl -X POST http://localhost:3001/api/conversations \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-001",
    "initialPrompt": "帮我添加一个登录功能",
    "projectInfo": {
      "workDir": "./workspace",
      "gitBranch": "main"
    },
    "mode": "edit"
  }'

# 响应: { "success": true, "data": { "id": "session-123", ... } }

# 2. 发送消息（SSE 流式）
curl -X POST http://localhost:3001/api/conversations/session-123/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "请使用 JWT 认证"}'

# 3. 获取消息历史
curl http://localhost:3001/api/conversations/session-123/messages

# 4. 创建分支
curl -X POST http://localhost:3001/api/conversations/session-123/branches \
  -H "Content-Type: application/json" \
  -d '{
    "fromMessageId": "msg-456",
    "branchName": "尝试其他方案"
  }'

# 5. 切换分支
curl -X PUT http://localhost:3001/api/conversations/session-123/branches/branch-789/activate

# 6. 获取会话状态
curl http://localhost:3001/api/conversations/session-123/status
```

---

## 前端集成

### React 示例

```typescript
import { conversationService } from './services/conversationService';

// 创建对话
const session = await conversationService.createConversation({
  taskId: 'task-001',
  initialPrompt: '帮我添加登录功能',
  projectInfo: { workDir: './workspace' },
  mode: 'edit'
});

// 发送消息（SSE 流式）
await conversationService.sendMessage(
  session.data.id,
  '请使用 JWT 认证'
);

// 获取消息历史
const messages = await conversationService.getMessages(session.data.id);

// 开始轮询状态
conversationService.startPolling(
  session.data.id,
  (status) => {
    console.log('状态更新:', status);
  },
  (error) => {
    console.error('轮询错误:', error);
  }
);
```

---

## 注意事项

### 1. SSE 连接

- SSE 连接是单向的（服务器 → 客户端）
- 浏览器会自动重连
- 需要设置正确的响应头

### 2. 轮询策略

- 活跃轮询: 2 秒间隔
- 降频轮询: 5 秒间隔
- 无活动阈值: 30 秒

### 3. 会话管理

- 会话 ID 是唯一的
- 分支 ID 在会话内唯一
- 消息 ID 全局唯一

### 4. 并发控制

- 使用锁机制防止并发修改
- 事务保证数据一致性

---

## 性能优化

### 1. 缓存策略

- 会话和消息使用内存缓存
- 缓存自动失效

### 2. 增量加载

- 使用 `since` 参数只获取新消息
- 减少数据传输量

### 3. 流式传输

- SSE 实时推送，降低延迟
- 打字机效果提升用户体验

---

## 安全性

### 1. 输入验证

- 所有输入参数都经过验证
- 防止 SQL 注入和 XSS 攻击

### 2. 权限控制

- 模式验证（edit/readonly）
- 操作权限检查

### 3. 错误处理

- 统一的错误响应格式
- 详细的错误日志

---

## 更新日志

### v1.0.0 (2024-01-01)

- ✅ 对话管理 API
- ✅ SSE 流式响应
- ✅ 分支管理
- ✅ 消息历史
- ✅ 状态轮询
- ✅ 模式验证

---

## 联系支持

如有问题，请查看：
- [核心架构文档](CORE_ARCHITECTURE.md)
- [配置说明](CONFIGURATION.md)
- [README](README.md)
