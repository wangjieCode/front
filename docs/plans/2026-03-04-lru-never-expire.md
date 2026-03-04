# LRU 永不过期与持久化改造 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将业务 LRU 缓存改为默认永不过期，同时保证快照持久化/恢复不退化。

**Architecture:** 保持 `LruCacheService` 作为唯一缓存入口；通过 `ttlSeconds <= 0` 表示无过期时间；快照中显式记录“无 TTL”条目并在恢复时按无 TTL 回填。业务层各服务 TTL 常量统一改为 0，保留写后清理逻辑。

**Tech Stack:** TypeScript, Jest, lru-cache

---

### Task 1: 先写失败测试覆盖目标行为

**Files:**
- Create: `backend/src/__tests__/lruCacheService.test.ts`

1. 写测试：`ttlSeconds=0` 时缓存不应短时间过期。
2. 写测试：无 TTL 条目执行 `persistNow` 后应写入快照，并在新实例恢复后可命中。
3. 运行：`pnpm --filter web-frontend-intern-assistant-backend test -- lruCacheService.test.ts`，确认先失败。

### Task 2: 最小实现通过测试

**Files:**
- Modify: `backend/src/services/LruCacheService.ts`

1. `setJson`：支持 `ttlSeconds <= 0` 走“无 TTL”写入。
2. 快照结构支持 `ttlMs: null`，持久化时纳入“无 TTL”条目。
3. 恢复时识别 `ttlMs: null`，按无 TTL 写入。

### Task 3: 业务层 TTL 统一为永不过期

**Files:**
- Modify: `backend/src/services/ConversationManager.ts`
- Modify: `backend/src/services/ProjectService.ts`
- Modify: `backend/src/services/WorktreeManager.ts`
- Modify: `backend/src/storage/DrizzleConversationStorage.ts`

1. 将各业务缓存 TTL 常量改为 `0`（永不过期）。
2. 保留现有写后删缓存与模式清理逻辑，不引入旧兼容分支。

### Task 4: 验证与文档同步

**Files:**
- Modify: `docs/specs/spec-conversations.md`
- Modify: `docs/specs/spec-projects.md`
- Modify: `docs/specs/spec-worktree.md`
- Modify: `docs/technical/backend_services.md`
- Modify: `docs/iterations/2026-03-04.md`

1. 更新规格中的缓存失效策略描述（改为“默认永不过期 + 显式失效”）。
2. 在当日迭代文档追加变更、风险与验证记录。
3. 运行目标测试，确认通过。
