# 数据模型

## users

- id
- username
- created_at / last_login_at

## projects

- id, name, description
- repo_dir, work_directory, git_branch
- git_repository_url, gitlab_project_id, gitlab_url
- is_active, owner_id

## conversations

- id, user_id, project_id
- status, visibility
- title, summary, project_name
- created_at, updated_at, completed_at, error

## conversation_contexts

- conversation_id
- work_dir, worktree_path
- git_branch, context_git_branch
- task_description, variables
- mode, mr_url, preview_info

## messages

- id, conversation_id
- role, content, timestamp
- parent_message_id

## message_metadata

- message_id
- tool_calls, code_changes
- is_question, question_options
- requires_response, is_invalid
- git_branch, mr_url, images, operation_denied

## neovate_sessions

- conversation_id
- neovate_session_id
- work_dir
- created_at, last_used_at

## Redis 键空间

- `sessions:detail:{sessionId}`
- `sessions:list:{userId|public}:{env}`
- `gitlab:branches:{projectId}:{projectDefaultBranch}`
- `projects:list:{isActive}:{search}`
- `projects:detail:{projectId}`
- `worktree:info:{projectId}:{userId}:{sessionId}`
- `storage:*`（会话上下文、消息列表、元数据等存储层缓存）
- 约束：`message_metadata.images` 不写入 Redis（仅落库）。
