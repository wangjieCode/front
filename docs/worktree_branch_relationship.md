# Worktree 和分支关系梳理（优化版）

## 概述

**优化后的架构**：为每个对话创建独立的 Git worktree，去掉分支层级，实现完全隔离的对话环境。

---

## 🎯 架构对比

### 旧架构（已废弃）

```
/worktrees/
  └── project-{projectId}/
      └── user-{userId}/           # 一个用户一个 worktree
          ├── conversation-xxx     # 分支1
          └── conversation-yyy     # 分支2（需要切换）
```

**问题**：

- ❌ 需要频繁切换分支
- ❌ 需要 stash 未提交的变更
- ❌ 多个对话共享一个工作目录，容易冲突
- ❌ 逻辑复杂，维护成本高

### 新架构（当前）

```
/worktrees/
  └── user-{userId}/
      ├── conversation-{sessionId1}/   # 对话1的独立 worktree
      ├── conversation-{sessionId2}/   # 对话2的独立 worktree
      └── conversation-{sessionId3}/   # 对话3的独立 worktree
```

**优势**：

- ✅ **完全隔离**：每个对话有独立的工作目录，互不干扰
- ✅ **无需切换**：不需要 git checkout 和 stash
- ✅ **并发友好**：可以同时在多个对话中工作
- ✅ **简化逻辑**：去掉分支切换、stash 等复杂逻辑
- ✅ **易于清理**：删除对话时直接删除对应的 worktree 目录

---

## 核心概念

### 1. 对话 Worktree（Conversation Worktree）

**定义**: 每个对话拥有独立的 Git worktree，包含完整的项目代码副本。

**路径格式**:

```
/path/to/worktrees/user-{userId}/conversation-{sessionId}/
```

**示例**:

```
/home/projects/worktrees/
  └── user-alice/
      ├── conversation-b8f34476-c9f8-49b1-bb02-369ec134c54e/
      │   ├── src/
      │   ├── package.json
      │   └── ...
      └── conversation-fb7de46d-cfd8-4a77-ae5b-be3511a01bae/
          ├── src/
          ├── package.json
          └── ...
```

### 2. 对话分支（Conversation Branch）

**定义**: 每个对话 worktree 创建时自动生成的独立分支。

**命名规则**: `conversation-{sessionId前8位}-{时间戳}`

**示例**: `conversation-b8f34476-1737446890123`

**特点**:

- 每个 worktree 只有一个分支
- 分支与 worktree 一一对应
- 无需切换分支

---

## 创建流程详解

### 阶段 1: 用户创建对话

**触发点**: 用户在前端选择项目并输入初始提示词

```typescript
// frontend/src/App.tsx
const response = await conversationService.createConversation({
  projectId: selectedProject.id,
  mode: ConversationMode.EDIT,
  initialPrompt: userInput,
});
```

### 阶段 2: ConversationManager 创建会话

**文件**: `backend/src/services/ConversationManager.ts`

**关键方法**: `createSession()`

**流程**:

1. **验证项目信息**
2. **生成会话 ID**
   ```typescript
   const sessionId = uuidv4();
   ```
3. **初始化上下文**
4. **根据模式处理 Git 操作**

   **编辑模式 (EDIT)**:

   ```typescript
   if (mode === ConversationMode.EDIT) {
     const gitResult = await this.handleEditModeSetup(
       sessionId,
       initialPrompt,
       userId,
       completeProjectInfo.gitBranch,
     );

     context.gitBranch = gitResult.branchName;
     context.projectInfo.workDir = gitResult.worktreePath;
   }
   ```

5. **保存会话到数据库**

### 阶段 3: 编辑模式的 Git 设置

**文件**: `backend/src/services/ConversationManager.ts`

**关键方法**: `handleEditModeSetup()`

**流程**:

1. **创建项目专属的 WorktreeManager**

   ```typescript
   const projectWorktreeManager = new WorktreeManager(
     executor,
     project.workDirectory,
     `${project.workDirectory}/../worktrees`,
   );
   ```

2. **直接创建对话 worktree 和分支**

   ```typescript
   const worktreeInfo = await projectWorktreeManager.createConversationWorktree(
     userId,
     sessionId,
     project.gitBranch || "master",
   );
   ```

3. **返回分支和路径信息**
   ```typescript
   return {
     success: true,
     branchName: worktreeInfo.branchName, // conversation-xxx-xxx
     worktreePath: worktreeInfo.worktreePath, // /worktrees/user-xxx/conversation-xxx
   };
   ```

### 阶段 4: WorktreeManager 创建对话 Worktree

**文件**: `backend/src/services/WorktreeManager.ts`

**核心方法**: `createConversationWorktree()`

**流程**:

1. **确定 worktree 路径**

   ```typescript
   const worktreePath = this.getConversationWorktreePath(userId, sessionId);
   // 结果: /worktrees/user-{userId}/conversation-{sessionId}
   ```

2. **检查是否已存在**

   ```typescript
   if (await this.conversationWorktreeExists(userId, sessionId)) {
     return this.getWorktreeInfo(userId, sessionId);
   }
   ```

3. **验证基础分支**

   ```typescript
   let targetBranch = await this.validateAndGetBaseBranch(baseBranch);
   ```

4. **生成对话分支名**

   ```typescript
   const shortSessionId = sessionId.substring(0, 8);
   const timestamp = Date.now();
   const branchName = `conversation-${shortSessionId}-${timestamp}`;
   ```

5. **创建分支**

   ```typescript
   await this.executor.executeCommand(
     `git branch ${branchName} ${targetBranch}`,
     this.baseRepoPath,
   );
   ```

6. **使用分支创建 worktree**

   ```typescript
   await this.executor.executeCommand(
     `git worktree add "${worktreePath}" ${branchName}`,
     this.baseRepoPath,
   );
   ```

7. **缓存 worktree 信息**
   ```typescript
   const worktreeInfo: WorktreeInfo = {
     userId,
     sessionId,
     worktreePath,
     branchName,
     createdAt: now,
     lastUsedAt: now,
   };
   this.worktreeCache.set(cacheKey, worktreeInfo);
   ```

---

## 关键关系图

### 一个用户多个对话的情况

```
用户 Alice (userId: alice)
  └── Worktree 目录: /worktrees/user-alice/
      ├── conversation-b8f34476-c9f8-49b1-bb02-369ec134c54e/
      │   └── 分支: conversation-b8f34476-1737446890123
      ├── conversation-fb7de46d-cfd8-4a77-ae5b-be3511a01bae/
      │   └── 分支: conversation-fb7de46d-1737446900456
      └── conversation-2cc2946f-dd1b-444c-9e13-0aed5da17db1/
          └── 分支: conversation-2cc2946f-1737446910789
```

**关键特点**:

- 每个对话有独立的 worktree 目录
- 每个 worktree 有独立的分支
- 对话之间完全隔离，互不影响

### 多用户多项目的情况

```
Worktree 基础目录
  ├── user-alice/
  │   ├── conversation-xxx-xxx/  # Alice 的对话1
  │   └── conversation-yyy-yyy/  # Alice 的对话2
  ├── user-bob/
  │   ├── conversation-zzz-zzz/  # Bob 的对话1
  │   └── conversation-www-www/  # Bob 的对话2
  └── user-charlie/
      └── conversation-aaa-aaa/  # Charlie 的对话1
```

**注意**:

- 不再按项目分组，所有对话都在用户目录下
- 简化了目录结构
- 更容易管理和清理

---

## 数据库存储

### conversations 表

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### conversation_contexts 表

```sql
CREATE TABLE conversation_contexts (
  conversation_id TEXT PRIMARY KEY,
  git_branch TEXT,              -- conversation-{sid}-{ts}
  worktree_path TEXT,            -- /worktrees/user-{uid}/conversation-{sid}
  mr_url TEXT,
  mode TEXT,
  -- ... 其他字段
);
```

**关键字段**:

- `git_branch`: 对话分支名称
- `worktree_path`: 对话 worktree 路径（每个对话独立）
- `mode`: 对话模式（EDIT 或 READONLY）

---

## 工作流程示例

### 场景: 用户 Alice 创建一个编辑模式的对话

1. **前端操作**
   - Alice 选择项目 "dtmall-admin"
   - 输入提示词 "添加用户管理功能"
   - 点击创建对话

2. **后端处理**
   - 生成 sessionId: `b8f34476-c9f8-49b1-bb02-369ec134c54e`
   - 获取项目信息:
     - projectId: `proj-123`
     - workDirectory: `/home/projects/dtmall-admin`

3. **Worktree 创建**
   - 确定 worktree 路径: `/home/projects/worktrees/user-alice/conversation-b8f34476-c9f8-49b1-bb02-369ec134c54e`
   - 生成分支名: `conversation-b8f34476-1737446890123`
   - 在主仓库创建分支:
     ```bash
     cd /home/projects/dtmall-admin
     git branch conversation-b8f34476-1737446890123 master
     ```
   - 创建 worktree:
     ```bash
     git worktree add "/home/projects/worktrees/user-alice/conversation-b8f34476-c9f8-49b1-bb02-369ec134c54e" conversation-b8f34476-1737446890123
     ```

4. **保存到数据库**
   - conversations 表:
     ```json
     {
       "id": "b8f34476-c9f8-49b1-bb02-369ec134c54e",
       "user_id": "alice",
       "status": "PLANNING"
     }
     ```
   - conversation_contexts 表:
     ```json
     {
       "conversation_id": "b8f34476-c9f8-49b1-bb02-369ec134c54e",
       "git_branch": "conversation-b8f34476-1737446890123",
       "worktree_path": "/home/projects/worktrees/user-alice/conversation-b8f34476-c9f8-49b1-bb02-369ec134c54e",
       "mode": "EDIT"
     }
     ```

5. **AI 执行代码修改**
   - Neovate 在对话 worktree 路径下执行:
     ```bash
     neovate -q \
       --cwd "/home/projects/worktrees/user-alice/conversation-b8f34476-c9f8-49b1-bb02-369ec134c54e" \
       --output-format stream-json \
       --approval-mode yolo \
       "添加用户管理功能"
     ```

6. **自动提交和推送**
   ```bash
   cd /home/projects/worktrees/user-alice/conversation-b8f34476-c9f8-49b1-bb02-369ec134c54e
   git add .
   git commit -m "AI: 添加用户管理功能"
   git push --set-upstream origin conversation-b8f34476-1737446890123
   ```

---

## API 变更

### WorktreeManager 新 API

#### 核心方法

1. **createConversationWorktree()**

   ```typescript
   async createConversationWorktree(
     userId: string,
     sessionId: string,
     baseBranch: string = 'master'
   ): Promise<WorktreeInfo>
   ```

   - **作用**: 为对话创建独立的 worktree 和分支
   - **替代**: 旧的 `createWorktree()` + `createConversationBranch()`

2. **getWorktreeInfo()**

   ```typescript
   async getWorktreeInfo(
     userId: string,
     sessionId: string
   ): Promise<WorktreeInfo>
   ```

   - **作用**: 获取对话 worktree 信息
   - **参数变更**: 使用 `sessionId` 代替 `projectId`

3. **commitChanges()**

   ```typescript
   async commitChanges(
     userId: string,
     sessionId: string,
     message: string
   ): Promise<void>
   ```

   - **作用**: 提交对话 worktree 的变更
   - **参数变更**: 使用 `sessionId` 定位 worktree

4. **pushBranch()**

   ```typescript
   async pushBranch(
     userId: string,
     sessionId: string
   ): Promise<void>
   ```

   - **作用**: 推送对话分支
   - **参数变更**: 使用 `sessionId` 定位 worktree 和分支

5. **removeConversationWorktree()**
   ```typescript
   async removeConversationWorktree(
     userId: string,
     sessionId: string
   ): Promise<void>
   ```

   - **作用**: 删除对话 worktree
   - **新增**: 用于清理对话资源

#### 已移除的方法

- ❌ `createWorktree()` - 被 `createConversationWorktree()` 替代
- ❌ `getOrCreateWorktree()` - 不再需要
- ❌ `createConversationBranch()` - 合并到 `createConversationWorktree()`
- ❌ `resetToMainBranch()` - 不再需要（每个对话独立）
- ❌ `createBranchFromHead()` - 不再需要

---

## 常见问题

### Q1: 如果用户同时有多个对话，会发生什么？

**A**:

- 每个对话有独立的 worktree 目录
- 可以同时在多个对话中工作，互不干扰
- 无需切换分支或 stash 变更

### Q2: 如果两个用户编辑同一个项目，会冲突吗？

**A**:

- 不会，每个用户有独立的目录
- 用户 A: `/worktrees/user-alice/conversation-xxx/`
- 用户 B: `/worktrees/user-bob/conversation-yyy/`
- 完全隔离，互不干扰

### Q3: Worktree 什么时候被删除？

**A**:

- 当前实现中，worktree 不会自动删除
- 可以通过 `removeConversationWorktree()` 手动删除
- 可以通过 `cleanupUserWorktrees()` 批量清理用户的所有 worktree

### Q4: 新架构会占用更多磁盘空间吗？

**A**:

- 是的，每个对话都有完整的代码副本
- 但 Git worktree 使用硬链接，实际占用空间较小
- 只有修改的文件才会真正占用额外空间
- 可以定期清理不活跃的对话 worktree

### Q5: 如何从旧架构迁移到新架构？

**A**:

- 旧的对话会继续使用旧的 worktree 路径
- 新创建的对话会使用新的架构
- 可以逐步清理旧的 worktree
- 数据库中的 `worktree_path` 字段会自动适配

---

## 性能优化

### 1. 缓存机制

```typescript
private worktreeCache: Map<string, WorktreeInfo> = new Map();
```

- 缓存 worktree 信息，避免重复查询
- 使用 `${userId}-${sessionId}` 作为缓存键

### 2. 延迟创建

- 只在编辑模式下创建 worktree
- 只读模式直接使用主仓库目录

### 3. 并发控制

- 每个对话独立，天然支持并发
- 无需锁机制

---

## 总结

**新架构的核心优势**:

- ✅ **简化逻辑**: 去掉分支切换、stash 等复杂操作
- ✅ **完全隔离**: 每个对话独立，互不干扰
- ✅ **并发友好**: 支持同时编辑多个对话
- ✅ **易于维护**: 代码更清晰，bug 更少

**适用场景**:

- ✅ 多对话并发编辑
- ✅ 长期对话（无需频繁切换）
- ✅ 团队协作（每个成员独立工作）

**注意事项**:

- ⚠️ 磁盘空间占用会增加
- ⚠️ 需要定期清理不活跃的 worktree
- ⚠️ 确保 Git 版本支持 worktree（Git 2.5+）
