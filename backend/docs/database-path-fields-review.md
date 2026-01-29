# 数据库路径字段审查报告

## 📊 概述

本文档审查数据库中所有存储路径的字段，确保路径存储的一致性和正确性。

---

## 🗄️ 数据库表及路径字段

### 1. **conversation_contexts** 表

存储对话上下文信息，包含多个路径字段：

#### 字段列表：

| 字段名         | 类型 | 说明          | 存储格式         | 状态      |
| -------------- | ---- | ------------- | ---------------- | --------- |
| `workDir`      | text | 工作目录路径  | **项目相对路径** | ✅ 已处理 |
| `worktreePath` | text | Worktree 路径 | **项目相对路径** | ✅ 已处理 |

#### 路径转换逻辑（新方案 - 变量占位符）：

**存储格式**：使用变量占位符，如 `${WORKTREE_BASE_DIR}/relative/path`

```typescript
// 保存时：使用 convertToStoredPath() 转换为变量占位符格式
const contextData = {
  workDir: convertToStoredPath(rawWorkDir) || "",
  worktreePath: convertToStoredPath(rawWorktreePath),
  // ...
};

// 读取时：使用 resolveStoredPath() 解析为当前环境的绝对路径
const context = {
  workDir: resolveStoredPath(row.workDir),
  worktreePath: resolveStoredPath(
    row.worktreePath,
    BasePathType.WORKTREE_BASE_DIR,
  ),
  // ...
};
```

**优势**：

- ✅ **环境无关**：数据库中存储的路径不依赖具体的物理路径
- ✅ **灵活切换**：可以轻松在开发/生产环境间切换
- ✅ **易于维护**：只需修改环境变量，无需迁移数据
- ✅ **可读性强**：一眼就能看出路径的基础目录类型

**支持的变量**：

- `${WORKTREE_BASE_DIR}` - Worktree 基础目录
- `${GIT_WORK_DIR}` - Git 工作空间基础目录

**示例**：

```
数据库存储：${WORKTREE_BASE_DIR}/user-abc123/front-intern
开发环境解析：/Users/dev/worktrees/user-abc123/front-intern
生产环境解析：/app/worktrees/user-abc123/front-intern
```

#### 路径转换逻辑：

```typescript
// 保存时：使用 convertToProjectRelativePath() 转换为相对路径
const contextData = {
  workDir: convertToProjectRelativePath(rawWorkDir) || "",
  worktreePath: convertToProjectRelativePath(rawWorktreePath),
  // ...
};

// 读取时：使用 smartResolvePath() 转换为绝对路径
const context = {
  workDir: smartResolvePath(row.workDir),
  worktreePath: smartResolvePath(row.worktreePath),
  // ...
};
```

---

### 2. **neovate_sessions** 表

存储 Neovate AI 会话映射信息：

#### 字段列表：

| 字段名    | 类型 | 说明         | 存储格式         | 状态      |
| --------- | ---- | ------------ | ---------------- | --------- |
| `workDir` | text | 工作目录路径 | **项目相对路径** | ✅ 已处理 |

#### 路径转换逻辑：

```typescript
// 保存时
await db.insert(neovateSessions).values({
  workDir: convertToProjectRelativePath(workDir) || "",
  // ...
});

// 读取时
const session = {
  workDir: smartResolvePath(row.workDir),
  // ...
};
```

---

### 3. **projects** 表

存储项目基本信息：

#### 字段列表：

| 字段名          | 类型         | 说明     | 存储格式     | 状态      |
| --------------- | ------------ | -------- | ------------ | --------- |
| `repoDir`       | text         | 仓库目录 | **绝对路径** | ⚠️ 需确认 |
| `workDirectory` | varchar(500) | 工作目录 | **绝对路径** | ⚠️ 需确认 |

#### 说明：

- 这两个字段存储的是**项目根目录的绝对路径**
- 作为其他相对路径的**基准路径**
- **不应该转换为相对路径**，因为它们本身就是基准

---

### 4. **message_metadata** 表

存储消息元数据：

#### 字段列表：

| 字段名        | 类型  | 说明         | 存储格式                 | 状态      |
| ------------- | ----- | ------------ | ------------------------ | --------- |
| `codeChanges` | jsonb | 代码变更信息 | JSON（可能包含文件路径） | ⚠️ 需检查 |
| `toolCalls`   | jsonb | 工具调用信息 | JSON（可能包含文件路径） | ⚠️ 需检查 |

#### 潜在问题：

这些 JSONB 字段可能包含文件路径，需要检查：

```typescript
// codeChanges 可能的结构
{
  "files": [
    {
      "path": "/absolute/path/to/file",  // ⚠️ 可能是绝对路径
      "changes": [...]
    }
  ]
}

// toolCalls 可能的结构
{
  "calls": [
    {
      "tool": "edit_file",
      "args": {
        "file": "/absolute/path/to/file"  // ⚠️ 可能是绝对路径
      }
    }
  ]
}
```

---

## 🔍 路径处理工具函数

### 核心函数：

#### 1. `convertToProjectRelativePath(absolutePath: string): string | null`

- **用途**：将绝对路径转换为项目相对路径
- **位置**：`src/utils/PathUtils.ts`
- **使用场景**：保存到数据库前

#### 2. `smartResolvePath(path: string): string`

- **用途**：智能解析路径（相对路径 → 绝对路径）
- **位置**：`src/utils/PathUtils.ts`
- **使用场景**：从数据库读取后

#### 3. `resolveProjectPath(relativePath: string): string`

- **用途**：将项目相对路径解析为绝对路径
- **位置**：`src/utils/PathUtils.ts`
- **使用场景**：辅助函数

---

## ✅ 已处理的路径字段

### conversation_contexts 表

- ✅ `workDir` - 已使用相对路径存储
- ✅ `worktreePath` - 已使用相对路径存储

### neovate_sessions 表

- ✅ `workDir` - 已使用相对路径存储

---

## ⚠️ 需要确认的字段

### 1. projects 表

```typescript
// 这些字段应该保持绝对路径（作为基准路径）
repoDir: text; // ✓ 正确：存储绝对路径
workDirectory: varchar; // ✓ 正确：存储绝对路径
```

### 2. message_metadata 表中的 JSONB 字段

#### codeChanges 字段

**需要检查的位置**：

```typescript
// 保存代码变更时
await saveMessageMetadata({
  codeChanges: {
    files: [
      {
        path: "???", // 应该是相对路径还是绝对路径？
        // ...
      },
    ],
  },
});
```

**建议**：

- 如果 `codeChanges` 中包含文件路径，应该存储**项目相对路径**
- 需要在保存前转换，读取后恢复

#### toolCalls 字段

**需要检查的位置**：

```typescript
// 保存工具调用时
await saveMessageMetadata({
  toolCalls: [
    {
      tool: "edit_file",
      args: {
        file: "???", // 应该是相对路径还是绝对路径？
      },
    },
  ],
});
```

**建议**：

- 如果 `toolCalls` 中包含文件路径参数，应该存储**项目相对路径**
- 需要在保存前转换，读取后恢复

---

## 🎯 推荐的处理方案

### 方案 1：JSONB 字段路径规范化（推荐）

#### 实现步骤：

1. **创建 JSONB 路径转换工具**

```typescript
// src/utils/JsonPathUtils.ts

/**
 * 递归转换 JSON 对象中的路径字段
 */
export function convertJsonPaths(
  obj: any,
  converter: (path: string) => string,
): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertJsonPaths(item, converter));
  }

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    // 识别路径字段（根据字段名）
    if (
      key === "path" ||
      key === "file" ||
      key === "dir" ||
      key.endsWith("Path")
    ) {
      if (typeof value === "string") {
        result[key] = converter(value);
        continue;
      }
    }
    result[key] = convertJsonPaths(value, converter);
  }
  return result;
}
```

2. **在保存时转换**

```typescript
// 保存 message_metadata 时
const metadata = {
  codeChanges: convertJsonPaths(rawCodeChanges, convertToProjectRelativePath),
  toolCalls: convertJsonPaths(rawToolCalls, convertToProjectRelativePath),
};
```

3. **在读取时恢复**

```typescript
// 读取 message_metadata 时
const metadata = {
  codeChanges: convertJsonPaths(dbMetadata.codeChanges, smartResolvePath),
  toolCalls: convertJsonPaths(dbMetadata.toolCalls, smartResolvePath),
};
```

### 方案 2：保持现状（不推荐）

- 如果 JSONB 中的路径已经是相对路径，可以保持现状
- 但需要确保所有写入的地方都使用相对路径

---

## 📋 检查清单

### 立即需要检查的项目：

- [ ] 检查 `message_metadata.codeChanges` 中是否包含文件路径
- [ ] 检查 `message_metadata.toolCalls` 中是否包含文件路径
- [ ] 如果包含路径，确认当前存储的是绝对路径还是相对路径
- [ ] 如果是绝对路径，需要实现转换逻辑

### 代码位置：

```bash
# 搜索 codeChanges 的使用
grep -r "codeChanges" src/

# 搜索 toolCalls 的使用
grep -r "toolCalls" src/

# 检查消息元数据的保存逻辑
src/storage/DrizzleConversationStorage.ts
```

---

## 🔄 迁移建议

如果发现 JSONB 字段中存储了绝对路径，需要执行数据迁移：

### 迁移脚本示例：

```typescript
// scripts/migrate-jsonb-paths.ts
import { db } from "../src/db";
import { messageMetadata } from "../src/db/schema";
import { convertToProjectRelativePath } from "../src/utils/PathUtils";
import { convertJsonPaths } from "../src/utils/JsonPathUtils";

async function migrateJsonbPaths() {
  const records = await db.select().from(messageMetadata);

  for (const record of records) {
    const updates: any = {};

    if (record.codeChanges) {
      updates.codeChanges = convertJsonPaths(
        record.codeChanges,
        convertToProjectRelativePath,
      );
    }

    if (record.toolCalls) {
      updates.toolCalls = convertJsonPaths(
        record.toolCalls,
        convertToProjectRelativePath,
      );
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(messageMetadata)
        .set(updates)
        .where(eq(messageMetadata.id, record.id));
    }
  }
}
```

---

## 📊 总结

### ✅ 已完成（新方案 - 变量占位符）：

**conversation_contexts 表**：

- ✅ `workDir` - 使用 `${GIT_WORK_DIR}/path` 或 `${WORKTREE_BASE_DIR}/path` 格式
- ✅ `worktreePath` - 使用 `${WORKTREE_BASE_DIR}/path` 格式

**neovate_sessions 表**：

- ✅ `workDir` - 使用 `${GIT_WORK_DIR}/path` 或 `${WORKTREE_BASE_DIR}/path` 格式

### ✅ 正确保持绝对路径：

**projects 表**：

- ✅ `repoDir` - 项目根目录（基准路径）
- ✅ `workDirectory` - 工作目录（基准路径）

### ⚠️ 需要进一步检查：

**message_metadata 表**：

- ⚠️ `codeChanges` - JSONB 字段可能包含路径
- ⚠️ `toolCalls` - JSONB 字段可能包含路径

---

## 🚀 迁移到变量占位符格式

### 为什么要迁移？

**旧方案（纯相对路径）的问题**：

```
数据库存储：user-abc123/front-intern
问题：不知道基础目录是什么，需要通过路径特征猜测
```

**新方案（变量占位符）的优势**：

```
数据库存储：${WORKTREE_BASE_DIR}/user-abc123/front-intern
优势：明确指定基础目录，环境无关，易于维护
```

### 迁移步骤

#### 1. 执行迁移脚本

```bash
# 进入 backend 目录
cd /Users/gangqiang/Desktop/front-intern/backend

# 执行迁移脚本
tsx scripts/migrate-to-variable-paths.ts
```

#### 2. 验证迁移结果

迁移脚本会：

- ✅ 将 `conversation_contexts` 表的 `workDir` 和 `worktreePath` 转换为变量格式
- ✅ 将 `neovate_sessions` 表的 `workDir` 转换为变量格式
- ✅ 跳过已经是变量格式的记录
- ✅ 输出详细的迁移日志

**预期输出示例**：

```
🚀 开始迁移路径到变量占位符格式...

📋 迁移 conversation_contexts 表...
   找到 15 条记录
   ✓ workDir: user-abc/project -> ${WORKTREE_BASE_DIR}/user-abc/project
   ✓ worktreePath: user-abc/project -> ${WORKTREE_BASE_DIR}/user-abc/project
   完成：更新 15 条，跳过 0 条

📋 迁移 neovate_sessions 表...
   找到 8 条记录
   ✓ workDir: user-xyz/project -> ${WORKTREE_BASE_DIR}/user-xyz/project
   完成：更新 8 条，跳过 0 条

✅ 迁移完成！
🎉 所有路径已成功迁移到变量占位符格式
```

#### 3. 验证应用运行

迁移后，启动应用验证：

```bash
# 启动后端服务
npm run dev

# 测试对话功能
# - 创建新对话
# - 加载现有对话
# - 检查路径解析是否正确
```

### 迁移脚本位置

📄 `/Users/gangqiang/Desktop/front-intern/backend/scripts/migrate-to-variable-paths.ts`

### 回滚方案

如果迁移出现问题，可以：

1. **数据库备份**：迁移前先备份数据库
2. **手动回滚**：使用 SQL 更新语句恢复旧格式
3. **重新迁移**：修复问题后重新执行迁移脚本

---

## 🔧 新的 API 使用指南

### 保存路径到数据库

```typescript
import { convertToStoredPath } from "../utils/PathUtils";

// 将绝对路径转换为变量占位符格式
const absolutePath = "/Users/dev/worktrees/user-abc/project";
const storedPath = convertToStoredPath(absolutePath);
// 结果：${WORKTREE_BASE_DIR}/user-abc/project

// 保存到数据库
await db.insert(conversationContexts).values({
  workDir: storedPath,
  // ...
});
```

### 从数据库读取路径

```typescript
import { resolveStoredPath, BasePathType } from '../utils/PathUtils';

// 从数据库读取
const row = await db.select().from(conversationContexts).where(...);

// 解析为当前环境的绝对路径
const absolutePath = resolveStoredPath(row.workDir);
// 开发环境：/Users/dev/worktrees/user-abc/project
// 生产环境：/app/worktrees/user-abc/project

// 指定基础路径类型
const worktreePath = resolveStoredPath(
  row.worktreePath,
  BasePathType.WORKTREE_BASE_DIR
);
```

### 检查路径是否包含变量

```typescript
import { hasPathVariable, extractPathVariableType } from "../utils/PathUtils";

const path1 = "${WORKTREE_BASE_DIR}/user-abc/project";
const path2 = "user-abc/project";

console.log(hasPathVariable(path1)); // true
console.log(hasPathVariable(path2)); // false

console.log(extractPathVariableType(path1));
// BasePathType.WORKTREE_BASE_DIR
```

---

## 📝 下一步行动

### 立即执行：

1. ✅ **已完成**：更新 `PathUtils.ts` 支持变量占位符
2. ✅ **已完成**：更新 `DrizzleConversationStorage.ts` 使用新 API
3. ✅ **已完成**：创建迁移脚本 `migrate-to-variable-paths.ts`
4. ⏳ **待执行**：运行迁移脚本
5. ⏳ **待验证**：测试应用功能

### 后续优化：

1. 检查 `message_metadata.codeChanges` 和 `toolCalls` 字段
2. 如果包含路径，实现 JSONB 路径转换逻辑
3. 考虑为其他可能包含路径的字段添加变量支持

---

**生成时间**: 2026-01-29  
**版本**: 2.0 (变量占位符方案)
