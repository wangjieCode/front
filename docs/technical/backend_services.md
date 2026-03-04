# 后端服务职责

## 会话与消息

- ConversationManager：会话创建、状态维护、上下文持久化
- MessageRouter：消息入库、AI 响应入库、提问等待
- 会话消息历史接口支持 `since` 增量查询，前端在流式完成后走增量刷新，降低全量读压力。

## AI 与 Git

- ConversationAIService：调用 Neovate，构建元数据，自动提交
- NeovateAIService：执行 SDK，解析输出与 diff
- GitService：git add/commit/push
- GitLabMCPService：创建与查询 MR

## Worktree 与项目

- WorktreeManager：创建/删除/查询 worktree 与分支
- ProjectService：项目 CRUD 与仓库拉取
- RepositoryService：克隆与仓库初始化

## 预览与基础设施

- ProjectPreviewService：分配端口、建立软链接、PM2 启动
- 生产 API 进程使用 PM2 集群双实例（固定 `2`），发布时使用 `pm2 reload` 逐实例滚动重载；Worker 保持单实例。

## 队列与调度

- QueueManager：注册 BullMQ 可重复任务（归档、清理）。
- Worker：消费队列任务并执行归档/清理逻辑；Redis 不可达时不再退出进程，按 `WORKER_RETRY_DELAY_MS` 周期重试连接。
- Dashboard 轮询间隔：`86400000ms`（1 天）。
- Worker 空闲轮询间隔（drainDelay）：`86400s`（1 天）。

## 业务缓存

- LruCacheService：统一封装进程内 LRU 缓存读写、按模式批量清理，进程级缓存上限 `50MB`；支持按配置周期落盘缓存快照，并在服务启动后自动恢复（启用条件：`LRU_CACHE_PERSIST_PATH`）。
- ConversationManager：缓存会话详情、会话列表、GitLab 分支列表。
- ProjectService：缓存项目列表与项目详情，写操作后清理对应键。
- WorktreeManager：缓存 worktree 信息（分支、路径）。
- DrizzleConversationStorage：缓存会话上下文、消息列表、消息元数据。
- 缓存异常降级：缓存访问失败时直接回退无缓存路径（数据库直读/实时探测）；业务缓存不依赖 Redis。

## 接口观测

- requestLogger：统一记录 `/api` 接口响应耗时（方法、路径、状态码、耗时）。
- 慢请求阈值：`API_SLOW_LOG_MS`（默认 `1000ms`），超过阈值使用 `warn` 日志输出。

## 存储

- DrizzleConversationStorage：数据库读写
- ConversationStorageAdapter：领域模型转换
