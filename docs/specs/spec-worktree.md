# 规格：Worktree 管理

## 基本信息

- 名称：每会话独立 Worktree
- 负责人：未指定
- 创建日期：2026-01-30
- 最近更新：2026-03-06

## 背景

- 多会话共享分支会引发冲突与切换成本。

## 目标

- 每个会话独立 Worktree 与分支。

## 非目标

- 不复用同一 Worktree。

## 范围

- In：创建、查询、清理 Worktree。
- Out：跨会话合并策略。

## 业务规则

- Worktree 路径固定规则：`{WORKTREE_BASE_DIR}/project-{projectId}/user-{userId}/conversation-{sessionId}`。
- 分支名按 sessionId + 时间戳生成。

## 需求

### 功能需求

- F1：会话创建统一创建 Worktree。
- F2：查询 Worktree 信息走实时探测（目录存在性 + 当前分支）。
- F3：删除 Worktree 时删除分支。
- F4：Worktree 清理任务由 BullMQ 后台任务按周调度。

### 非功能需求

- N1：分支名需要可追溯。
- N2：后台任务对 Redis 的空闲轮询频率统一为 1 周。
- N3：Worktree 信息查询需可重复调用且返回实时分支信息，不得依赖进程缓存。

## 用户体验

- 会话创建后立即可编辑。

## 数据与接口

- conversation_contexts.worktree_path / context_git_branch。

## 验收标准

- A1：多会话同时创建互不影响。
- A2：Worktree 删除后仓库无残留分支。

## 风险与依赖

- 风险：磁盘占用增大。

## 迭代记录

- 2026-01-30：重建规格文档。
- 2026-02-11：明确 Worktree 清理为按天调度，并约束后台任务 Redis 空闲轮询频率为 1 天。
- 2026-02-11：Worktree 查询缓存切换为进程内 LRU，移除 Worktree 读取对 Redis 的依赖。
- 2026-02-26：移除 Worktree 链路 Redis 缓存残留代码，统一接入 `LruCacheService`（50MB 上限）。
- 2026-03-04：Worktree 信息缓存改为默认永不过期（`ttlSeconds=0`），通过删除链路显式清理缓存键。
- 2026-03-04：Worktree 缓存调用统一收敛到 `CacheStrategyManager`，提升缓存策略复用能力。
- 2026-03-05：移除 WorktreeManager 中的缓存层（LruCacheService/CacheStrategyManager），`getWorktreeInfo` 改为实时读取。
- 2026-03-06：BullMQ 归档/清理任务由按天改为按周（周日触发），并将 Worker 与 Dashboard 的 Redis 轮询间隔统一调整为 1 周。
