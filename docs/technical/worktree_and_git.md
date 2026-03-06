# Worktree 与 Git

## Worktree 规则

- 每个会话一个 Worktree
- 路径：`{WORKTREE_BASE_DIR}/project-{projectId}/user-{userId}/conversation-{sessionId}`
- 分支：`conversation-{sessionId前8位}-{时间戳}`

## 创建流程

1. 校验基础分支
2. 创建会话分支
3. `git worktree add` 创建独立目录

## 提交与推送

- AI 修改后自动提交
- 推送使用当前 worktree 分支（以 `git branch --show-current` 为准）
- 推送失败时尝试 `git push --set-upstream`

## 认证与配置

- Git 认证统一复用 `GITLAB_TOKEN`，仅对网络类命令注入 `GIT_HTTP_EXTRAHEADER=Authorization: Bearer <token>`。
- 本地类命令（如 `status`、`diff`、`log`）不注入认证头。
- 禁止将 token 写入仓库 URL（不允许 `oauth2:<token>@...` 形式），避免泄露到 `.git/config` 与日志。
- Git 运行配置通过 `GIT_CONFIG_GLOBAL` 指向 `$LOCAL_GIT_WORK_DIR/.gitconfig.workspace`，仅在工作区生效，不污染全局 `~/.gitconfig`。

## 清理

- 删除 Worktree 时同时删除分支
- 归档会话可清理 Worktree
