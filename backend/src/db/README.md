# 数据库 Schema 说明

本目录包含使用 Drizzle ORM 定义的数据库 schema。

## 表结构

### 1. conversations
对话会话表，存储对话的基本信息。

**字段：**
- `id`: UUID 主键
- `session_id`: Agent 执行的 session ID（唯一）
- `task_id`: 任务 ID
- `status`: 会话状态
- `created_at`: 创建时间
- `updated_at`: 更新时间
- `completed_at`: 完成时间
- `error`: 错误信息

**索引：**
- `session_id`, `task_id`, `status`, `created_at`

### 2. conversation_contexts
对话上下文表，存储对话的上下文信息。

**字段：**
- `id`: UUID 主键
- `conversation_id`: 关联的对话 ID
- `work_dir`: 工作目录
- `git_branch`: Git 分支
- `relevant_files`: 相关文件（JSONB）
- `task_description`: 任务描述
- `current_branch_id`: 当前分支 ID
- `variables`: 变量（JSONB）
- `created_at`: 创建时间
- `updated_at`: 更新时间

**索引：**
- `conversation_id`（唯一）

### 3. branches
分支表，存储对话的分支信息。

**字段：**
- `id`: UUID 主键
- `conversation_id`: 关联的对话 ID
- `name`: 分支名称
- `parent_message_id`: 父消息 ID
- `is_active`: 是否激活
- `created_at`: 创建时间

**索引：**
- `conversation_id`, `parent_message_id`, `is_active`

### 4. messages
消息表，存储对话消息。

**字段：**
- `id`: UUID 主键
- `conversation_id`: 关联的对话 ID
- `branch_id`: 关联的分支 ID
- `role`: 角色（user/assistant）
- `content`: 消息内容
- `is_complete`: 是否完成（用于流式响应）
- `timestamp`: 时间戳
- `parent_message_id`: 父消息 ID

**索引：**
- `conversation_id`, `branch_id`, `timestamp`, `parent_message_id`

### 5. message_metadata
消息元数据表，存储消息的额外信息。

**字段：**
- `id`: UUID 主键
- `message_id`: 关联的消息 ID
- `tool_calls`: 工具调用（JSONB）
- `code_changes`: 代码变更（JSONB）
- `thinking`: 思考过程
- `is_question`: 是否为问题
- `question_options`: 问题选项（JSONB）
- `requires_response`: 是否需要响应
- `references`: 引用（JSONB）
- `is_invalid`: 是否无效
- `created_at`: 创建时间

**索引：**
- `message_id`（唯一）, `is_question`, `requires_response`

## 设计原则

### 无外键约束
数据库表之间不使用外键约束，原因：
- **灵活性**：允许应用层控制数据完整性
- **性能**：避免外键检查的性能开销
- **扩展性**：便于未来的数据分片和分布式部署

应用层需要负责：
- 删除对话时手动清理相关数据
- 查询时处理可能的数据不一致
- 定期运行数据完整性检查

### Session ID 关联
每个对话都与 Agent 执行的 `session_id` 关联，用于：
- 快速查询对话历史
- 关联 Agent 执行上下文
- 跨系统的会话追踪

## 使用方式

### 生成迁移
```bash
pnpm db:generate
```

### 执行迁移
```bash
pnpm db:migrate
```

### 直接推送到数据库
```bash
pnpm db:push
```

### 打开 Drizzle Studio
```bash
pnpm db:studio
```

## 类型导出

所有表都导出了对应的 TypeScript 类型：
- `Conversation` / `NewConversation`
- `ConversationContext` / `NewConversationContext`
- `Branch` / `NewBranch`
- `Message` / `NewMessage`
- `MessageMetadata` / `NewMessageMetadata`
