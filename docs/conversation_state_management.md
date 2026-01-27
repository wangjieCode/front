# 对话状态管理机制

## 概述

**是的，对话是有状态的！**

对话系统使用状态机模式管理对话的生命周期，每个对话会话都有明确的状态，并且状态之间的转换受到严格控制。

---

## 📊 对话状态枚举

### ConversationStatus

```typescript
export enum ConversationStatus {
  PLANNING = "planning", // 规划中
  EXECUTING = "executing", // 执行中
  PAUSED = "paused", // 已暂停
  COMPLETED = "completed", // 已完成
  FAILED = "failed", // 失败
}
```

### 状态说明

| 状态          | 说明   | 触发时机                  | 可执行操作           |
| ------------- | ------ | ------------------------- | -------------------- |
| **PLANNING**  | 规划中 | 对话创建时的初始状态      | 可以开始执行         |
| **EXECUTING** | 执行中 | AI 正在处理用户消息       | 可以暂停、完成或失败 |
| **PAUSED**    | 已暂停 | AI 需要用户输入或用户插嘴 | 可以恢复执行         |
| **COMPLETED** | 已完成 | 对话成功完成              | 终态，不可转换       |
| **FAILED**    | 失败   | 对话执行失败              | 终态，不可转换       |

---

## 🔄 状态转换图

```
                    ┌─────────────┐
                    │  PLANNING   │ (初始状态)
                    └──────┬──────┘
                           │
                ┌──────────┼──────────┐
                │          │          │
                ▼          ▼          ▼
         ┌──────────┐ ┌──────────┐ ┌──────────┐
         │ EXECUTING│ │  PAUSED  │ │  FAILED  │
         └─────┬────┘ └────┬─────┘ └──────────┘
               │           │            ▲
        ┌──────┼──────┐    │            │
        │      │      │    │            │
        ▼      ▼      ▼    ▼            │
   ┌────────┐ ┌────────┐ ┌──────────┐  │
   │ PAUSED │ │COMPLETED│ │ EXECUTING│──┘
   └────┬───┘ └────────┘ └──────────┘
        │                      │
        └──────────────────────┘
```

### 合法的状态转换

```typescript
const validTransitions: Record<ConversationStatus, ConversationStatus[]> = {
  [ConversationStatus.PLANNING]: [
    ConversationStatus.EXECUTING, // 开始执行
    ConversationStatus.PAUSED, // 直接暂停（罕见）
    ConversationStatus.FAILED, // 初始化失败
  ],
  [ConversationStatus.EXECUTING]: [
    ConversationStatus.PAUSED, // 需要用户输入或被打断
    ConversationStatus.COMPLETED, // 执行完成
    ConversationStatus.FAILED, // 执行失败
  ],
  [ConversationStatus.PAUSED]: [
    ConversationStatus.EXECUTING, // 恢复执行
    ConversationStatus.FAILED, // 执行失败
  ],
  [ConversationStatus.COMPLETED]: [], // 终态，不可转换
  [ConversationStatus.FAILED]: [], // 终态，不可转换
};
```

---

## 🔐 状态转换控制

### 验证机制

**文件**: `backend/src/services/ConversationManager.ts`

**方法**: `isValidStatusTransition()`

```typescript
private isValidStatusTransition(
  currentStatus: ConversationStatus,
  newStatus: ConversationStatus
): boolean {
  const validTransitions = { /* ... */ };
  return validTransitions[currentStatus]?.includes(newStatus) || false;
}
```

### 更新状态

**方法**: `updateSessionStatus()`

```typescript
async updateSessionStatus(
  sessionId: string,
  newStatus: ConversationStatus,
  error?: string
): Promise<void> {
  // 1. 获取会话
  const session = await this.getSession(sessionId);

  // 2. 验证状态转换
  if (!this.isValidStatusTransition(session.status, newStatus)) {
    throw new Error(`非法的状态转换: ${session.status} -> ${newStatus}`);
  }

  // 3. 更新状态
  session.status = newStatus;
  session.updatedAt = new Date();

  // 4. 如果是终态，设置完成时间
  if (newStatus === ConversationStatus.COMPLETED ||
      newStatus === ConversationStatus.FAILED) {
    session.completedAt = new Date();
  }

  // 5. 如果是失败状态，记录错误信息
  if (newStatus === ConversationStatus.FAILED && error) {
    session.error = error;
  }

  // 6. 保存到数据库
  await this.storage.saveSession(session);
}
```

---

## 📝 状态转换场景

### 场景 1: 正常对话流程

```
1. 用户创建对话
   状态: PLANNING

2. 用户发送第一条消息
   状态: PLANNING → EXECUTING

3. AI 处理完成
   状态: EXECUTING → COMPLETED
```

**代码流程**:

```typescript
// 1. 创建对话
const session = await conversationManager.createSession(...);
// session.status = ConversationStatus.PLANNING

// 2. 用户发送消息
await conversationManager.updateSessionStatus(
  sessionId,
  ConversationStatus.EXECUTING
);

// 3. AI 处理完成
await conversationManager.updateSessionStatus(
  sessionId,
  ConversationStatus.COMPLETED
);
```

### 场景 2: AI 需要用户输入（Human-in-the-Loop）

```
1. 用户发送消息
   状态: PLANNING → EXECUTING

2. AI 需要澄清问题
   状态: EXECUTING → PAUSED

3. 用户回复
   状态: PAUSED → EXECUTING

4. AI 处理完成
   状态: EXECUTING → COMPLETED
```

**代码流程**:

```typescript
// 1. 开始执行
await conversationManager.updateSessionStatus(
  sessionId,
  ConversationStatus.EXECUTING,
);

// 2. AI 返回需要暂停
if (response.shouldPause) {
  await conversationManager.updateSessionStatus(
    sessionId,
    ConversationStatus.PAUSED,
  );
}

// 3. 用户回复后恢复
await conversationManager.updateSessionStatus(
  sessionId,
  ConversationStatus.EXECUTING,
);

// 4. 完成
await conversationManager.updateSessionStatus(
  sessionId,
  ConversationStatus.COMPLETED,
);
```

### 场景 3: 用户插嘴（中断执行）

```
1. AI 正在执行
   状态: EXECUTING

2. 用户发送新消息（插嘴）
   状态: EXECUTING → PAUSED

3. AI 处理新消息
   状态: PAUSED → EXECUTING

4. 完成
   状态: EXECUTING → COMPLETED
```

**代码流程**:

```typescript
// MessageRouter.handleUserMessage()
async handleUserMessage(sessionId: string, content: string) {
  const session = await this.conversationManager.getSession(sessionId);

  // 如果会话正在执行中，先暂停
  if (session.status === ConversationStatus.EXECUTING) {
    await this.conversationManager.updateSessionStatus(
      sessionId,
      ConversationStatus.PAUSED
    );
  }

  // 保存用户消息
  await this.conversationManager.addMessage(...);
}
```

### 场景 4: 执行失败

```
1. 用户发送消息
   状态: PLANNING → EXECUTING

2. AI 执行失败（如网络错误）
   状态: EXECUTING → FAILED
```

**代码流程**:

```typescript
try {
  // 开始执行
  await conversationManager.updateSessionStatus(
    sessionId,
    ConversationStatus.EXECUTING
  );

  // AI 处理
  const response = await conversationAIService.generateResponse(...);

  // 完成
  await conversationManager.updateSessionStatus(
    sessionId,
    ConversationStatus.COMPLETED
  );
} catch (error) {
  // 失败
  await conversationManager.updateSessionStatus(
    sessionId,
    ConversationStatus.FAILED,
    error.message
  );
}
```

---

## 🗄️ 数据库存储

### conversations 表

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL,  -- 状态字段
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  completed_at TIMESTAMP,       -- 完成时间（终态时设置）
  error TEXT                    -- 错误信息（失败时记录）
);
```

### 状态查询

```sql
-- 查询某个对话的状态
SELECT id, status, created_at, updated_at, completed_at
FROM conversations
WHERE id = 'conversation-123';

-- 查询用户的所有进行中的对话
SELECT id, status, created_at
FROM conversations
WHERE user_id = 'user-123'
  AND status IN ('planning', 'executing', 'paused');

-- 查询已完成的对话
SELECT id, status, completed_at
FROM conversations
WHERE user_id = 'user-123'
  AND status = 'completed'
ORDER BY completed_at DESC;

-- 查询失败的对话
SELECT id, status, error, updated_at
FROM conversations
WHERE user_id = 'user-123'
  AND status = 'failed'
ORDER BY updated_at DESC;
```

---

## 🔍 状态检查和操作

### 检查对话状态

```typescript
// 获取对话
const session = await conversationManager.getSession(sessionId);

// 检查状态
if (session.status === ConversationStatus.EXECUTING) {
  console.log("对话正在执行中");
}

if (session.status === ConversationStatus.PAUSED) {
  console.log("对话已暂停，等待用户输入");
}

// 检查是否为终态
const isTerminal =
  session.status === ConversationStatus.COMPLETED ||
  session.status === ConversationStatus.FAILED;
```

### 状态相关的操作限制

```typescript
// 只有在 PAUSED 状态才能恢复执行
if (session.status !== ConversationStatus.PAUSED) {
  throw new Error("只有暂停的对话才能恢复执行");
}

// 终态不能再转换
if (
  session.status === ConversationStatus.COMPLETED ||
  session.status === ConversationStatus.FAILED
) {
  throw new Error("已完成或失败的对话不能再修改状态");
}
```

---

## 🎯 状态的作用

### 1. 并发控制

**防止重复执行**:

```typescript
if (session.status === ConversationStatus.EXECUTING) {
  // 已经在执行中，暂停当前执行
  await conversationManager.updateSessionStatus(
    sessionId,
    ConversationStatus.PAUSED,
  );
}
```

### 2. 用户体验

**前端显示**:

```typescript
// 根据状态显示不同的 UI
switch (session.status) {
  case ConversationStatus.PLANNING:
    return <Badge>规划中</Badge>;
  case ConversationStatus.EXECUTING:
    return <Spin>AI 正在思考...</Spin>;
  case ConversationStatus.PAUSED:
    return <Badge color="orange">等待输入</Badge>;
  case ConversationStatus.COMPLETED:
    return <Badge color="green">已完成</Badge>;
  case ConversationStatus.FAILED:
    return <Badge color="red">失败</Badge>;
}
```

### 3. 流程控制

**Human-in-the-Loop**:

```typescript
// AI 生成响应
const response = await conversationAIService.generateResponse(...);

// 如果需要用户输入，暂停对话
if (response.shouldPause) {
  await conversationManager.updateSessionStatus(
    sessionId,
    ConversationStatus.PAUSED
  );

  // 等待用户输入
  await messageRouter.pauseForUserInput(sessionId, response.content);
}
```

### 4. 错误处理

**记录失败原因**:

```typescript
try {
  // 执行操作
  await performOperation();
} catch (error) {
  // 更新为失败状态，并记录错误
  await conversationManager.updateSessionStatus(
    sessionId,
    ConversationStatus.FAILED,
    error.message, // 错误信息会保存到数据库
  );
}
```

---

## 📊 状态统计

### 查询统计信息

```typescript
// 获取对话统计
const stats = await conversationManager.getSessionStats(sessionId);
// {
//   messageCount: 10,
//   status: ConversationStatus.COMPLETED
// }
```

### SQL 统计查询

```sql
-- 统计各状态的对话数量
SELECT status, COUNT(*) as count
FROM conversations
WHERE user_id = 'user-123'
GROUP BY status;

-- 统计平均执行时间
SELECT
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds
FROM conversations
WHERE status = 'completed'
  AND completed_at IS NOT NULL;

-- 统计失败率
SELECT
  COUNT(CASE WHEN status = 'failed' THEN 1 END) * 100.0 / COUNT(*) as failure_rate
FROM conversations
WHERE user_id = 'user-123';
```

---

## 🔄 与其他系统的集成

### 1. 与 Git 的关系

```typescript
// 只有在 EDIT 模式且状态为 EXECUTING 时才提交代码
if (
  context.mode === ConversationMode.EDIT &&
  session.status === ConversationStatus.EXECUTING &&
  result.changes.length > 0
) {
  await worktreeManager.commitChanges(userId, sessionId, message);
  await worktreeManager.pushBranch(userId, sessionId);
}
```

### 2. 与消息的关系

```typescript
// 消息保存时会更新对话的 updatedAt
await conversationManager.addMessage(sessionId, role, content, metadata);
// 内部会调用: session.updatedAt = new Date();
```

### 3. 与缓存的关系

```typescript
// 状态更新后清除缓存
async updateSessionStatus(...) {
  // ... 更新状态
  await this.storage.saveSession(session);

  // 清除缓存，确保下次获取最新状态
  this.clearSessionCache(sessionId);
}
```

---

## ⚠️ 注意事项

### 1. 状态转换的原子性

```typescript
// 使用锁确保状态转换的原子性
async updateSessionStatus(sessionId: string, newStatus: ConversationStatus) {
  await this.acquireLock(sessionId);  // 获取锁

  try {
    // 验证和更新状态
    // ...
  } finally {
    this.releaseLock(sessionId);  // 释放锁
  }
}
```

### 2. 终态不可逆

```typescript
// COMPLETED 和 FAILED 是终态，不能再转换
if (
  session.status === ConversationStatus.COMPLETED ||
  session.status === ConversationStatus.FAILED
) {
  throw new Error("终态不能再转换");
}
```

### 3. 状态一致性

```typescript
// 确保数据库和内存中的状态一致
await this.storage.saveSession(session); // 保存到数据库
this.clearSessionCache(sessionId); // 清除缓存
```

---

## 🔮 未来优化

### 1. 状态历史记录

**需求**: 记录状态变更历史

**方案**: 创建 `conversation_status_history` 表

```sql
CREATE TABLE conversation_status_history (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL,
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP
);
```

### 2. 状态超时机制

**需求**: 长时间处于 EXECUTING 状态自动超时

**方案**: 添加定时任务

```typescript
// 每分钟检查一次
setInterval(async () => {
  const timeout = 5 * 60 * 1000; // 5分钟
  const sessions = await getExecutingSessions();

  for (const session of sessions) {
    if (Date.now() - session.updatedAt.getTime() > timeout) {
      await conversationManager.updateSessionStatus(
        session.id,
        ConversationStatus.FAILED,
        "执行超时",
      );
    }
  }
}, 60 * 1000);
```

### 3. 状态事件通知

**需求**: 状态变更时通知前端

**方案**: 使用 WebSocket 或 SSE

```typescript
// 状态更新时发送事件
async updateSessionStatus(sessionId: string, newStatus: ConversationStatus) {
  // ... 更新状态

  // 发送事件
  this.eventEmitter.emit('status-changed', {
    sessionId,
    oldStatus: session.status,
    newStatus,
    timestamp: new Date()
  });
}
```

---

## 总结

**对话是有状态的**，并且状态管理非常严格：

- ✅ **5 种状态**: PLANNING, EXECUTING, PAUSED, COMPLETED, FAILED
- ✅ **状态机模式**: 严格控制状态转换
- ✅ **原子性保证**: 使用锁机制
- ✅ **持久化存储**: 保存到数据库
- ✅ **终态保护**: COMPLETED 和 FAILED 不可逆

**状态的作用**:

- 并发控制
- 用户体验优化
- 流程控制
- 错误处理
- 统计分析

**最佳实践**:

- 始终通过 `updateSessionStatus()` 更新状态
- 不要直接修改 `session.status`
- 检查状态转换的合法性
- 及时清除缓存
