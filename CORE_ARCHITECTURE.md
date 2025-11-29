# 核心架构与数据流汇总

## 项目概述

Web 前端实习生助手系统 - 基于 AI 的代码修改和查询系统，支持编辑模式和只读模式。

## 核心数据流

### 1. 对话创建流程

```
前端 → POST /api/conversations
  ↓
conversationRoutes.createConversationRoutes()
  ↓
ConversationManager.createSession()
  ↓
DrizzleConversationStorage.saveSession()
  ↓
Supabase PostgreSQL
```

**关键数据**:
- `taskId`: 任务 ID
- `initialPrompt`: 初始提示词
- `projectInfo`: 项目信息（workDir, gitBranch）
- `mode`: 对话模式（edit/readonly）

### 2. 消息发送流程（SSE 流式响应）

```
前端 → POST /api/conversations/:sessionId/messages
  ↓
conversationRoutes (SSE 响应头设置)
  ↓
MessageRouter.handleUserMessage()
  ↓
ConversationManager.addMessage() (保存用户消息)
  ↓
ConversationAIService.generateResponse()
  ↓
NeovateAIService.modifyCode()
  ↓
SSHExecutor/LocalExecutor.executeCommand()
  ↓
neovate CLI (AI 代码工具)
  ↓
解析 stream-json 输出
  ↓
SSE 流式发送到前端 (chunk by chunk)
  ↓
MessageRouter.handleAIResponse() (保存 AI 响应)
  ↓
DrizzleConversationStorage.saveMessage()
```

**SSE 事件类型**:
- `user_message`: 用户消息确认
- `chunk`: AI 响应片段
- `complete`: 响应完成
- `error`: 错误信息

### 3. 消息历史查询流程

```
前端 → GET /api/conversations/:sessionId/messages
  ↓
conversationRoutes
  ↓
ConversationManager.getMessageHistory()
  ↓
DrizzleConversationStorage.loadMessages()
  ↓
Supabase PostgreSQL
  ↓
返回消息列表
```

**支持参数**:
- `branchId`: 指定分支
- `since`: 增量获取（时间戳）

## 核心接口

### 对话管理接口

#### 1. 创建对话
```typescript
POST /api/conversations
Body: {
  taskId: string;
  initialPrompt: string;
  projectInfo: {
    workDir: string;
    gitBranch?: string;
  };
  mode?: 'edit' | 'readonly';
}
Response: {
  success: boolean;
  data: ConversationSession;
}
```

#### 2. 获取对话列表
```typescript
GET /api/conversations
Response: {
  success: boolean;
  data: ConversationSession[];
  total: number;
}
```

#### 3. 获取对话详情
```typescript
GET /api/conversations/:sessionId
Response: {
  success: boolean;
  data: ConversationSession;
}
```

#### 4. 发送消息（SSE 流式）
```typescript
POST /api/conversations/:sessionId/messages
Body: {
  content: string;
  branchId?: string;
}
Response: SSE Stream
  - data: {"type":"user_message","content":"..."}
  - data: {"type":"chunk","content":"..."}
  - data: {"type":"complete"}
```

#### 5. 获取消息历史
```typescript
GET /api/conversations/:sessionId/messages?branchId=xxx&since=xxx
Response: {
  success: boolean;
  data: ConversationMessage[];
  total: number;
}
```

#### 6. 获取会话状态
```typescript
GET /api/conversations/:sessionId/status
Response: {
  success: boolean;
  data: {
    status: ConversationStatus;
    lastMessageId: string;
    hasNewMessages: boolean;
    pendingQuestion?: {
      question: string;
      options?: string[];
    };
  };
}
```

### 分支管理接口

#### 7. 创建分支
```typescript
POST /api/conversations/:sessionId/branches
Body: {
  fromMessageId: string;
  branchName: string;
}
Response: {
  success: boolean;
  data: ConversationBranch;
}
```

#### 8. 切换分支
```typescript
PUT /api/conversations/:sessionId/branches/:branchId/activate
Response: {
  success: boolean;
  data: ConversationSession;
}
```

#### 9. 获取分支列表
```typescript
GET /api/conversations/:sessionId/branches
Response: {
  success: boolean;
  data: ConversationBranch[];
  total: number;
}
```

## 核心服务类

### 1. ConversationManager
**职责**: 对话会话生命周期管理

**核心方法**:
- `createSession()`: 创建会话
- `getSession()`: 获取会话
- `addMessage()`: 添加消息
- `getMessageHistory()`: 获取消息历史
- `updateSessionStatus()`: 更新会话状态
- `createBranch()`: 创建分支
- `switchBranch()`: 切换分支

### 2. MessageRouter
**职责**: 消息路由和协调

**核心方法**:
- `handleUserMessage()`: 处理用户消息
- `handleAIResponse()`: 处理 AI 响应
- `pauseForUserInput()`: 暂停等待用户输入
- `resumeExecution()`: 恢复执行
- `getPendingQuestion()`: 获取待回答问题

### 3. ConversationAIService
**职责**: AI 响应生成

**核心方法**:
- `generateResponse()`: 生成 AI 响应
- 内部调用 `NeovateAIService.modifyCode()`

### 4. NeovateAIService
**职责**: neovate CLI 调用和输出解析

**核心方法**:
- `modifyCode()`: 执行代码修改
- `buildCommand()`: 构建 neovate 命令
- `parseOutput()`: 解析输出（stream-json 格式）

**命令格式**:
```bash
neovate -q --cwd "/path" --output-format stream-json --approval-mode yolo "prompt"
```

**会话恢复**:
```bash
neovate -q --cwd "/path" --output-format stream-json --approval-mode yolo --resume {sessionId} "prompt"
```

### 5. DrizzleConversationStorage
**职责**: 数据持久化（Supabase PostgreSQL）

**核心方法**:
- `saveSession()`: 保存会话
- `loadSession()`: 加载会话
- `saveMessage()`: 保存消息
- `loadMessages()`: 加载消息
- `saveContext()`: 保存上下文
- `saveBranch()`: 保存分支

**缓存策略**: 内存缓存 + 数据库持久化

### 6. SSHExecutor / LocalExecutor
**职责**: 命令执行

**模式**:
- `LocalExecutor`: 本机执行（开发模式）
- `SSHExecutor`: 远程执行（生产模式）

**核心方法**:
- `executeCommand()`: 执行命令
- 返回: `{ stdout, stderr, exitCode }`

## 数据模型

### ConversationSession
```typescript
{
  id: string;                    // 会话 ID
  taskId: string;                // 任务 ID
  status: ConversationStatus;    // 状态
  context: ConversationContext;  // 上下文
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}
```

### ConversationMessage
```typescript
{
  id: string;
  sessionId: string;
  branchId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: MessageMetadata;
  timestamp: Date;
}
```

### ConversationContext
```typescript
{
  projectInfo: ProjectInfo;
  taskDescription: string;
  messageHistory: string[];      // 消息 ID 列表
  currentBranchId: string;
  branches: ConversationBranch[];
  variables: Record<string, any>;
  mode: 'edit' | 'readonly';
}
```

### ConversationBranch
```typescript
{
  id: string;
  name: string;
  parentMessageId: string;
  messageIds: string[];
  createdAt: Date;
  isActive: boolean;
}
```

## 前端核心组件

### 1. ConversationView
**职责**: 对话视图主组件

**功能**:
- 显示对话历史
- 消息输入
- SSE 流式接收
- 自动滚动

### 2. MessageList
**职责**: 消息列表展示

### 3. MessageInput
**职责**: 消息输入框

### 4. conversationService
**职责**: 前端 API 服务

**核心方法**:
- `createConversation()`: 创建对话
- `sendMessage()`: 发送消息（SSE）
- `getMessages()`: 获取消息
- `startPolling()`: 开始轮询状态
- `stopPolling()`: 停止轮询

**轮询策略**:
- 活跃轮询: 2 秒
- 降频轮询: 5 秒
- 无活动阈值: 30 秒
- 最大重试: 3 次

## 配置管理

### 环境变量
```bash
# 数据库
DATABASE_URL=postgresql://...

# 运行模式
RUN_MODE=local|remote

# Git 配置
GIT_WORK_DIR=./workspace
GIT_DEFAULT_BRANCH=main

# GitLab 配置
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=xxx
GITLAB_PROJECT_ID=xxx

# AI 工具配置
CODE_TOOL_TYPE=neovate
IFLOW_API_KEY=xxx
```

## 技术栈

### 后端
- **框架**: Express.js
- **数据库**: Supabase PostgreSQL
- **ORM**: Drizzle ORM
- **实时通信**: SSE (Server-Sent Events)
- **命令执行**: SSH2 / child_process
- **AI 工具**: neovate CLI

### 前端
- **框架**: React 18
- **UI 库**: Ant Design
- **构建工具**: Vite
- **状态管理**: React Hooks
- **实时通信**: EventSource (SSE)

## 部署架构

```
┌─────────────┐
│   前端      │ (React + Vite)
│  Port 3000  │
└──────┬──────┘
       │ HTTP/SSE
       ↓
┌─────────────┐
│   后端      │ (Express + SSE)
│  Port 3001  │
└──────┬──────┘
       │
       ├─→ Supabase PostgreSQL (数据持久化)
       │
       ├─→ LocalExecutor (本机模式)
       │   └─→ neovate CLI
       │
       └─→ SSHExecutor (远程模式)
           └─→ 远程虚拟机
               └─→ neovate CLI
```

## 关键特性

### 1. SSE 流式响应
- 实时推送 AI 响应
- 打字机效果
- 低延迟

### 2. 会话恢复
- 保存 neovate sessionId
- 支持多轮对话
- 上下文保持

### 3. 分支管理
- 从任意消息创建分支
- 分支切换
- 独立的消息历史

### 4. 模式验证
- 编辑模式: 允许代码修改
- 只读模式: 仅允许查询

### 5. 智能轮询
- 活跃/降频策略
- 自动重试
- 错误处理

## 性能优化

### 1. 缓存策略
- 内存缓存会话和消息
- 减少数据库查询

### 2. 流式传输
- SSE 实时推送
- 减少等待时间

### 3. 增量加载
- 支持 `since` 参数
- 只获取新消息

### 4. 连接池
- 数据库连接复用
- SSH 连接复用

## 错误处理

### 1. 数据库错误
- 自动重试
- 事务回滚
- 错误日志

### 2. 网络错误
- 指数退避重试
- 超时处理
- 降级策略

### 3. AI 工具错误
- 输出解析容错
- 错误信息提取
- 用户友好提示

## 安全性

### 1. 输入验证
- 参数校验
- SQL 注入防护
- XSS 防护

### 2. 权限控制
- 模式验证
- 操作权限检查

### 3. 数据隔离
- 会话隔离
- 分支隔离

## 监控与日志

### 1. 日志级别
- 请求日志
- 错误日志
- 调试日志

### 2. 性能监控
- 响应时间
- 数据库查询
- AI 工具执行

## 未来优化方向

1. **WebSocket 替代 SSE**: 双向通信
2. **消息队列**: 异步任务处理
3. **Redis 缓存**: 分布式缓存
4. **负载均衡**: 多实例部署
5. **监控告警**: Prometheus + Grafana
