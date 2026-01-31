# 环境变量

## 服务级别

- `PORT`：后端端口（默认 3001）
- `HOST`：监听地址（默认 0.0.0.0）
- `NODE_ENV`：运行环境
- `APP_ENV`：应用环境（用于会话过滤）

## 数据库

- `DATABASE_URL`：数据库连接串
- `DB_MAX_CONNECTIONS`：最大连接数
- `DB_IDLE_TIMEOUT`：空闲超时
- `DB_CONNECTION_TIMEOUT`：连接超时

## Git / Worktree

- `LOCAL_GIT_WORK_DIR`：主工作区
- `GIT_DEFAULT_BRANCH`
- `WORKTREE_BASE_DIR`

## GitLab

- `GITLAB_URL`
- `GITLAB_TOKEN`
- `GITLAB_PROJECT_PATH`

## 预览

- `PREVIEW_PORT_RANGE_START`、`PREVIEW_PORT_RANGE_END`
- `API_TARGET`（预览代理后端）
- `INFRASTRUCTURE_DIR`（预览基础设施目录）

## 代码工具

- `CODE_TOOL_TYPE`：qodercli / neovate / cursor / copilot
- `QODERCLI_PATH`、`QODERCLI_ARGS`
- `CURSOR_API_KEY`、`CURSOR_MODEL`
- `COPILOT_API_KEY`
- `IFLOW_API_KEY`
