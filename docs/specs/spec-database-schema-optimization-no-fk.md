# 规格：数据库结构优化（无外键）

## 背景

- 当前数据库结构存在索引冗余、伪唯一索引、部分布尔字段可空导致的语义不一致。
- 业务约束要求：不引入外键关系，表间完整性仅通过代码事务逻辑保障。

## 目标

- 在不引入外键的前提下，完成数据库结构收敛：
  - 索引瘦身
  - 关键查询路径复合索引补齐
  - 伪唯一索引升级为真实唯一索引
  - 核心字段默认值与非空约束统一

## 非目标

- 不引入任何数据库外键（FK）。
- 不做跨模块业务语义改造。

## 约束

- C1：所有关系完整性由应用层事务保障。
- C2：会话删除链路必须保证 `message_metadata -> messages -> conversation_contexts/neovate_sessions -> conversations` 清理顺序。
- C3：`saveMessageMetadata` 写入前必须校验目标消息存在。

## 数据库结构基线

### conversations

- 保留索引：
  - `idx_conversations_user_id`
  - `idx_conversations_project_id`
  - `idx_conversations_created_at`
- 新增索引：
  - `idx_conversations_user_visibility_created_at (user_id, visibility, created_at)`
  - `idx_conversations_visibility_created_at (visibility, created_at)`
- 删除索引：
  - `idx_conversations_status`
  - `idx_conversations_visibility`
  - `idx_conversations_title`
- 字段约束：
  - `status` 默认值收敛为 `active`
  - `visibility` 默认值保持 `private`

### messages

- 保留索引：
  - `idx_messages_conversation_timestamp (conversation_id, timestamp)`
  - `idx_messages_parent_message_id`
- 删除索引：
  - `idx_messages_conversation_id`
  - `idx_messages_timestamp`

### message_metadata

- 唯一约束：
  - `unique_metadata_message_id (message_id)`
- 删除索引：
  - `idx_metadata_message_id`
  - `idx_metadata_is_question`
  - `idx_metadata_requires_response`
- 字段约束：
  - `is_question NOT NULL DEFAULT false`
  - `requires_response NOT NULL DEFAULT false`
  - `is_invalid NOT NULL DEFAULT false`

### conversation_contexts

- 唯一约束：
  - `unique_contexts_conversation_id (conversation_id)`
- 删除索引：
  - `idx_contexts_conversation_id`
  - `idx_contexts_mode`

### neovate_sessions

- 唯一约束：
  - `unique_neovate_sessions_conversation_id (conversation_id)`
- 保留索引：
  - `idx_neovate_sessions_neovate_session_id`
- 删除索引：
  - `idx_neovate_sessions_conversation_id`

### projects

- 保留索引：
  - `idx_projects_owner_id`
  - `idx_projects_created_at`
- 新增索引：
  - `idx_projects_is_active_created_at (is_active, created_at)`
- 删除索引：
  - `idx_projects_name`
  - `idx_projects_is_active`
- 字段约束：
  - `is_active NOT NULL DEFAULT true`

## 验收标准

- A1：迁移执行后，目标唯一约束与复合索引存在。
- A2：迁移执行后，上述删除索引不存在。
- A3：`saveMessageMetadata` 对不存在消息写入抛错。
- A4：`deleteSession` 清理链路包含 `neovate_sessions`。
- A5：不包含外键定义。

## 查询路径约束

- Q1：用户态会话列表必须拆分为“两次查询”：
  - 本人会话：`where user_id = ? order by created_at desc`
  - 公开会话：`where visibility = 'public' and user_id <> ? order by created_at desc`
- Q2：禁止继续使用 `user_id = ? OR visibility = 'public'` 的单条查询写法。
