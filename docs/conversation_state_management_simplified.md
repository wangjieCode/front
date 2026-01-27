# 对话状态管理（简化版）

## 概述

**对话状态已简化为两种：ACTIVE（活跃中）和 ARCHIVED（已归档）**

这个简化的状态模型更加直观，便于管理和清理 worktree 资源。

---

## 📊 状态枚举

### ConversationStatus（简化版）

```typescript
export enum ConversationStatus {
  ACTIVE = "active", // 活跃中 - 可以对话、发送消息、预览等
  ARCHIVED = "archived", // 已归档 - 只读，禁用所有编辑功能，可清理 worktree
}
```

---

## 🔄 状态说明

| 状态         | 说明   | 可执行操作                                                                 | 禁用操作                                                |
| ------------ | ------ | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| **ACTIVE**   | 活跃中 | ✅ 发送消息<br>✅ 生成 AI 响应<br>✅ 创建 MR<br>✅ 预览项目<br>✅ 归档对话 | ❌ 无                                                   |
| **ARCHIVED** | 已归档 | ✅ 查看消息历史<br>✅ 恢复对话<br>✅ 删除对话<br>✅ 清理 worktree          | ❌ 发送消息<br>❌ 生成响应<br>❌ 创建 MR<br>❌ 预览项目 |

---

## 🔄 状态转换

### 转换规则

```
ACTIVE ←→ ARCHIVED
```

**允许的转换**:

- `ACTIVE` → `ARCHIVED` (归档对话)
- `ARCHIVED` → `ACTIVE` (恢复对话)

**状态转换验证**:

```typescript
const validTransitions: Record<ConversationStatus, ConversationStatus[]> = {
  [ConversationStatus.ACTIVE]: [
    ConversationStatus.ARCHIVED, // 活跃 -> 归档
  ],
  [ConversationStatus.ARCHIVED]: [
    ConversationStatus.ACTIVE, // 归档 -> 活跃（可以恢复）
  ],
};
```

---

## 🎯 使用场景

### 场景 1: 正常对话流程

```
1. 创建对话
   状态: ACTIVE

2. 用户发送消息
   状态: ACTIVE (保持不变)

3. AI 生成响应
   状态: ACTIVE (保持不变)

4. 创建 MR
   状态: ACTIVE (保持不变)
```

**代码示例**:

```typescript
// 1. 创建对话
const session = await conversationManager.createSession(...);
// session.status = ConversationStatus.ACTIVE

// 2-4. 所有操作都在 ACTIVE 状态下进行
// 无需状态转换
```

### 场景 2: 归档对话

```
1. 对话完成或不再需要
   状态: ACTIVE

2. 用户归档对话
   状态: ACTIVE → ARCHIVED

3. 系统禁用编辑功能
   - 不能发送消息
   - 不能生成响应
   - 不能创建 MR
   - 不能预览项目

4. 清理 worktree（可选）
   - 释放磁盘空间
```

**代码示例**:

```typescript
// 归档对话
await conversationManager.updateSessionStatus(
  sessionId,
  ConversationStatus.ARCHIVED,
  "对话已完成",
);

// 清理 worktree
const archivedSessions = await getArchivedSessions(userId);
await worktreeManager.cleanupArchivedWorktrees(
  archivedSessions.map((s) => s.id),
  userId,
);
```

### 场景 3: 恢复归档的对话

```
1. 对话已归档
   状态: ARCHIVED

2. 用户恢复对话
   状态: ARCHIVED → ACTIVE

3. 重新创建 worktree（如果已清理）
   - 自动创建新的 worktree
   - 基于原分支

4. 继续对话
   状态: ACTIVE
```

**代码示例**:

```typescript
// 恢复对话
await conversationManager.updateSessionStatus(
  sessionId,
  ConversationStatus.ACTIVE,
);

// 如果 worktree 已清理，发送消息时会自动重新创建
await messageRouter.handleUserMessage(sessionId, "继续之前的工作");
```

---

## 🔒 权限控制

### 归档状态的检查

**MessageRouter**:

```typescript
async handleUserMessage(sessionId: string, content: string) {
  const session = await this.conversationManager.getSession(sessionId);

  // 检查会话是否已归档
  if (session.status === ConversationStatus.ARCHIVED) {
    throw new Error('已归档的对话不能发送消息');
  }

  // 继续处理...
}
```

**API 路由**:

```typescript
router.post("/:sessionId/messages", async (req, res) => {
  const session = await conversationManager.getSession(sessionId);

  // 检查会话是否已归档
  if (session.status === ConversationStatus.ARCHIVED) {
    return res.status(403).json({
      success: false,
      error: "已归档的对话不能发送消息",
    });
  }

  // 继续处理...
});
```

---

## 📡 API 端点

### 归档对话

**POST** `/api/conversations/:sessionId/archive`

**请求体**:

```json
{
  "reason": "对话已完成" // 可选
}
```

**响应**:

```json
{
  "success": true,
  "message": "对话已归档"
}
```

**示例**:

```typescript
const response = await fetch(`/api/conversations/${sessionId}/archive`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ reason: "项目已上线" }),
});
```

### 恢复对话

**POST** `/api/conversations/:sessionId/unarchive`

**响应**:

```json
{
  "success": true,
  "message": "对话已恢复"
}
```

**示例**:

```typescript
const response = await fetch(`/api/conversations/${sessionId}/unarchive`, {
  method: "POST",
});
```

---

## 🗄️ 数据库存储

### conversations 表

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL,  -- 'active' 或 'archived'
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  completed_at TIMESTAMP,       -- 归档时设置
  error TEXT                    -- 复用存储归档原因
);
```

### 查询示例

```sql
-- 查询活跃对话
SELECT * FROM conversations
WHERE user_id = 'user-123'
  AND status = 'active'
ORDER BY updated_at DESC;

-- 查询已归档对话
SELECT * FROM conversations
WHERE user_id = 'user-123'
  AND status = 'archived'
ORDER BY completed_at DESC;

-- 统计对话状态
SELECT status, COUNT(*) as count
FROM conversations
WHERE user_id = 'user-123'
GROUP BY status;
```

---

## 🧹 Worktree 清理

### 清理流程

1. **查询已归档的对话**

   ```typescript
   const archivedSessions = await conversationManager.listSessions();
   const archived = archivedSessions.filter(
     (s) => s.status === ConversationStatus.ARCHIVED,
   );
   ```

2. **清理 worktree**

   ```typescript
   const result = await worktreeManager.cleanupArchivedWorktrees(
     archived.map((s) => s.id),
     userId,
   );

   console.log(`清理完成: 成功 ${result.cleaned}, 失败 ${result.failed}`);
   ```

3. **清理结果**
   ```typescript
   {
     success: true,
     cleaned: 10,    // 成功清理的数量
     failed: 0,      // 失败的数量
     errors: []      // 错误信息列表
   }
   ```

### 定时清理任务

```typescript
// 每天凌晨 2 点清理归档超过 7 天的对话 worktree
cron.schedule("0 2 * * *", async () => {
  console.log("[Cron] 开始清理归档对话 worktree");

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // 查询归档超过 7 天的对话
  const oldArchivedSessions = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.status, "archived"),
        lt(conversations.completedAt, sevenDaysAgo),
      ),
    );

  // 按用户分组清理
  const userSessions = groupBy(oldArchivedSessions, "userId");

  for (const [userId, sessions] of Object.entries(userSessions)) {
    const result = await worktreeManager.cleanupArchivedWorktrees(
      sessions.map((s) => s.id),
      userId,
    );

    console.log(`[Cron] 用户 ${userId}: 清理 ${result.cleaned} 个 worktree`);
  }
});
```

---

## 🎨 前端集成

### 显示状态

```typescript
// 状态徽章
function StatusBadge({ status }: { status: ConversationStatus }) {
  if (status === ConversationStatus.ACTIVE) {
    return <Badge color="green">活跃中</Badge>;
  }
  return <Badge color="gray">已归档</Badge>;
}
```

### 操作按钮

```typescript
function ConversationActions({ session }: { session: ConversationSession }) {
  const isArchived = session.status === ConversationStatus.ARCHIVED;

  return (
    <div>
      {/* 发送消息按钮 */}
      <Button
        disabled={isArchived}
        onClick={() => sendMessage()}
      >
        发送消息
      </Button>

      {/* 预览按钮 */}
      <Button
        disabled={isArchived}
        onClick={() => preview()}
      >
        预览
      </Button>

      {/* 归档/恢复按钮 */}
      {isArchived ? (
        <Button onClick={() => unarchive(session.id)}>
          恢复对话
        </Button>
      ) : (
        <Button onClick={() => archive(session.id)}>
          归档对话
        </Button>
      )}
    </div>
  );
}
```

### API 调用

```typescript
// 归档对话
async function archiveConversation(sessionId: string, reason?: string) {
  const response = await fetch(`/api/conversations/${sessionId}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    throw new Error("归档失败");
  }

  return response.json();
}

// 恢复对话
async function unarchiveConversation(sessionId: string) {
  const response = await fetch(`/api/conversations/${sessionId}/unarchive`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("恢复失败");
  }

  return response.json();
}
```

---

## ⚠️ 注意事项

### 1. 归档前的检查

```typescript
// 确保代码已提交
const hasUncommittedChanges = await checkUncommittedChanges(sessionId);
if (hasUncommittedChanges) {
  // 提示用户先提交或创建 MR
  throw new Error("请先提交代码或创建 Merge Request");
}

// 归档
await archiveConversation(sessionId);
```

### 2. Worktree 清理的时机

- **立即清理**: 归档后立即清理 worktree（节省空间）
- **延迟清理**: 归档后保留一段时间（便于恢复）
- **定时清理**: 定期清理旧的归档对话（推荐）

### 3. 恢复归档对话

```typescript
// 恢复对话时，如果 worktree 已清理，需要重新创建
async function resumeArchivedConversation(sessionId: string) {
  // 1. 恢复状态
  await unarchiveConversation(sessionId);

  // 2. 检查 worktree 是否存在
  const session = await getSession(sessionId);
  const worktreeExists = await checkWorktreeExists(session.userId, sessionId);

  // 3. 如果不存在，重新创建
  if (!worktreeExists) {
    await worktreeManager.createConversationWorktree(
      session.userId,
      sessionId,
      session.context.projectInfo.gitBranch,
    );
  }
}
```

---

## 📊 对比：简化前后

| 特性           | 旧状态模型（5 种状态）                             | 新状态模型（2 种状态） |
| -------------- | -------------------------------------------------- | ---------------------- |
| **状态数量**   | 5 (PLANNING, EXECUTING, PAUSED, COMPLETED, FAILED) | 2 (ACTIVE, ARCHIVED)   |
| **状态转换**   | 复杂（需要验证多种转换）                           | 简单（只有两种转换）   |
| **代码复杂度** | 高                                                 | 低                     |
| **易理解性**   | 难                                                 | 易                     |
| **资源管理**   | 无明确清理机制                                     | 归档后可清理 worktree  |
| **并发控制**   | 需要 PAUSED 状态                                   | 不需要（简化）         |
| **错误处理**   | FAILED 状态                                        | 不需要特殊状态         |

---

## 🔮 未来优化

### 1. 自动归档

```typescript
// 自动归档长时间未活跃的对话
cron.schedule("0 3 * * *", async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const inactiveSessions = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.status, "active"),
        lt(conversations.updatedAt, thirtyDaysAgo),
      ),
    );

  for (const session of inactiveSessions) {
    await conversationManager.updateSessionStatus(
      session.id,
      ConversationStatus.ARCHIVED,
      "自动归档：30 天未活跃",
    );
  }
});
```

### 2. 归档统计

```typescript
interface ArchiveStats {
  totalArchived: number;
  archivedThisMonth: number;
  diskSpaceSaved: number;
  oldestArchived: Date;
}

async function getArchiveStats(userId: string): Promise<ArchiveStats> {
  // 实现统计逻辑
}
```

### 3. 批量操作

```typescript
// 批量归档
async function batchArchive(sessionIds: string[], reason: string) {
  for (const sessionId of sessionIds) {
    await archiveConversation(sessionId, reason);
  }
}

// 批量清理
async function batchCleanup(userId: string) {
  const archived = await getArchivedSessions(userId);
  return await worktreeManager.cleanupArchivedWorktrees(
    archived.map((s) => s.id),
    userId,
  );
}
```

---

## 总结

**简化后的状态模型**:

- ✅ **只有 2 种状态**: ACTIVE, ARCHIVED
- ✅ **简单的转换**: 可以互相转换
- ✅ **明确的用途**: ACTIVE 用于工作，ARCHIVED 用于存档
- ✅ **资源管理**: 归档后可清理 worktree
- ✅ **易于理解**: 直观明了

**适用场景**:

- ✅ 对话完成后归档
- ✅ 长期不用的对话归档
- ✅ 需要释放磁盘空间
- ✅ 保留历史记录但禁用编辑

**最佳实践**:

- 定期归档不活跃的对话
- 定时清理归档对话的 worktree
- 提供恢复功能以防误归档
- 归档前提示用户保存重要内容
