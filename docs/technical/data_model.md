# 数据模型

## 结构原则

- 不使用数据库外键，关系完整性由应用层事务保障。
- 核心一对一关系通过唯一约束实现：
  - `conversation_contexts.conversation_id`
  - `neovate_sessions.conversation_id`
  - `message_metadata.message_id`

## users

- id
- username（unique）
- created_at / last_login_at

## projects

- id, name, description
- repo_dir, work_directory, git_branch
- git_repository_url, gitlab_project_id, gitlab_url
- is_active, owner_id
- 索引：`(owner_id)`, `(created_at)`, `(is_active, created_at)`

## conversations

- id, user_id, project_id
- status, visibility
- title, summary, project_name
- created_at, updated_at, completed_at, error
- 索引：`(user_id)`, `(project_id)`, `(created_at)`, `(user_id, visibility, created_at)`, `(visibility, created_at)`

## conversation_contexts

- conversation_id（unique）
- work_dir, worktree_path
- git_branch, context_git_branch
- task_description, variables
- mode（历史兼容列，当前链路固定写入 `edit`）, mr_url, preview_info

## messages

- id, conversation_id
- role, content, timestamp
- parent_message_id
- 索引：`(conversation_id, timestamp)`, `(parent_message_id)`

## message_metadata

- message_id（unique）
- tool_calls, code_changes
- is_question（not null default false）, question_options
- requires_response（not null default false）, is_invalid（not null default false）
- git_branch, mr_url, images, operation_denied

## neovate_sessions

- conversation_id（unique）
- neovate_session_id
- work_dir
- created_at, last_used_at

## 缓存键空间（业务 Redis）

- `sessions:detail:{sessionId}`
- `sessions:list:{userId|public}:{env}`
- `gitlab:branches:{projectId}:{projectDefaultBranch}`
- `projects:list:{isActive}:{search}`
- `projects:detail:{projectId}`
- `storage:*`（会话上下文、消息列表、元数据等存储层缓存）
- 约束：`message_metadata.images` 不进入缓存（仅落库）。
