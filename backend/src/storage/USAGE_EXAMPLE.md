# DrizzleConversationStorage 使用示例

## 初始化

```typescript
import { initializeDatabase } from '../db/init';
import { DrizzleConversationStorage } from './DrizzleConversationStorage';

// 1. 初始化数据库连接
await initializeDatabase();

// 2. 创建存储实例
const storage = new DrizzleConversationStorage();
```

## 会话管理

### 创建新会话

```typescript
await storage.saveSession({
  sessionId: 'agent-session-123',
  taskId: 'task-456',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
});
```

### 加载会话

```typescript
// 通过 ID 加载
const session = await storage.loadSession('conversation-id');

// 通过 Agent Session ID 加载
const session = await storage.loadSessionByAgentSessionId('agent-session-123');
```

### 列出所有会话

```typescript
const sessions = await storage.listSessions();
console.log(`Found ${sessions.length} sessions`);
```

### 更新会话

```typescript
await storage.updateSession('conversation-id', {
  status: 'completed',
  completedAt: new Date(),
});
```

### 删除会话

```typescript
// 会自动级联删除相关的消息、分支、上下文和元数据
await storage.deleteSession('conversation-id');
```

## 消息管理

### 保存消息

```typescript
await storage.saveMessage({
  conversationId: 'conversation-id',
  branchId: 'branch-id',
  role: 'user',
  content: 'Hello, AI!',
  isComplete: true,
  timestamp: new Date(),
});
```

### 加载消息

```typescript
// 加载所有消息
const messages = await storage.loadMessages('conversation-id');

// 加载特定分支的消息
const branchMessages = await storage.loadMessages('conversation-id', 'branch-id');

// 分页加载
const pagedMessages = await storage.loadMessages('conversation-id', undefined, {
  limit: 20,
  offset: 0,
});
```

### 更新消息内容（流式响应）

```typescript
// 开始流式响应
await storage.saveMessage({
  id: 'message-id',
  conversationId: 'conversation-id',
  branchId: 'branch-id',
  role: 'assistant',
  content: '',
  isComplete: false,
  timestamp: new Date(),
});

// 逐步更新内容
await storage.updateMessageContent('message-id', 'Hello', false);
await storage.updateMessageContent('message-id', 'Hello, how', false);
await storage.updateMessageContent('message-id', 'Hello, how can I help?', true);
```

### 获取消息数量

```typescript
const count = await storage.getMessageCount('conversation-id');
const branchCount = await storage.getMessageCount('conversation-id', 'branch-id');
```

## 上下文管理

### 保存上下文

```typescript
await storage.saveContext('conversation-id', {
  workDir: '/path/to/project',
  gitBranch: 'main',
  relevantFiles: ['src/index.ts', 'src/app.ts'],
  taskDescription: 'Implement new feature',
  currentBranchId: 'branch-id',
  variables: { key: 'value' },
});
```

### 加载上下文

```typescript
const context = await storage.loadContext('conversation-id');
console.log('Working directory:', context.workDir);
```

## 分支管理

### 创建分支

```typescript
await storage.saveBranch('conversation-id', {
  name: 'Alternative approach',
  parentMessageId: 'parent-message-id',
  isActive: true,
});
```

### 加载分支

```typescript
const branch = await storage.loadBranch('conversation-id', 'branch-id');
```

### 列出所有分支

```typescript
const branches = await storage.listBranches('conversation-id');
```

### 更新分支

```typescript
await storage.updateBranch('branch-id', {
  isActive: false,
});
```

### 删除分支

```typescript
// 会自动删除该分支的所有消息和元数据
await storage.deleteBranch('conversation-id', 'branch-id');
```

## 消息元数据

### 保存元数据

```typescript
await storage.saveMessageMetadata('message-id', {
  toolCalls: [{ name: 'search', args: { query: 'test' } }],
  codeChanges: [{ file: 'index.ts', changes: '+10 -5' }],
  thinking: 'Let me analyze this...',
  isQuestion: true,
  questionOptions: ['Yes', 'No'],
  requiresResponse: true,
});
```

### 加载元数据

```typescript
const metadata = await storage.loadMessageMetadata('message-id');
console.log('Tool calls:', metadata.toolCalls);
```

## 数据完整性维护

### 清理孤立数据

```typescript
// 清理孤立的消息
const orphanedMessages = await storage.cleanupOrphanedMessages();
console.log(`Cleaned up ${orphanedMessages} orphaned messages`);

// 清理孤立的分支
const orphanedBranches = await storage.cleanupOrphanedBranches();
console.log(`Cleaned up ${orphanedBranches} orphaned branches`);

// 清理孤立的元数据
const orphanedMetadata = await storage.cleanupOrphanedMetadata();
console.log(`Cleaned up ${orphanedMetadata} orphaned metadata`);
```

### 验证数据完整性

```typescript
const result = await storage.validateDataIntegrity('conversation-id');

if (result.valid) {
  console.log('Data integrity check passed');
} else {
  console.error('Data integrity issues found:');
  result.issues.forEach((issue) => console.error(`  - ${issue}`));
}
```

## 缓存管理

```typescript
// 清除所有缓存
storage.clearCache();
```

## 完整示例：创建对话流程

```typescript
import { initializeDatabase } from '../db/init';
import { DrizzleConversationStorage } from './DrizzleConversationStorage';

async function createConversation() {
  // 初始化
  await initializeDatabase();
  const storage = new DrizzleConversationStorage();

  // 1. 创建会话
  const sessionId = 'agent-session-' + Date.now();
  const conversationId = crypto.randomUUID();
  
  await storage.saveSession({
    id: conversationId,
    sessionId,
    taskId: 'task-123',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 2. 创建主分支
  const branchId = crypto.randomUUID();
  await storage.saveBranch(conversationId, {
    id: branchId,
    name: 'main',
    isActive: true,
  });

  // 3. 保存上下文
  await storage.saveContext(conversationId, {
    workDir: '/project',
    gitBranch: 'main',
    taskDescription: 'New feature',
    currentBranchId: branchId,
  });

  // 4. 添加用户消息
  const userMessageId = crypto.randomUUID();
  await storage.saveMessage({
    id: userMessageId,
    conversationId,
    branchId,
    role: 'user',
    content: 'Hello!',
    isComplete: true,
    timestamp: new Date(),
  });

  // 5. 添加 AI 响应
  const aiMessageId = crypto.randomUUID();
  await storage.saveMessage({
    id: aiMessageId,
    conversationId,
    branchId,
    role: 'assistant',
    content: 'Hello! How can I help you?',
    isComplete: true,
    timestamp: new Date(),
    parentMessageId: userMessageId,
  });

  console.log('Conversation created successfully!');
  console.log('Conversation ID:', conversationId);
  console.log('Session ID:', sessionId);

  // 验证数据完整性
  const integrity = await storage.validateDataIntegrity(conversationId);
  console.log('Data integrity:', integrity.valid ? 'OK' : 'Issues found');
}

createConversation().catch(console.error);
```

## 错误处理

```typescript
try {
  await storage.saveSession({
    sessionId: 'duplicate-session',
    taskId: 'task-123',
    status: 'active',
  });
} catch (error) {
  if (error.code === '23505') {
    // 唯一约束违反（session_id 重复）
    console.error('Session ID already exists');
  } else {
    console.error('Database error:', error);
  }
}
```

## 性能优化建议

1. **使用分页**：加载大量消息时使用分页
2. **利用缓存**：频繁访问的数据会被自动缓存
3. **批量操作**：使用事务进行批量操作
4. **定期清理**：定期运行数据完整性维护任务
