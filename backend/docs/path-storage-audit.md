# 路径存储全面审查报告

## 📋 执行时间

2026-01-29 16:02

## 🎯 审查目标

检查项目中所有存储路径的位置，确保：

1. ✅ 使用变量占位符格式（`${WORKTREE_BASE_DIR}/path` 或 `${GIT_WORK_DIR}/path`）
2. ❌ 不存在硬编码的绝对路径
3. ❌ 不存在无变量的纯相对路径

---

## 📊 数据库表路径字段汇总

### 1. ✅ conversation_contexts 表（已优化）

| 字段           | 类型 | 存储格式                                              | 状态                |
| -------------- | ---- | ----------------------------------------------------- | ------------------- |
| `workDir`      | text | `${GIT_WORK_DIR}/path` 或 `${WORKTREE_BASE_DIR}/path` | ✅ 已使用变量占位符 |
| `worktreePath` | text | `${WORKTREE_BASE_DIR}/path`                           | ✅ 已使用变量占位符 |

**处理逻辑**：

- 保存：`convertToStoredPath()` → `${WORKTREE_BASE_DIR}/user-xxx/project`
- 读取：`resolveStoredPath()` → `/Users/dev/worktrees/user-xxx/project`

---

### 2. ✅ neovate_sessions 表（已优化）

| 字段      | 类型 | 存储格式                                              | 状态                |
| --------- | ---- | ----------------------------------------------------- | ------------------- |
| `workDir` | text | `${GIT_WORK_DIR}/path` 或 `${WORKTREE_BASE_DIR}/path` | ✅ 已使用变量占位符 |

**处理逻辑**：

- 保存：`convertToStoredPath()` → `${WORKTREE_BASE_DIR}/user-xxx/project`
- 读取：`resolveStoredPath()` → `/Users/dev/worktrees/user-xxx/project`

---

### 3. ⚠️ projects 表（需要优化）

| 字段            | 类型         | 当前存储格式 | 建议格式               | 状态            |
| --------------- | ------------ | ------------ | ---------------------- | --------------- |
| `repoDir`       | text         | 纯相对路径   | `${GIT_WORK_DIR}/path` | ⚠️ **需要优化** |
| `workDirectory` | varchar(500) | 纯相对路径   | `${GIT_WORK_DIR}/path` | ⚠️ **需要优化** |

**当前问题**：

```typescript
// ProjectService.ts - 当前实现
const relativeRepoDir = this.convertToRelative(workDirectory) || workDirectory;
// 结果：存储纯相对路径，如 "front-workspace/my-project"
// 问题：不知道基础目录是什么
```

**建议改进**：

```typescript
// 应该使用变量占位符
const storedRepoDir = convertToStoredPath(workDirectory);
// 结果：${GIT_WORK_DIR}/front-workspace/my-project
// 优势：明确指定基础目录
```

**影响范围**：

- ✅ `ProjectService.createProject()` - 创建项目时
- ✅ `ProjectService.updateProject()` - 更新项目时
- ✅ `ProjectService.resolveProjectPaths()` - 读取项目时

---

### 4. ⚠️ message_metadata 表（待检查）

| 字段          | 类型  | 可能包含路径         | 状态      |
| ------------- | ----- | -------------------- | --------- |
| `codeChanges` | jsonb | 可能包含文件路径     | ⚠️ 待检查 |
| `toolCalls`   | jsonb | 可能包含文件路径参数 | ⚠️ 待检查 |

**需要检查**：

1. 这些 JSONB 字段是否包含文件路径
2. 如果包含，是否使用了变量占位符格式

---

## 🔍 代码中的路径处理

### ✅ 已正确使用变量占位符的地方

#### DrizzleConversationStorage.ts

```typescript
// ✅ 保存时使用 convertToStoredPath
const contextData = {
  workDir: convertToStoredPath(rawWorkDir) || "",
  worktreePath: convertToStoredPath(rawWorktreePath),
};

// ✅ 读取时使用 resolveStoredPath
const context = {
  workDir: resolveStoredPath(row.workDir),
  worktreePath: resolveStoredPath(
    row.worktreePath,
    BasePathType.WORKTREE_BASE_DIR,
  ),
};
```

---

### ⚠️ 需要更新的地方

#### 1. ProjectService.ts

**问题代码**：

```typescript
// ❌ 使用旧的 convertToProjectRelativePath
public convertToRelative(absPath: string | null): string | null {
  return convertToProjectRelativePath(absPath);
}

// ❌ 创建项目时使用纯相对路径
const relativeRepoDir = this.convertToRelative(workDirectory) || workDirectory;
const relativeWorkDir = this.convertToRelative(workDirectory) || workDirectory;
```

**建议修改**：

```typescript
// ✅ 使用新的 convertToStoredPath
public convertToStoredPath(absPath: string | null): string | null {
  return convertToStoredPath(absPath);
}

// ✅ 创建项目时使用变量占位符
const storedRepoDir = this.convertToStoredPath(workDirectory) || workDirectory;
const storedWorkDir = this.convertToStoredPath(workDirectory) || workDirectory;
```

#### 2. RepositoryService.ts

**当前代码**：

```typescript
// ⚠️ 使用旧的 resolveProjectRelativePath
const workDir = resolveProjectRelativePath(
  project.workDirectory,
  BasePathType.GIT_WORK_DIR,
);
```

**建议修改**：

```typescript
// ✅ 使用新的 resolveStoredPath
const workDir = resolveStoredPath(
  project.workDirectory,
  BasePathType.GIT_WORK_DIR,
);
```

---

## 📝 需要执行的优化步骤

### 步骤 1: 更新 ProjectService.ts

**文件**：`/Users/gangqiang/Desktop/front-intern/backend/src/services/ProjectService.ts`

**修改内容**：

1. 更新导入语句：

   ```typescript
   import { convertToStoredPath, resolveStoredPath } from "../utils/PathUtils";
   ```

2. 更新 `convertToRelative` 方法：

   ```typescript
   public convertToStoredPath(absPath: string | null): string | null {
     return convertToStoredPath(absPath);
   }
   ```

3. 更新 `createProject` 方法中的路径处理：

   ```typescript
   const storedRepoDir =
     this.convertToStoredPath(workDirectory) || workDirectory;
   const storedWorkDir =
     this.convertToStoredPath(workDirectory) || workDirectory;
   ```

4. 更新 `resolveProjectPaths` 方法：
   ```typescript
   private resolveProjectPaths(project: Project): Project {
     return {
       ...project,
       repoDir: resolveStoredPath(project.repoDir),
       workDirectory: resolveStoredPath(project.workDirectory),
     };
   }
   ```

---

### 步骤 2: 更新 RepositoryService.ts

**文件**：`/Users/gangqiang/Desktop/front-intern/backend/src/services/RepositoryService.ts`

**修改内容**：

1. 更新导入语句：

   ```typescript
   import { resolveStoredPath, BasePathType } from "../utils/PathUtils";
   ```

2. 替换所有 `resolveProjectRelativePath` 为 `resolveStoredPath`

---

### 步骤 3: 创建 projects 表迁移脚本

**文件**：`/Users/gangqiang/Desktop/front-intern/backend/scripts/migrate-projects-to-variable-paths.ts`

**功能**：

- 将 `projects.repoDir` 从纯相对路径转换为 `${GIT_WORK_DIR}/path`
- 将 `projects.workDirectory` 从纯相对路径转换为 `${GIT_WORK_DIR}/path`

---

### 步骤 4: 执行所有迁移脚本

```bash
# 1. 迁移 conversation_contexts 和 neovate_sessions
tsx scripts/migrate-to-variable-paths.ts

# 2. 迁移 projects 表
tsx scripts/migrate-projects-to-variable-paths.ts
```

---

## 🎯 优化后的效果

### 优化前（当前状态）

**数据库存储**：

```sql
-- conversation_contexts
workDir: "user-abc/project"  -- ❌ 纯相对路径，不知道基础目录

-- projects
repoDir: "front-workspace/my-project"  -- ❌ 纯相对路径
workDirectory: "front-workspace/my-project"  -- ❌ 纯相对路径
```

**问题**：

- 不知道基础目录是 `LOCAL_GIT_WORK_DIR` 还是 `WORKTREE_BASE_DIR`
- 需要通过路径特征猜测（如包含 `user-` 就是 worktree）
- 环境切换时需要迁移数据

---

### 优化后（目标状态）

**数据库存储**：

```sql
-- conversation_contexts
workDir: "${WORKTREE_BASE_DIR}/user-abc/project"  -- ✅ 明确指定基础目录

-- projects
repoDir: "${GIT_WORK_DIR}/front-workspace/my-project"  -- ✅ 明确指定基础目录
workDirectory: "${GIT_WORK_DIR}/front-workspace/my-project"  -- ✅ 明确指定基础目录
```

**优势**：

- ✅ 明确指定基础目录类型
- ✅ 环境无关，无需迁移数据
- ✅ 易于维护和调试
- ✅ 可读性强

---

## 📊 总结

### ✅ 已完成优化

1. **PathUtils.ts** - 新增变量占位符支持
2. **DrizzleConversationStorage.ts** - 使用新的路径处理函数
3. **conversation_contexts 表** - 准备迁移到变量格式
4. **neovate_sessions 表** - 准备迁移到变量格式

### ⚠️ 待优化项目

1. **ProjectService.ts** - 需要更新为使用 `convertToStoredPath`
2. **RepositoryService.ts** - 需要更新为使用 `resolveStoredPath`
3. **projects 表** - 需要迁移到变量占位符格式
4. **message_metadata 表** - 需要检查 JSONB 字段

### 🚀 下一步行动

1. ⏳ 更新 `ProjectService.ts`
2. ⏳ 更新 `RepositoryService.ts`
3. ⏳ 创建 `migrate-projects-to-variable-paths.ts`
4. ⏳ 执行所有迁移脚本
5. ⏳ 测试验证

---

**生成时间**: 2026-01-29 16:02  
**版本**: 1.0
