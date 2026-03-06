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
- Dashboard 轮询间隔：`604800000ms`（1 周）。
- Worker 空闲轮询间隔（drainDelay）：`604800s`（1 周）。

## 业务缓存

- RedisCacheService：统一封装业务 Redis 缓存读写（JSON）与按模式批量清理；业务键默认按“无 TTL（永不过期）”写入，通过显式删键失效。
- CacheStrategyManager：统一封装缓存策略（当前提供 stale-while-revalidate），负责刷新窗口判断、异步回源刷新、同 key 刷新去重，供业务服务复用。
- ConversationManager：缓存会话详情、会话列表、GitLab 分支列表。
- ConversationManager：`gitlab:branches:*` 采用“无 TTL + 软刷新窗口”策略（默认 120 秒），窗口内命中缓存；超时命中时先返回旧值并异步回源刷新（stale-while-revalidate）。
- ProjectService：缓存项目列表与项目详情，写操作后清理对应键；缓存调用统一通过 `CacheStrategyManager`。
- WorktreeManager：worktree 信息（分支、路径）通过实时 Git 探测获取，不再维护独立缓存层。
- DrizzleConversationStorage：缓存会话上下文、消息列表、消息元数据；缓存调用统一通过 `CacheStrategyManager`。
- 缓存异常降级：缓存访问失败时直接回退无缓存路径（数据库直读/实时探测）。
- Redis 隔离：Task 队列使用 `TASK_REDIS_URL/TASK_REDIS_PREFIX`，业务缓存使用 `BIZ_REDIS_URL/BIZ_REDIS_PREFIX`，两者独立配置。

## 接口观测

- requestLogger：统一记录 `/api` 接口响应耗时（方法、路径、状态码、耗时）。
- 慢请求阈值：`API_SLOW_LOG_MS`（默认 `1000ms`），超过阈值使用 `warn` 日志输出。

## 存储

- DrizzleConversationStorage：数据库读写
- ConversationStorageAdapter：领域模型转换
