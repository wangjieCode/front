# 数据库表结构与业务逻辑梳理

## 表结构概览

系统共有 6 张核心表：

```
conversations (对话会话)
    ↓ 1:1
conversation_contexts (对话上下文)
    ↓ 1:N
branches (对话分支)
    ↓ 1:N
messages (消息)
    ↓ 1:1
message_metadata (消息元数据)

neovate_sessions (Neovate AI 会话映射) - 独立表
```

---

## 1. conversations 表

**作用**：存储对话会话的基本信息

| 字段 | 类型 | 说明 | 使用状态 |
|------|------|------|---------|
| id | UUID | 主键 | ✅ 使用中 |
| sessionId | VARCHAR(255) | 会话ID（与id相同） | ⚠️ 冗余字段 |
| taskId | VARCHAR(255) | 任务ID | ✅ 使用中 |
| status | VARCHAR(50) | 状态：planning/executing/paused/completed/failed | ✅ 使用中 |
| createdAt | TIMESTAMP | 创建时间 | ✅ 使用中 |
| updatedAt | TIMESTAMP | 更新时间 | ✅ 使用中 |
| completedAt | TIMESTAMP | 完成时间 | ✅ 使用中 |
| error | TEXT | 错误信息 | ✅ 使用中 |

**索引**：
- `idx_conversations_session_id` - sessionId
- `idx_conversations_task_id` - taskId
- `idx_conversations_status` - status
- `idx_conversations_created_at` - createdAt

**问题**：
- `sessionId` 字段与 `id` 重复，可以移除

---

## 2. conversation_contexts 表

**作用**：存储对话的上下文信息（项目信息、变量等）

| 字段 | 类型 | 说明 | 使用状态 |
|------|------|------|---------|
| id | UUID | 主键 | ✅ 使用中 |
| conversationId | UUID | 关联 conversations.id | ✅ 使用中 |
| workDir | TEXT | 工作目录 | ✅ 使用中 |
| gitBranch | VARCHAR(255) | Git 分支（项目信息） | ⚠️ 与 contextGitBranch 混淆 |
| relevantFiles | JSONB | 相关文件列表 | ✅ 使用中 |
| taskDescription | TEXT | 任务描述 | ✅ 使用中 |
| currentBranchId | UUID | 当前活跃的对话分支ID | ✅ 使用中 |
| variables | JSONB | 上下文变量 | ✅ 使用中 |
| mode | VARCHAR(50) | 对话模式：edit/readonly | ✅ 使用中 |
| contextGitBranch | VARCHAR(255) | 编辑模式创建的 Git 分支 | ✅ 使用中 |
| mrUrl | TEXT | MR URL | ✅ 使用中 |
| createdAt | TIMESTAMP | 创建时间 | ✅ 使用中 |
| updatedAt | TIMESTAMP | 更新时间 | ✅ 使用中 |

**关系**：
- 1:1 关联 conversations 表

**索引**：
- `idx_contexts_conversation_id` - conversationId
- `unique_contexts_conversation_id` - conversationId (唯一)
- `idx_contexts_mode` - mode

**问题**：
- `gitBranch` 和 `contextGitBranch` 命名混淆，建议统一

---

## 3. branches 表

**作用**：存储对话分支信息（支持对话树结构）

| 字段 | 类型 | 说明 | 使用状态 |
|------|------|------|---------|
| id | UUID | 主键 | ✅ 使用中 |
| conversationId | UUID | 关联 conversations.id | ✅ 使用中 |
| name | VARCHAR(255) | 分支名称 | ✅ 使用中 |
| parentMessageId | UUID | 分支起始消息ID | ❌ 未使用 |
| isActive | BOOLEAN | 是否为当前活跃分支 | ✅ 使用中 |
| createdAt | TIMESTAMP | 创建时间 | ✅ 使用中 |

**关系**：
- N:1 关联 conversations 表
- 1:N 关联 messages 表

**索引**：
- `idx_branches_conversation_id` - conversationId
- `idx_branches_parent_message_id` - parentMessageId
- `idx_branches_is_active` - isActive

**问题**：
- `parentMessageId` 字段设计了但未使用，分支消息关系通过内存中的 `messageIds` 数组维护

**实际逻辑**：
```typescript
// 内存中的分支结构
interface ConversationBranch {
  id: string;
  name: string;
  parentMessageId: string;  // ❌ 保存但不使用
  messageIds: string[];     // ✅ 实际用这个管理消息顺序
  createdAt: Date;
  isActive: boolean;
}
```

---

## 4. messages 表

**作用**：存储对话消息

| 字段 | 类型 | 说明 | 使用状态 |
|------|------|------|---------|
| id | UUID | 主键 | ✅ 使用中 |
| conversationId | UUID | 关联 conversations.id | ✅ 使用中 |
| branchId | UUID | 关联 branches.id | ✅ 使用中 |
| role | VARCHAR(50) | 角色：user/assistant/system | ✅ 使用中 |
| content | TEXT | 消息内容 | ✅ 使用中 |
| isComplete | BOOLEAN | 是否完整（流式传输） | ✅ 使用中 |
| timestamp | TIMESTAMP | 时间戳 | ✅ 使用中 |
| parentMessageId | UUID | 父消息ID | ❌ 未使用 |

**关系**：
- N:1 关联 conversations 表
- N:1 关联 branches 表
- 1:1 关联 message_metadata 表

**索引**：
- `idx_messages_conversation_id` - conversationId
- `idx_messages_branch_id` - branchId
- `idx_messages_timestamp` - timestamp
- `idx_messages_parent_message_id` - parentMessageId

**问题**：
- `parentMessageId` 字段设计了但未使用，消息顺序通过 timestamp 和 branches.messageIds 维护

---

## 5. message_metadata 表

**作用**：存储消息的元数据（工具调用、代码变更等）

| 字段 | 类型 | 说明 | 使用状态 |
|------|------|------|---------|
| id | UUID | 主键 | ✅ 使用中 |
| messageId | UUID | 关联 messages.id | ✅ 使用中 |
| toolCalls | JSONB | 工具调用记录 | ✅ 使用中 |
| codeChanges | JSONB | 代码变更记录 | ✅ 使用中 |
| thinking | TEXT | AI 思考过程 | ✅ 使用中 |
| isQuestion | BOOLEAN | 是否为问题 | ✅ 使用中 |
| questionOptions | JSONB | 问题选项 | ✅ 使用中 |
| requiresResponse | BOOLEAN | 是否需要响应 | ✅ 使用中 |
| messageReferences | JSONB | 消息引用 | ✅ 使用中 |
| isInvalid | BOOLEAN | 是否已失效 | ✅ 使用中 |
| gitBranch | VARCHAR(255) | 关联的 Git 分支 | ✅ 使用中 |
| mrUrl | TEXT | 关联的 MR URL | ✅ 使用中 |
| operationDenied | JSONB | 操作被拒绝信息 | ✅ 使用中 |
| createdAt | TIMESTAMP | 创建时间 | ✅ 使用中 |

**关系**：
- 1:1 关联 messages 表

**索引**：
- `idx_metadata_message_id` - messageId
- `unique_metadata_message_id` - messageId (唯一)
- `idx_metadata_is_question` - isQuestion
- `idx_metadata_requires_response` - requiresResponse

---

## 6. neovate_sessions 表

**作用**：存储 Neovate AI 工具的会话映射（用于会话恢复）

| 字段 | 类型 | 说明 | 使用状态 |
|------|------|------|---------|
| id | UUID | 主键 | ✅ 使用中 |
| conversationId | UUID | 关联 conversations.id | ✅ 使用中 |
| neovateSessionId | VARCHAR(255) | Neovate 工具的会话ID | ✅ 使用中 |
| workDir | TEXT | 工作目录 | ✅ 使用中 |
| createdAt | TIMESTAMP | 创建时间 | ✅ 使用中 |
| lastUsedAt | TIMESTAMP | 最后使用时间 | ✅ 使用中 |

**关系**：
- 1:1 关联 conversations 表

**索引**：
- `idx_neovate_sessions_conversation_id` - conversationId
- `unique_neovate_sessions_conversation_id` - conversationId (唯一)
- `idx_neovate_sessions_neovate_session_id` - neovateSessionId

---

## 业务逻辑流程

### 1. 创建对话会话

```
1. 创建 conversation 记录
2. 创建 conversation_context 记录
3. 创建默认 branch (主分支)
4. 根据 mode 处理 Git 操作：
   - edit 模式：创建 Git 分支 + 创建 MR
   - readonly 模式：丢弃变更 + 切换主分支
5. 保存 gitBranch 和 mrUrl 到 context
```

### 2. 发送消息

```
1. 创建 user message 记录
2. 调用 AI 服务生成响应
3. 创建 assistant message 记录
4. 创建 message_metadata 记录（包含工具调用、代码变更等）
5. edit 模式：提交并推送代码变更
6. 更新 branch.messageIds 数组
```

### 3. 分支管理（未在前端实现）

```
1. 创建分支：
   - 从指定消息点复制 messageIds
   - 创建新 branch 记录
   
2. 切换分支：
   - 更新 context.currentBranchId
   - 更新 context.messageHistory
```

---

## 存在的问题与优化建议

### 问题

1. **冗余字段**
   - `conversations.sessionId` 与 `id` 重复
   - `conversation_contexts.gitBranch` 与 `contextGitBranch` 命名混淆

2. **未使用字段**
   - `branches.parentMessageId` - 设计了但不使用
   - `messages.parentMessageId` - 设计了但不使用

3. **数据一致性**
   - 分支的消息关系通过内存中的 `messageIds` 数组维护
   - 数据库中的 `branchId` 和 `parentMessageId` 未充分利用

### 优化建议

1. **简化表结构**
   ```sql
   -- 移除冗余字段
   ALTER TABLE conversations DROP COLUMN session_id;
   
   -- 统一命名
   ALTER TABLE conversation_contexts 
     RENAME COLUMN context_git_branch TO git_branch_name;
   ALTER TABLE conversation_contexts 
     DROP COLUMN git_branch;
   ```

2. **分支管理优化**
   - 方案A：移除 `parentMessageId`，继续使用 `messageIds` 数组
   - 方案B：充分利用 `parentMessageId`，通过递归查询构建分支树

3. **索引优化**
   - 添加复合索引：`(conversationId, branchId, timestamp)` on messages
   - 添加复合索引：`(conversationId, isActive)` on branches

---

## 数据流转示意图

```
用户创建对话
    ↓
conversations + conversation_contexts + branches (主分支)
    ↓
用户发送消息
    ↓
messages (user) → AI 处理 → messages (assistant) + message_metadata
    ↓
更新 branch.messageIds (内存) → 保存到 context
    ↓
edit 模式：Git commit + push
```

---

## 总结

当前系统的表结构设计较为完整，支持：
- ✅ 多对话会话管理
- ✅ 对话分支（数据结构完整，前端未实现）
- ✅ 消息元数据（工具调用、代码变更）
- ✅ 编辑/只读模式
- ✅ Git 集成（分支、MR）
- ✅ Neovate AI 会话恢复

存在的主要问题是部分字段设计了但未使用，以及命名不够清晰。建议进行适当的清理和优化。
