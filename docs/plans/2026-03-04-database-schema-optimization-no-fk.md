# Database Schema Optimization (No FK) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不引入外键的前提下，完成数据库结构收敛（索引精简、唯一约束收敛、字段非空与默认值统一）并同步代码级一致性保障。

**Architecture:** 以 `backend/src/db/schema.ts` 作为结构单一事实来源，新增一条 Drizzle SQL 迁移执行 DDL 收敛；应用层通过 `DrizzleConversationStorage` 事务删除和元数据写入前校验保障关系完整性。文档层同步规格与迭代记录，保持“规格驱动 + 迭代记录”一致。

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Jest, pnpm

---

### Task 1: 先写失败测试，锁定代码级关系保障

**Files:**
- Create: `backend/src/__tests__/drizzleConversationStorage.test.ts`
- Modify: `backend/src/storage/DrizzleConversationStorage.ts`

1. 写 `saveMessageMetadata` 在 message 不存在时抛错的失败测试。
2. 写 `deleteSession` 会清理 `neovate_sessions` 的失败测试。
3. 运行：`pnpm --filter web-frontend-intern-assistant-backend test -- drizzleConversationStorage.test.ts`，确认先失败。

### Task 2: 实现最小代码让测试通过

**Files:**
- Modify: `backend/src/storage/DrizzleConversationStorage.ts`

1. `saveMessageMetadata` 增加消息存在性校验，不存在直接抛错。
2. `deleteSession` 改为集合删除 `message_metadata`，并补 `neovate_sessions` 删除。
3. 运行同一测试命令，确认通过。

### Task 3: 收敛 schema 与迁移

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0006_schema_optimization_no_fk.sql`
- Modify: `backend/drizzle/meta/_journal.json`

1. 将伪唯一索引改为真实 `uniqueIndex`。
2. 删除冗余单列索引，新增复合索引。
3. 收紧关键布尔字段 `NOT NULL + DEFAULT` 与核心状态字段默认值。
4. 迁移 SQL 使用 `IF EXISTS/IF NOT EXISTS` 保障可重复执行。

### Task 4: 文档同步

**Files:**
- Create: `docs/specs/spec-database-schema-optimization-no-fk.md`
- Modify: `docs/specs/README.md`
- Modify: `docs/technical/data_model.md`
- Modify: `docs/iterations/2026-03-04.md`

1. 新增规格文档，明确无外键约束、代码一致性保障、索引与字段约束新基线。
2. 更新规格索引。
3. 更新技术数据模型说明。
4. 追加当日迭代记录。

### Task 5: 全量验证

**Files:**
- N/A

1. 运行：`pnpm --filter web-frontend-intern-assistant-backend test -- drizzleConversationStorage.test.ts`
2. 运行：`pnpm -C backend build`
3. 汇总验证结果与风险边界（无外键下仍依赖应用层事务）。
