# Worktree 架构优化迁移指南

## 概述

本文档说明如何从旧的"共享 worktree + 分支切换"架构迁移到新的"每对话独立 worktree"架构。

---

## 架构变更总结

### 旧架构

- 每个用户在每个项目下有一个共享的 worktree
- 多个对话通过切换分支来隔离
- 需要 stash 和分支切换逻辑

### 新架构

- 每个对话有独立的 worktree
- 无需分支切换
- 完全隔离，逻辑简化

---

## 代码变更清单

### 1. WorktreeManager.ts

#### 接口变更

**WorktreeInfo 接口**

旧版本:

```typescript
export interface WorktreeInfo {
  userId: string;
  projectId?: string;
  worktreePath: string;
  mainBranch: string;
  createdAt: Date;
  lastUsedAt: Date;
}
```

新版本:

```typescript
export interface WorktreeInfo {
  userId: string;
  sessionId: string; // 对话ID
  worktreePath: string;
  branchName: string; // 对话分支名
  createdAt: Date;
  lastUsedAt: Date;
}
```

#### 方法变更

**新增方法**:

- `createConversationWorktree(userId, sessionId, baseBranch)` - 核心方法
- `conversationWorktreeExists(userId, sessionId)` - 检查对话 worktree
- `getConversationWorktreePath(userId, sessionId)` - 获取路径
- `removeConversationWorktree(userId, sessionId)` - 删除对话 worktree
- `listUserWorktrees(userId)` - 列出用户所有 worktree
- `cleanupUserWorktrees(userId)` - 清理用户 worktree

**移除方法**:

- `createWorktree(userId, baseBranch, projectId)` - 被 `createConversationWorktree` 替代
- `getOrCreateWorktree(userId, projectIdOrBaseBranch, baseBranch)` - 不再需要
- `createConversationBranch(userId, sessionId, baseBranch, projectId)` - 合并到 `createConversationWorktree`
- `resetToMainBranch(userId, projectId)` - 不再需要
- `createBranchFromHead(userId, branchName, projectId)` - 不再需要
- `getUserWorktreePath(userId, projectId)` - 被 `getConversationWorktreePath` 替代
- `worktreeExists(userId, projectId)` - 被 `conversationWorktreeExists` 替代

**修改方法**:

- `getWorktreeInfo(userId, sessionId)` - 参数从 `projectId` 改为 `sessionId`
- `syncWithMainRepo(userId, sessionId, mainBranch)` - 参数从 `projectId` 改为 `sessionId`
- `commitChanges(userId, sessionId, message)` - 参数从 `projectId` 改为 `sessionId`
- `pushBranch(userId, sessionId)` - 参数从 `branchName, projectId` 改为 `sessionId`

### 2. ConversationManager.ts

#### handleEditModeSetup() 方法

旧版本:

```typescript
private async handleEditModeSetup(
  sessionId: string,
  _taskDescription: string,
  userId: string,
  defaultBranch: string = "master"
): Promise<{...}> {
  // 1. 创建 WorktreeManager
  const projectWorktreeManager = new WorktreeManager(...);

  // 2. 同步主仓库代码
  const syncResult = await projectWorktreeManager.syncWithMainRepo(userId, projectId);

  // 3. 处理冲突（如有）
  if (!syncResult.success && syncResult.conflicts) {
    const resetResult = await projectWorktreeManager.resetToMainBranch(userId, projectId);
  }

  // 4. 创建对话分支
  const result = await projectWorktreeManager.createConversationBranch(
    userId, sessionId, baseBranch, projectId
  );

  return {
    success: true,
    branchName: result.branchName,
    worktreePath: result.worktreePath,
  };
}
```

新版本:

```typescript
private async handleEditModeSetup(
  sessionId: string,
  _taskDescription: string,
  userId: string,
  defaultBranch: string = "master"
): Promise<{...}> {
  // 1. 创建 WorktreeManager
  const projectWorktreeManager = new WorktreeManager(...);

  // 2. 直接创建对话 worktree（一步完成）
  const worktreeInfo = await projectWorktreeManager.createConversationWorktree(
    userId,
    sessionId,
    baseBranch
  );

  return {
    success: true,
    branchName: worktreeInfo.branchName,
    worktreePath: worktreeInfo.worktreePath,
  };
}
```

#### createMergeRequest() 方法

旧版本:

```typescript
// 1. 获取 worktree 信息
const worktreeInfo = await projectWorktreeManager.getOrCreateWorktree(
  userId,
  projectId,
);
const actualBranch = worktreeInfo.mainBranch;

// 2. 提交和推送
await projectWorktreeManager.commitChanges(userId, message, projectId);
await projectWorktreeManager.pushBranch(userId, branchName, projectId);
```

新版本:

```typescript
// 1. 获取 worktree 信息
const worktreeInfo = await projectWorktreeManager.getWorktreeInfo(
  userId,
  sessionId,
);
const actualBranch = worktreeInfo.branchName;

// 2. 提交和推送
await projectWorktreeManager.commitChanges(userId, sessionId, message);
await projectWorktreeManager.pushBranch(userId, sessionId);
```

---

## 迁移步骤

### 步骤 1: 备份数据

```bash
# 备份数据库
cp backend/data/conversations.db backend/data/conversations.db.backup

# 备份 worktree 目录
cp -r /path/to/worktrees /path/to/worktrees.backup
```

### 步骤 2: 更新代码

1. 替换 `WorktreeManager.ts` 为新版本
2. 更新 `ConversationManager.ts` 中的相关方法
3. 检查其他使用 `WorktreeManager` 的地方

### 步骤 3: 测试新架构

```bash
# 启动后端
cd backend
npm run dev

# 创建测试对话
curl -X POST http://localhost:3001/api/conversations \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project-id",
    "mode": "EDIT",
    "initialPrompt": "测试新架构"
  }'

# 检查 worktree 是否创建成功
ls -la /path/to/worktrees/user-{userId}/
```

### 步骤 4: 清理旧 Worktree（可选）

```bash
# 列出所有旧的 worktree
git worktree list

# 删除旧的 worktree（谨慎操作）
git worktree remove /path/to/old/worktree --force
```

---

## 兼容性说明

### 数据库兼容性

- ✅ **完全兼容**: 数据库结构无需修改
- ✅ **自动适配**: `worktree_path` 字段会自动存储新路径
- ✅ **向后兼容**: 旧对话可以继续使用旧路径

### 旧对话处理

**选项 1: 保持不变**

- 旧对话继续使用旧的 worktree 路径
- 新对话使用新的架构
- 逐步过渡

**选项 2: 迁移到新架构**

- 为每个旧对话创建新的 worktree
- 复制代码到新 worktree
- 更新数据库中的路径

**选项 3: 清理旧对话**

- 删除不活跃的旧对话
- 只保留活跃对话
- 活跃对话手动迁移

---

## 测试清单

### 功能测试

- [ ] 创建新对话（编辑模式）
- [ ] 创建新对话（只读模式）
- [ ] AI 修改代码
- [ ] 提交和推送代码
- [ ] 创建 Merge Request
- [ ] 删除对话
- [ ] 多个对话并发编辑

### 路径测试

- [ ] 验证 worktree 路径格式正确
- [ ] 验证分支名格式正确
- [ ] 验证数据库中的路径正确

### 清理测试

- [ ] 删除对话 worktree
- [ ] 清理用户所有 worktree
- [ ] 验证 Git 分支也被删除

---

## 回滚方案

如果新架构出现问题，可以回滚到旧版本：

### 步骤 1: 恢复代码

```bash
git checkout <old-commit-hash>
```

### 步骤 2: 恢复数据库

```bash
cp backend/data/conversations.db.backup backend/data/conversations.db
```

### 步骤 3: 恢复 worktree

```bash
rm -rf /path/to/worktrees
cp -r /path/to/worktrees.backup /path/to/worktrees
```

### 步骤 4: 重启服务

```bash
cd backend
npm run dev
```

---

## 常见问题

### Q1: 旧对话还能正常工作吗？

**A**: 可以，但建议逐步迁移到新架构。旧对话会继续使用旧的 worktree 路径。

### Q2: 如何迁移单个旧对话？

**A**:

1. 获取对话的 sessionId 和 userId
2. 调用 `createConversationWorktree()` 创建新 worktree
3. 复制旧 worktree 的代码到新 worktree
4. 更新数据库中的 `worktree_path` 和 `git_branch`

### Q3: 新架构会占用更多磁盘空间吗？

**A**: 是的，但 Git worktree 使用硬链接，实际占用空间较小。可以定期清理不活跃的对话。

### Q4: 如何批量清理旧 worktree？

**A**:

```typescript
// 清理用户的所有 worktree
await worktreeManager.cleanupUserWorktrees(userId);

// 或手动删除
git worktree list
git worktree remove <path> --force
```

---

## 性能影响

### 优势

- ✅ 无需分支切换，速度更快
- ✅ 无需 stash，逻辑更简单
- ✅ 支持并发，性能更好

### 劣势

- ❌ 磁盘空间占用增加
- ❌ 创建 worktree 需要时间（首次）

### 优化建议

- 定期清理不活跃的对话 worktree
- 使用 SSD 存储 worktree
- 限制每个用户的最大对话数

---

## 总结

新架构简化了逻辑，提高了并发性能，但会占用更多磁盘空间。建议：

1. **新对话**: 直接使用新架构
2. **旧对话**: 保持不变，逐步迁移
3. **清理策略**: 定期清理不活跃的对话
4. **监控**: 监控磁盘空间使用情况

迁移过程平滑，无需停机，可以逐步过渡。
