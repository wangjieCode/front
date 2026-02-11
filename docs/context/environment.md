# 环境变量

## 服务级别

- `PORT`：后端端口（默认 3001）
- `HOST`：监听地址（默认 0.0.0.0）
- `NODE_ENV`：运行环境
- `APP_ENV`：应用环境（用于会话过滤）
- `API_SLOW_LOG_MS`：接口慢请求阈值（毫秒，默认 1000）
- `WORKER_RETRY_DELAY_MS`：Worker 启动失败后的重试间隔（毫秒，默认 30000）

## 数据库

- `DATABASE_URL`：数据库连接串
- `DB_MAX_CONNECTIONS`：最大连接数
- `DB_IDLE_TIMEOUT`：空闲超时
- `DB_CONNECTION_TIMEOUT`：连接超时

## Redis

- `REDIS_URL`：Redis 连接串（队列）
- `REDIS_PREFIX`：Redis Key 前缀
- `DISABLE_REDIS`：设为 `true` 时禁用 Redis（仅影响队列/调度相关）

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
