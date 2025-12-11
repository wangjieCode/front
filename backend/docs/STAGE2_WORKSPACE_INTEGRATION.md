# 第二阶段实现总结 - 工作空间隔离

## 已完成的功能

### 1. 工作空间管理服务 (WorkspaceManagementService)
**文件路径**: `/data/workspace/front/backend/src/services/WorkspaceManagementService.ts`

**核心功能**:
- `getOrCreateWorkspace(userId, projectId)` - 获取或创建用户工作空间
- `createWorkspace(userId, projectId)` - 创建新的 Git worktree 工作空间
- `cleanupWorkspace(workspaceId, userId)` - 清理用户工作空间
- `cleanupExpiredWorkspaces(daysThreshold)` - 清理过期工作空间（定时任务）
- `getUserWorkspaces(userId, projectId?)` - 获取用户工作空间列表

**实现细节**:
- 使用 Git worktree 为每个用户创建独立的工作目录
- 工作空间路径：`{baseWorkDir}/worktrees/{userId}`
- 临时分支命名：`worktree/{userId}/{timestamp}`
- 自动清理超过 7 天未使用的工作空间（可配置）

### 2. 工作空间管理 API 路由
**文件路径**: `/data/workspace/front/backend/src/api/workspaceRoutes.ts`

**API 端点**:
- `GET /api/workspaces` - 查询用户工作空间列表
- `POST /api/workspaces` - 获取或创建用户工作空间
- `DELETE /api/workspaces/:workspaceId` - 清理工作空间
- `POST /api/workspaces/cleanup-expired` - 手动触发清理过期工作空间

**安全控制**:
- 所有接口都需要 JWT 认证
- 用户只能访问和管理自己的工作空间

### 3. 定时任务服务 (ScheduledTasksService)
**文件路径**: `/data/workspace/front/backend/src/services/ScheduledTasksService.ts`

**定时任务**:
- 工作空间清理任务：默认每天凌晨 2 点执行
- 支持通过环境变量配置 Cron 表达式和清理阈值

**环境变量**:
```bash
WORKSPACE_CLEANUP_CRON=0 2 * * *  # Cron 表达式
WORKSPACE_CLEANUP_DAYS=7          # 过期天数
```

### 4. 主入口集成
**文件路径**: `/data/workspace/front/backend/src/index.ts`

**集成内容**:
- 初始化工作空间管理服务
- 初始化定时任务服务并启动
- 注册工作空间管理 API 路由
- 优雅关闭时停止定时任务并关闭服务

## 数据库 Schema

工作空间表 (user_workspaces) 已在第一阶段创建：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 用户 ID |
| project_id | UUID | 项目 ID |
| worktree_path | VARCHAR(500) | Git worktree 路径 |
| worktree_branch | VARCHAR(100) | Worktree 关联分支 |
| status | VARCHAR(20) | 状态 (active/cleanup) |
| last_used_at | TIMESTAMP | 最后使用时间 |
| created_at | TIMESTAMP | 创建时间 |

## 待集成功能

### ConversationManager 工作空间集成

为了让对话系统使用独立的用户工作空间，需要对 `ConversationManager` 进行以下扩展：

#### 1. 修改 createSession 方法

**当前实现**:
```typescript
async createSession(
  taskId: string,
  initialPrompt: string,
  projectInfo: ProjectInfo,
  mode: ConversationMode = ConversationMode.EDIT
): Promise<ConversationSession>
```

**需要扩展为**:
```typescript
async createSession(
  taskId: string,
  initialPrompt: string,
  projectInfo: ProjectInfo,
  mode: ConversationMode = ConversationMode.EDIT,
  userId?: string,      // 新增：用户 ID
  projectId?: string    // 新增：项目 ID
): Promise<ConversationSession>
```

#### 2. 集成工作空间服务

在 `ConversationManager` 构造函数中注入 `WorkspaceManagementService`：

```typescript
constructor(
  storage: IConversationStorage,
  gitService?: GitService,
  gitlabService?: GitLabMCPService,
  workspaceService?: WorkspaceManagementService  // 新增
) {
  this.storage = storage;
  this.modeValidator = new ModeValidator();
  this.gitService = gitService;
  this.gitlabService = gitlabService;
  this.workspaceService = workspaceService;  // 新增
}
```

#### 3. 在创建会话时获取用户工作空间

```typescript
// 在 createSession 方法中添加
if (userId && projectId && this.workspaceService) {
  // 获取或创建用户工作空间
  const workspace = await this.workspaceService.getOrCreateWorkspace(userId, projectId);
  
  // 使用工作空间路径初始化 GitService
  const workspaceGitService = new GitService(this.executor, workspace.worktreePath);
  
  // 保存工作空间信息到 context
  context.workspaceId = workspace.id;
  
  // 在工作空间中执行 Git 操作
  if (mode === ConversationMode.EDIT) {
    const gitResult = await this.handleEditModeSetup(
      sessionId, 
      initialPrompt, 
      workspaceGitService  // 使用工作空间的 GitService
    );
    // ...
  }
}
```

#### 4. 保存工作空间关联到数据库

在创建会话时，保存 `userId`、`projectId` 和 `workspaceId` 到 `conversations` 表（字段已在第一阶段添加）。

### API 路由扩展

#### conversationRoutes.ts

需要扩展 `POST /api/conversations` 接口：

**当前请求体**:
```json
{
  "taskId": "string",
  "initialPrompt": "string",
  "mode": "edit"
}
```

**扩展后请求体**:
```json
{
  "taskId": "string",
  "initialPrompt": "string",
  "mode": "edit",
  "projectId": "uuid"  // 新增：从 JWT Token 获取 userId
}
```

**处理逻辑**:
```typescript
// 从 JWT 中间件获取 userId
const userId = req.userId;
const { taskId, initialPrompt, mode, projectId } = req.body;

// 验证用户已关联该项目
await projectManagementService.checkUserProjectAccess(userId, projectId);

// 创建会话时传入 userId 和 projectId
const session = await conversationManager.createSession(
  taskId,
  initialPrompt,
  projectInfo,
  mode,
  userId,      // 新增
  projectId    // 新增
);
```

## 使用流程

### 1. 数据库迁移

```bash
cd backend
pnpm run db:generate  # 生成迁移文件
pnpm run db:push      # 执行迁移
```

### 2. 创建初始数据

```bash
# 初始化默认配置
pnpm run init:default

# 创建第一个用户
pnpm run hash-password "your-password"
# 将输出的哈希值插入数据库
```

### 3. 创建项目

使用 API 创建项目：

```bash
POST /api/projects
Authorization: Bearer {token}

{
  "name": "前端项目",
  "description": "示例前端项目",
  "gitlabUrl": "git@gitlab.com:user/repo.git",
  "gitlabToken": "your-gitlab-token",
  "gitlabProjectId": "12345",
  "baseWorkDir": "/path/to/workspace",
  "defaultBranch": "main"
}
```

### 4. 使用工作空间

```bash
# 获取或创建工作空间
POST /api/workspaces
Authorization: Bearer {token}

{
  "projectId": "project-uuid"
}

# 响应示例
{
  "success": true,
  "data": {
    "id": "workspace-uuid",
    "projectId": "project-uuid",
    "worktreePath": "/path/to/workspace/worktrees/user-uuid",
    "worktreeBranch": "worktree/user-uuid/1234567890",
    "status": "active",
    "lastUsedAt": "2025-12-11T10:00:00Z",
    "createdAt": "2025-12-11T10:00:00Z"
  }
}
```

### 5. 清理工作空间

```bash
# 手动清理特定工作空间
DELETE /api/workspaces/:workspaceId
Authorization: Bearer {token}

# 手动触发清理过期工作空间
POST /api/workspaces/cleanup-expired
Authorization: Bearer {token}

{
  "daysThreshold": 7
}
```

## 测试建议

### 单元测试

1. 测试工作空间创建和清理
2. 测试 Git worktree 操作
3. 测试定时任务执行

### 集成测试

1. 测试完整的会话创建流程（含工作空间）
2. 测试多用户并发访问不同工作空间
3. 测试工作空间清理不影响活跃会话

## 下一步工作

### 第三阶段：资源配额管理

1. 实现 `PreviewResourceService`
   - 容器配额检查
   - 容器资源分配与释放
   - 容器使用监控
   
2. 实现资源管理 API 路由
   - GET /api/resources/quota
   - PUT /api/resources/quota
   - GET /api/resources/containers

3. 扩展 `ProjectPreviewService`
   - 集成配额检查
   - 创建预览前检查配额
   - 销毁预览后释放配额

4. 添加容器同步定时任务

### 第四阶段：前端管理界面

1. 登录页面
2. 我的项目页面
3. 资源监控页面
4. 工作空间管理页面

## 已知限制

1. **Git worktree 限制**
   - 需要主仓库是 bare 仓库或完整仓库
   - 同一仓库的多个 worktree 不能在同一分支上工作

2. **清理机制**
   - 当前只基于时间清理，未考虑磁盘空间
   - 建议定期监控工作空间目录的磁盘使用

3. **并发控制**
   - 当前实现使用数据库唯一约束防止重复创建
   - 大并发场景下可能需要分布式锁

## 参考资料

- [Git Worktree 文档](https://git-scm.com/docs/git-worktree)
- [Node-cron 文档](https://github.com/node-cron/node-cron)
- [设计文档](/data/.task/design.md)
