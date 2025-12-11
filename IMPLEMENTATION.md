# 用户登录与多项目支持 - 实施说明

## 已完成的核心功能

### 后端实现

1. **数据库 Schema 设计** ✅
   - 创建 `users` 表（用户信息）
   - 创建 `projects` 表（项目配置）
   - 扩展 `conversations` 表（添加 user_id, project_id, worktree_path 字段）
   - 数据库迁移文件：`drizzle/0002_add_users_projects_tables.sql`

2. **核心服务** ✅
   - `AuthService`: JWT 登录认证服务
   - `ProjectService`: 项目管理服务
   - `ProjectConfigLoader`: 环境变量配置加载器
   - `GitWorktreeService`: Git Worktree 管理服务

3. **API 路由** ✅
   - POST `/api/auth/login` - 用户登录
   - GET `/api/auth/me` - 获取当前用户信息
   - GET `/api/projects` - 获取项目列表
   - GET `/api/projects/:projectId` - 获取项目详情

4. **中间件** ✅
   - `authMiddleware`: JWT Token 认证中间件
   - `optionalAuthMiddleware`: 可选认证中间件

5. **环境变量配置** ✅
   - 更新了 `.env.example` 文件，添加多项目配置支持

## 待完成功能

以下功能需要在后续迭代中完成：

1. **后端扩展**
   - 扩展 ConversationManager 支持用户、项目和 Worktree
   - 修改对话创建 API，绑定用户和项目
   - 实现项目初始化脚本 `scripts/init-projects.ts`

2. **前端实现**
   - 登录页面（LoginPage）
   - 项目选择页面（ProjectSelectPage）
   - 用户和项目状态管理
   - 认证和项目 API 服务

3. **集成测试**
   - 完整的登录到对话流程测试
   - Worktree 创建和清理测试

## 快速开始

### 1. 安装依赖

```bash
cd backend
pnpm install jsonwebtoken @types/jsonwebtoken
```

### 2. 配置环境变量

复制并编辑 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

配置关键变量：

```bash
# JWT 配置
JWT_SECRET=your-strong-secret-key-here

# 数据库配置
DATABASE_URL=postgresql://user:password@host:5432/database

# 项目配置示例
PROJECT_MAIN_SITE_GITLAB_URL=https://gitlab.com
PROJECT_MAIN_SITE_GITLAB_TOKEN=your-gitlab-token
PROJECT_MAIN_SITE_GITLAB_PROJECT_ID=12345
PROJECT_MAIN_SITE_REPO_DIR=/data/repos/main-site
PROJECT_MAIN_SITE_WORKTREE_BASE_DIR=/data/worktrees/main-site
PROJECT_MAIN_SITE_GIT_DEFAULT_BRANCH=main
```

### 3. 运行数据库迁移

```bash
cd backend

# 应用迁移
psql $DATABASE_URL -f drizzle/0002_add_users_projects_tables.sql

# 或使用 drizzle-kit
pnpm db:push
```

### 4. 启动服务

```bash
cd backend
pnpm dev
```

## API 使用示例

### 用户登录

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "zhangsan"}'
```

响应：
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "username": "zhangsan",
    "displayName": "zhangsan",
    "avatarUrl": null,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 获取项目列表

```bash
curl -X GET http://localhost:3001/api/projects \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "projectKey": "MAIN_SITE",
      "projectName": "MAIN SITE",
      "description": "自动创建的项目: MAIN_SITE",
      "repoDir": "/data/repos/main-site",
      "worktreeBaseDir": "/data/worktrees/main-site",
      "gitDefaultBranch": "main",
      "isActive": true,
      "configStatus": "complete"
    }
  ]
}
```

## 数据库表结构

### users 表
- id (uuid, PK)
- username (varchar, unique)
- display_name (varchar, nullable)
- avatar_url (text, nullable)
- created_at (timestamp)
- last_login_at (timestamp, nullable)
- is_active (boolean)

### projects 表
- id (uuid, PK)
- project_key (varchar, unique)
- project_name (varchar)
- description (text, nullable)
- repo_dir (text) - Git 主仓库目录
- worktree_base_dir (text) - Worktree 基础目录
- git_default_branch (varchar)
- docker_host (varchar, nullable)
- is_active (boolean)
- created_at (timestamp)
- updated_at (timestamp)
- created_by (uuid, nullable)

### conversations 表（新增字段）
- user_id (uuid) - 关联用户
- project_id (uuid) - 关联项目
- worktree_path (text, nullable) - Worktree 工作目录路径

## Git Worktree 工作原理

### 目录结构示例

```
Git 主仓库：
  /data/repos/project-main/.git

Worktree 目录：
  /data/worktrees/project-main/
    ├── zhangsan/
    │   ├── conv-uuid-001/  (张三的对话1)
    │   └── conv-uuid-002/  (张三的对话2)
    └── lisi/
        └── conv-uuid-003/  (李四的对话)
```

### 命名规范

- Worktree 路径：`{worktree_base_dir}/{username}/{conversation_id}`
- 分支名称：`{username}-conversation-{conversation_id_short}-{timestamp}`

## 注意事项

1. **JWT 密钥安全**：生产环境必须修改 `JWT_SECRET` 为强密码
2. **Git 仓库初始化**：首次使用前需要初始化 Git 主仓库
3. **Worktree 目录权限**：确保应用有读写权限
4. **多项目配置**：每个项目需要独立的环境变量配置

## 故障排查

### 数据库连接失败
检查 `DATABASE_URL` 配置是否正确，数据库是否可访问。

### 项目配置不完整
检查环境变量中项目配置是否完整，缺少必需字段会导致项目状态为 `incomplete`。

### JWT Token 无效
Token 有效期为 7 天，过期需要重新登录。

## 下一步计划

1. 完成 ConversationManager 的 Worktree 集成
2. 实现前端登录和项目选择页面
3. 添加完整的集成测试
4. 实现项目初始化脚本（自动 clone Git 仓库）
5. 添加 Worktree 清理定时任务
