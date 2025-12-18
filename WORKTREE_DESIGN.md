# Git Worktree 多用户隔离设计方案

## 概述

本方案通过 Git worktree 实现多用户代码隔离，每个用户拥有独立的工作目录，避免代码冲突。

## 核心设计

### 1. 目录结构

```
/path/to/project/
├── .git/                      # 主仓库
├── src/                       # 主仓库代码
├── ...
└── worktrees/                 # worktree 基础目录
    ├── user-{userId1}/        # 用户1的 worktree
    │   ├── .git               # worktree git 配置
    │   └── src/               # 用户1的代码副本
    ├── user-{userId2}/        # 用户2的 worktree
    │   ├── .git
    │   └── src/
    └── ...
```

### 2. 用户隔离策略

- **每个用户一个 worktree**：基于用户 ID 创建独立的 worktree 目录
- **编辑模式**：在用户 worktree 中创建对话分支，允许代码修改
- **只读模式**：使用用户 worktree 的主分支，只读不修改

### 3. 对话与分支映射

```
用户A (userId: user-123)
  └── worktree: /path/to/worktrees/user-user-123/
      ├── 主分支: master (只读模式使用)
      ├── 对话1分支: conversation-abc12345-1234567890 (编辑模式)
      └── 对话2分支: conversation-def67890-1234567891 (编辑模式)

用户B (userId: user-456)
  └── worktree: /path/to/worktrees/user-user-456/
      ├── 主分支: master (只读模式使用)
      └── 对话3分支: conversation-ghi11111-1234567892 (编辑模式)
```

## 实现细节

### 1. WorktreeManager 服务

**职责**：
- 管理用户 worktree 的创建、删除
- 在用户 worktree 中创建对话分支
- 切换用户 worktree 到主分支（只读模式）

**核心方法**：
```typescript
class WorktreeManager {
  // 获取或创建用户 worktree
  async getOrCreateWorktree(userId: string): Promise<WorktreeInfo>
  
  // 在用户 worktree 中创建对话分支
  async createConversationBranch(userId: string, sessionId: string): Promise<{ branchName, worktreePath }>
  
  // 切换用户 worktree 到主分支
  async switchToMainBranch(userId: string): Promise<void>
  
  // 删除用户 worktree
  async removeWorktree(userId: string): Promise<void>
}
```

### 2. ConversationManager 集成

**编辑模式流程**：
1. 用户创建对话，选择编辑模式
2. `ConversationManager.createSession()` 调用 `WorktreeManager.createConversationBranch()`
3. 在用户 worktree 中创建对话分支：`conversation-{sessionId}-{timestamp}`
4. 推送分支到远程
5. 保存 worktree 路径和分支名到 `context`
6. AI 在该分支上进行代码修改
7. 用户手动触发创建 MR

**只读模式流程**：
1. 用户创建对话，选择只读模式
2. `ConversationManager.createSession()` 调用 `WorktreeManager.switchToMainBranch()`
3. 确保用户 worktree 在主分支，丢弃所有变更
4. 保存 worktree 路径到 `context`
5. AI 只能查询代码，不能修改

### 3. 数据库 Schema 变更

**users 表**：
```sql
ALTER TABLE users ADD COLUMN worktree_path TEXT;
```

**conversation_contexts 表**：
```sql
ALTER TABLE conversation_contexts ADD COLUMN worktree_path TEXT;
```

### 4. 环境变量配置

```bash
# .env
WORKTREE_BASE_DIR=/path/to/worktrees  # worktree 基础目录，默认为 {GIT_WORK_DIR}/../worktrees
```

## 优势

1. **完全隔离**：每个用户在独立的 worktree 中工作，互不影响
2. **高效切换**：Git worktree 共享 .git 目录，节省磁盘空间
3. **分支管理**：每个对话对应一个分支，便于追踪和管理
4. **并发安全**：多个用户可以同时创建对话，不会冲突

## 注意事项

1. **磁盘空间**：每个 worktree 占用一份代码副本的空间
2. **清理策略**：需要定期清理不活跃用户的 worktree
3. **权限管理**：确保服务进程有权限创建和删除 worktree 目录
4. **分支命名**：使用 `conversation-{sessionId}-{timestamp}` 格式，避免冲突

## 使用示例

### 创建对话（编辑模式）

```typescript
// 前端
const response = await conversationService.createConversation({
  taskId: 'task-123',
  initialPrompt: '修改首页标题',
  projectInfo: { workDir: '/path/to/project' },
  mode: 'edit'
});

// 后端会：
// 1. 获取或创建用户 worktree: /path/to/worktrees/user-{userId}/
// 2. 在 worktree 中创建分支: conversation-abc12345-1234567890
// 3. 保存 worktreePath 到 context
// 4. AI 在该分支上修改代码
```

### 创建对话（只读模式）

```typescript
// 前端
const response = await conversationService.createConversation({
  taskId: 'task-456',
  initialPrompt: '查看登录逻辑',
  projectInfo: { workDir: '/path/to/project' },
  mode: 'readonly'
});

// 后端会：
// 1. 获取或创建用户 worktree: /path/to/worktrees/user-{userId}/
// 2. 切换到主分支，丢弃所有变更
// 3. 保存 worktreePath 到 context
// 4. AI 只能查询代码，不能修改
```

## 迁移步骤

1. ✅ 创建 `WorktreeManager` 服务
2. ✅ 修改数据库 schema 添加 `worktreePath` 字段
3. ✅ 修改 `ConversationManager` 集成 worktree 逻辑
4. ⏳ 生成数据库迁移文件
5. ⏳ 更新前端传递用户信息
6. ⏳ 测试多用户并发场景

## 后续优化

1. **自动清理**：定期清理超过 N 天未使用的 worktree
2. **资源限制**：限制每个用户最多创建 M 个对话分支
3. **监控告警**：监控 worktree 磁盘占用，超过阈值告警
