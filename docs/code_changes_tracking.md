# 代码变更记录机制说明

## 概述

代码变更记录在**消息维度**，而不是对话维度。每条 AI 消息都可以包含该消息产生的代码变更信息。

---

## 📊 记录维度

### 当前实现：消息维度 ✅

**数据库表**: `message_metadata`

**字段**: `code_changes` (JSONB)

**关联**: 每条消息 → 该消息产生的代码变更

```
conversations (对话)
  └── messages (消息)
      └── message_metadata (消息元数据)
          └── code_changes (代码变更数组)
```

---

## 🗂️ 数据库结构

### message_metadata 表

```sql
CREATE TABLE message_metadata (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL,           -- 关联的消息 ID
  tool_calls JSONB,                   -- 工具调用记录
  code_changes JSONB,                 -- 代码变更（重点）
  thinking TEXT,                      -- AI 思考过程
  is_question BOOLEAN,                -- 是否为询问
  question_options JSONB,             -- 问题选项
  requires_response BOOLEAN,          -- 是否需要响应
  message_references JSONB,           -- 消息引用
  is_invalid BOOLEAN,                 -- 是否已失效
  git_branch VARCHAR(255),            -- 关联的 Git 分支
  mr_url TEXT,                        -- 关联的 MR URL
  operation_denied JSONB,             -- 操作被拒绝的信息
  created_at TIMESTAMP
);
```

### code_changes 字段结构

```typescript
interface CodeChange {
  filePath: string;      // 文件路径
  changeType: ChangeType; // 变更类型：added, modified, deleted
  diff: string;          // 差异内容
}

// 存储格式
code_changes: CodeChange[]
```

---

## 🔄 记录流程

### 1. AI 生成响应

**文件**: `backend/src/services/ConversationAIService.ts`

**方法**: `generateResponse()`

```typescript
async generateResponse(
  context: ConversationContext,
  userMessage: string,
  sessionId: string
): Promise<AIResponse> {
  // 1. 调用 NeovateAIService 执行代码修改
  const result = await this.neovateService.modifyCode(
    userMessage,
    sessionId,
    neovateSessionId,
    projectWorkDir
  );

  // 2. 构建响应元数据（包含代码变更）
  const metadata: MessageMetadata = {
    codeChanges: result.changes,  // 代码变更数组
    toolCalls: this.extractToolCalls(result),
    gitBranch: context.gitBranch,
    mrUrl: context.mrUrl,
  };

  // 3. 返回响应
  return {
    content: result.rawOutput,
    metadata,
    shouldPause: false,
  };
}
```

### 2. 保存消息和元数据

**文件**: `backend/src/api/conversationRoutes.ts`

**流程**:

```typescript
// 1. 保存用户消息
await conversationManager.addMessage(sessionId, MessageRole.USER, content);

// 2. 生成 AI 响应
const response = await conversationAIService.generateResponse(
  session.context,
  content,
  sessionId,
);

// 3. 保存 AI 消息（包含元数据）
await conversationManager.addMessage(
  sessionId,
  MessageRole.ASSISTANT,
  response.content,
  response.metadata, // 包含 codeChanges
);
```

### 3. 存储到数据库

**文件**: `backend/src/storage/ConversationStorageAdapter.ts`

**方法**: `saveMessage()`

```typescript
async saveMessage(message: ConversationMessage): Promise<void> {
  // 1. 保存消息主体
  await db.insert(messages).values({
    id: message.id,
    conversationId: message.sessionId,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
  });

  // 2. 保存消息元数据（如果存在）
  if (message.metadata) {
    await db.insert(messageMetadata).values({
      messageId: message.id,
      toolCalls: message.metadata.toolCalls || null,
      codeChanges: message.metadata.codeChanges || null,  // 代码变更
      thinking: message.metadata.thinking || null,
      isQuestion: message.metadata.isQuestion || false,
      // ... 其他字段
    });
  }
}
```

---

## 📝 代码变更示例

### 单个消息的代码变更

```json
{
  "messageId": "msg-123",
  "role": "assistant",
  "content": "已完成用户管理功能的添加",
  "metadata": {
    "codeChanges": [
      {
        "filePath": "src/components/UserList.tsx",
        "changeType": "added",
        "diff": "+import React from 'react';\n+export const UserList = () => {...}"
      },
      {
        "filePath": "src/api/user.ts",
        "changeType": "modified",
        "diff": "@@ -10,6 +10,10 @@\n export const getUsers = async () => {...}\n+export const createUser = async (data) => {...}"
      },
      {
        "filePath": "src/utils/old-helper.ts",
        "changeType": "deleted",
        "diff": "-export const oldHelper = () => {...}"
      }
    ],
    "gitBranch": "conversation-b8f34476-1737446890123",
    "mrUrl": null
  }
}
```

### 多条消息的代码变更

```
对话 ID: conversation-123

消息1 (用户): "添加用户列表组件"
消息2 (AI): "已创建 UserList.tsx"
  └── code_changes: [{ filePath: "UserList.tsx", changeType: "added", ... }]

消息3 (用户): "添加用户详情页"
消息4 (AI): "已创建 UserDetail.tsx"
  └── code_changes: [{ filePath: "UserDetail.tsx", changeType: "added", ... }]

消息5 (用户): "修改用户列表样式"
消息6 (AI): "已更新样式"
  └── code_changes: [{ filePath: "UserList.tsx", changeType: "modified", ... }]
```

---

## 🔍 查询代码变更

### 查询单条消息的代码变更

```typescript
// 1. 获取消息
const message = await conversationManager.getMessage(sessionId, messageId);

// 2. 获取代码变更
const codeChanges = message.metadata?.codeChanges || [];

console.log(`消息 ${messageId} 修改了 ${codeChanges.length} 个文件`);
```

### 查询对话的所有代码变更

```typescript
// 1. 获取对话的所有消息
const messages = await conversationManager.getMessageHistory(sessionId);

// 2. 提取所有代码变更
const allCodeChanges = messages
  .filter((msg) => msg.metadata?.codeChanges)
  .flatMap((msg) => msg.metadata.codeChanges);

console.log(`对话 ${sessionId} 总共修改了 ${allCodeChanges.length} 个文件`);
```

### SQL 查询示例

```sql
-- 查询某条消息的代码变更
SELECT
  m.id AS message_id,
  m.content,
  mm.code_changes
FROM messages m
LEFT JOIN message_metadata mm ON m.id = mm.message_id
WHERE m.id = 'msg-123';

-- 查询某个对话的所有代码变更
SELECT
  m.id AS message_id,
  m.content,
  mm.code_changes
FROM messages m
LEFT JOIN message_metadata mm ON m.id = mm.message_id
WHERE m.conversation_id = 'conversation-123'
  AND mm.code_changes IS NOT NULL;

-- 统计某个对话修改的文件数
SELECT
  m.conversation_id,
  COUNT(DISTINCT jsonb_array_elements(mm.code_changes)->>'filePath') AS file_count
FROM messages m
LEFT JOIN message_metadata mm ON m.id = mm.message_id
WHERE m.conversation_id = 'conversation-123'
  AND mm.code_changes IS NOT NULL
GROUP BY m.conversation_id;
```

---

## 🎯 为什么选择消息维度？

### 优势

1. **精细化追踪**
   - 可以准确知道每条消息修改了哪些文件
   - 便于回溯和审计

2. **灵活性**
   - 支持多轮对话，每轮都可能有代码变更
   - 支持部分回滚（只回滚某条消息的变更）

3. **元数据一致性**
   - 代码变更与其他元数据（工具调用、思考过程等）在同一层级
   - 数据结构清晰

4. **查询便利**
   - 可以按消息查询
   - 可以按对话聚合
   - 灵活度高

### 劣势

1. **聚合查询复杂**
   - 需要聚合多条消息的变更
   - SQL 查询相对复杂

2. **存储冗余**
   - 如果同一个文件被多次修改，会有多条记录
   - 但 JSONB 压缩效率高，实际影响不大

---

## 🔄 与 Git 的关系

### Git 提交 vs 代码变更记录

| 特性     | Git 提交           | 代码变更记录       |
| -------- | ------------------ | ------------------ |
| **粒度** | 对话级别           | 消息级别           |
| **时机** | 每条消息后自动提交 | 每条消息生成时记录 |
| **存储** | Git 仓库           | 数据库             |
| **用途** | 版本控制、代码审查 | 追踪、审计、展示   |

### 工作流程

```
用户消息 → AI 生成响应 → 修改代码 → 记录变更 → 提交到 Git
                                    ↓
                            保存到 message_metadata
```

### 示例

```typescript
// 1. AI 修改代码
const result = await neovateService.modifyCode(userMessage, ...);

// 2. 记录代码变更（消息维度）
const metadata = {
  codeChanges: result.changes,  // 保存到数据库
  gitBranch: context.gitBranch,
};

// 3. 提交到 Git（对话维度）
if (context.mode === ConversationMode.EDIT && result.changes.length > 0) {
  await worktreeManager.commitChanges(
    userId,
    sessionId,
    `AI: ${userMessage}`
  );
  await worktreeManager.pushBranch(userId, sessionId);
}
```

---

## 📊 数据流向图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户发送消息                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   AI 生成响应（包含代码变更）                  │
│  - 调用 NeovateAIService.modifyCode()                       │
│  - 返回 result.changes (CodeChange[])                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    构建消息元数据                             │
│  metadata = {                                               │
│    codeChanges: result.changes,                             │
│    toolCalls: [...],                                        │
│    gitBranch: context.gitBranch,                            │
│    mrUrl: context.mrUrl                                     │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     保存 AI 消息                             │
│  await conversationManager.addMessage(                      │
│    sessionId,                                               │
│    MessageRole.ASSISTANT,                                   │
│    content,                                                 │
│    metadata  // 包含 codeChanges                            │
│  )                                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   存储到数据库                               │
│  1. messages 表: 消息主体                                    │
│  2. message_metadata 表: 元数据（包含 code_changes）         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   提交到 Git（异步）                          │
│  - git add .                                                │
│  - git commit -m "AI: ..."                                  │
│  - git push origin <branch>                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔮 未来优化方向

### 1. 对话级别的变更汇总

**需求**: 快速查看对话的所有代码变更

**方案**: 在 `conversation_contexts` 表添加 `total_code_changes` 字段

```sql
ALTER TABLE conversation_contexts
ADD COLUMN total_code_changes JSONB;
```

**更新时机**: 每次保存消息后，异步更新对话的汇总信息

### 2. 文件级别的变更历史

**需求**: 查看某个文件在对话中的所有变更

**方案**: 创建 `file_changes` 表

```sql
CREATE TABLE file_changes (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL,
  message_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  change_type VARCHAR(50) NOT NULL,
  diff TEXT,
  created_at TIMESTAMP
);

CREATE INDEX idx_file_changes_conversation_file
ON file_changes(conversation_id, file_path);
```

### 3. 变更统计

**需求**: 统计对话的代码变更量

**方案**: 在前端或后端计算统计信息

```typescript
interface CodeChangeStats {
  totalFiles: number;
  addedFiles: number;
  modifiedFiles: number;
  deletedFiles: number;
  totalLines: number;
  addedLines: number;
  deletedLines: number;
}
```

---

## 总结

**当前实现**:

- ✅ 代码变更记录在**消息维度**
- ✅ 存储在 `message_metadata.code_changes` 字段
- ✅ 每条 AI 消息可以包含多个文件的变更
- ✅ 支持精细化追踪和审计

**优势**:

- 精细化追踪
- 灵活的查询方式
- 与其他元数据一致

**注意事项**:

- 聚合查询需要遍历多条消息
- 可以考虑添加对话级别的汇总字段优化查询性能
