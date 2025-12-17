# Web 前端实习生助手系统 - iFlow 上下文文档

## 📋 项目概述

**项目名称**: Web 前端实习生助手系统  
**项目类型**: 全栈 Web 应用（Node.js + React + TypeScript）  
**核心价值**: 通过可视化 Web 界面接收自然语言指令，在远程虚拟机上执行前端代码操作，降低非前端专业人员的开发门槛

### 目标用户
- 产品经理：快速验证原型、调整 UI 细节
- 后端工程师：修改前端接口调用、数据展示逻辑
- 测试工程师：修复简单的前端 bug
- 设计师：调整样式和交互

### 核心特性
1. **多用户多项目支持**: 支持多个用户同时在不同项目上工作
2. **Git Worktree 隔离**: 每个对话独立的工作空间，互不干扰
3. **AI 代码编辑**: 集成 neovate/qodercli AI 工具进行代码修改
4. **GitLab MCP 集成**: 自动创建 Merge Request
5. **远程虚拟机执行**: 通过 SSH 在预配置的开发环境中执行操作
6. **实时流式响应**: SSE 流式输出执行过程和结果
7. **Docker 容器管理**: 支持远程 Docker 容器的创建、管理和预览

---

## 🏗️ 项目架构

### 技术栈

#### 后端 (backend/)
- **运行时**: Node.js + TypeScript
- **Web 框架**: Express.js
- **数据库**: PostgreSQL (Supabase)
- **ORM**: Drizzle ORM
- **认证**: JWT (jsonwebtoken)
- **SSH 连接**: ssh2
- **Docker 管理**: dockerode
- **WebSocket**: ws

#### 前端 (frontend/)
- **框架**: React 18 + TypeScript
- **路由**: react-router-dom
- **UI 组件**: Ant Design (antd)
- **构建工具**: Vite
- **代码高亮**: react-syntax-highlighter
- **Markdown**: react-markdown
- **Diff 视图**: react-diff-viewer

### 目录结构

```
front-intern/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── api/               # API 路由
│   │   │   ├── authRoutes.ts         # 用户认证
│   │   │   ├── projectRoutes.ts      # 项目管理
│   │   │   ├── conversationRoutes.ts # 对话管理
│   │   │   ├── previewRoutes.ts      # 项目预览
│   │   │   ├── dockerRoutes.ts       # Docker 管理
│   │   │   └── dockerComposeRoutes.ts # Docker Compose
│   │   ├── services/          # 业务逻辑服务
│   │   │   ├── AuthService.ts        # 认证服务
│   │   │   ├── ProjectService.ts     # 项目服务
│   │   │   ├── GitWorktreeService.ts # Git Worktree 管理
│   │   │   ├── ConversationManager.ts # 对话管理
│   │   │   ├── NeovateAIService.ts   # AI 代码编辑
│   │   │   ├── GitService.ts         # Git 操作
│   │   │   ├── GitLabMCPService.ts   # GitLab MCP
│   │   │   ├── SSHExecutor.ts        # SSH 命令执行
│   │   │   └── DockerComposeService.ts # Docker Compose
│   │   ├── db/                # 数据库
│   │   │   ├── schema.ts             # 数据库表结构
│   │   │   ├── init.ts               # 数据库初始化
│   │   │   └── DatabaseManager.ts    # 数据库管理器
│   │   ├── storage/           # 存储层
│   │   ├── streaming/         # SSE 流式响应
│   │   ├── types/             # TypeScript 类型定义
│   │   └── index.ts           # 服务器入口
│   ├── scripts/               # 工具脚本
│   │   ├── init-projects.ts          # 项目初始化
│   │   └── ...                       # 其他测试脚本
│   ├── drizzle/               # 数据库迁移文件
│   └── package.json
│
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── pages/             # 页面组件
│   │   │   ├── LoginPage.tsx         # 登录页面
│   │   │   └── ProjectSelectPage.tsx # 项目选择页面
│   │   ├── components/        # UI 组件
│   │   │   └── ConversationView.tsx  # 对话视图
│   │   ├── services/          # API 服务
│   │   │   ├── authService.ts        # 认证服务
│   │   │   ├── projectService.ts     # 项目服务
│   │   │   └── conversationService.ts # 对话服务
│   │   ├── types/             # TypeScript 类型
│   │   ├── App.tsx            # 主应用组件
│   │   └── main.tsx           # 应用入口
│   └── package.json
│
├── front-workspace/            # 工作空间示例
│   └── dtmall-admin/          # 示例项目（电商后台）
│
└── .kiro/specs/               # 功能规格文档
    └── web-frontend-intern-assistant/
        ├── requirements.md    # 需求文档
        ├── design.md          # 设计文档
        └── tasks.md           # 任务清单
```

---

## 🔧 核心功能模块

### 1. 用户认证与多项目支持

#### 数据库表结构

**users 表** - 用户信息
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(200),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);
```

**projects 表** - 项目配置
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  project_key VARCHAR(100) UNIQUE NOT NULL,
  project_name VARCHAR(200) NOT NULL,
  repo_dir TEXT NOT NULL,
  worktree_base_dir TEXT NOT NULL,
  git_default_branch VARCHAR(100) DEFAULT 'main',
  is_active BOOLEAN DEFAULT true,
  ...
);
```

**conversations 表** - 对话会话（扩展字段）
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  worktree_path TEXT,
  ...
);
```

#### 认证流程
1. 用户输入用户名登录（无需密码）
2. 首次登录自动创建账号
3. 返回 JWT Token（有效期 7 天）
4. Token 存储在 localStorage
5. 后续请求通过 Authorization Header 携带 Token

#### 项目配置
项目通过环境变量配置，格式：`PROJECT_{KEY}_{CONFIG}`

```bash
# 示例：主站项目
PROJECT_MAIN_SITE_GITLAB_URL=https://gitlab.com
PROJECT_MAIN_SITE_GITLAB_TOKEN=glpat-xxxxxxxxxxxx
PROJECT_MAIN_SITE_GITLAB_PROJECT_ID=12345
PROJECT_MAIN_SITE_REPO_DIR=/data/repos/main-site
PROJECT_MAIN_SITE_WORKTREE_BASE_DIR=/data/worktrees/main-site
PROJECT_MAIN_SITE_GIT_DEFAULT_BRANCH=main
```

### 2. Git Worktree 工作空间隔离

每个用户的对话独立创建 Git Worktree，实现代码编辑隔离：

```
Git 主仓库: /data/repos/project-main/.git

Worktree 目录:
/data/worktrees/project-main/
  ├── zhangsan/
  │   ├── conv-uuid-001/  (张三的对话1)
  │   └── conv-uuid-002/  (张三的对话2)
  └── lisi/
      └── conv-uuid-003/  (李四的对话)
```

**分支命名**: `{username}-conversation-{short_id}-{timestamp}`

**生命周期**:
1. 创建对话时自动创建 Worktree
2. 对话进行中在独立工作空间操作
3. 对话删除时自动清理 Worktree

### 3. 对话模式 (ConversationMode)

系统支持两种对话模式：

- **EDIT 模式**: 允许修改代码，创建 MR
- **QUERY 模式**: 只读模式，仅查询和分析代码

### 4. AI 代码编辑服务

**NeovateAIService** - 主要 AI 服务
- 集成 neovate AI 工具
- 支持自然语言代码修改
- 流式输出执行过程
- 自动解析代码变更

**CodeToolService** - 代码工具抽象层
- 支持多种工具：neovate, qodercli, cursor
- 统一的工具接口
- 工具可用性检测

### 5. GitLab MCP 集成

**GitLabMCPService** - GitLab 操作服务
- 创建 Merge Request
- 管理分支
- 查询项目信息
- 代码审查流程

### 6. 远程执行环境

**运行模式**:
- **local**: 本机执行（开发/测试）
- **remote**: 远程虚拟机执行（生产）

**SSHExecutor** - SSH 远程执行器
- SSH 连接管理
- 命令执行
- 文件传输
- 输出流捕获

### 7. Docker 容器管理

**DockerComposeService** - Docker Compose 服务
- 解析 docker-compose.yml
- 启动/停止容器
- 端口映射管理
- 容器日志查看

**ProjectPreviewService** - 项目预览服务
- 自动检测项目类型
- 启动开发服务器
- 生成预览 URL
- 健康检查

---

## 🚀 构建和运行

### 环境准备

**系统要求**:
- Node.js 18+ (LTS 版本)
- PostgreSQL 14+ (或 Supabase)
- Git 2.30+
- (可选) Docker + Docker Compose

### 安装依赖

```bash
# 后端
cd backend
npm install  # 或 pnpm install

# 前端
cd frontend
npm install  # 或 pnpm install
```

### 配置环境变量

1. 复制配置模板：
```bash
cd backend
cp .env.example .env
```

2. 编辑 `.env` 文件，配置必需项：

```bash
# JWT 配置（生产环境必须修改）
JWT_SECRET=your-strong-secret-key

# 数据库连接
DATABASE_URL=postgresql://user:password@host:5432/database

# 项目配置（至少配置一个项目）
PROJECT_MAIN_SITE_GITLAB_URL=https://gitlab.com
PROJECT_MAIN_SITE_GITLAB_TOKEN=glpat-xxxxxxxxxxxx
PROJECT_MAIN_SITE_GITLAB_PROJECT_ID=12345
PROJECT_MAIN_SITE_REPO_DIR=/data/repos/main-site
PROJECT_MAIN_SITE_WORKTREE_BASE_DIR=/data/worktrees/main-site
PROJECT_MAIN_SITE_GIT_DEFAULT_BRANCH=main

# AI 工具配置
CODE_TOOL_TYPE=neovate
IFLOW_API_KEY=your-iflow-api-key
```

### 初始化数据库

```bash
cd backend

# 方式 1: 使用 Drizzle Kit
npm run db:push

# 方式 2: 手动执行 SQL
psql $DATABASE_URL -f drizzle/0000_classy_colonel_america.sql
psql $DATABASE_URL -f drizzle/0001_add_conversation_mode.sql
psql $DATABASE_URL -f drizzle/0002_add_users_projects_tables.sql
```

### 初始化项目

```bash
cd backend

# 从环境变量同步项目配置到数据库
# 自动克隆 Git 仓库（如果不存在）
# 创建 Worktree 基础目录
npm run init:projects
```

### 启动服务

**开发模式**:
```bash
# 后端（端口 3001）
cd backend
npm run dev

# 前端（端口 5173）
cd frontend
npm run dev
```

**生产模式**:
```bash
# 后端
cd backend
npm run build
npm start

# 前端
cd frontend
npm run build
npm run preview
```

### 访问应用

1. 打开浏览器访问: `http://localhost:5173`
2. 登录页面输入用户名
3. 选择项目
4. 开始对话

---

## 🧪 测试

### 后端测试

```bash
cd backend

# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 集成测试
npm run test:integration

# API 测试
npm run test:api
```

### 测试脚本

```bash
# 数据库测试
npm run db:test

# 存储测试
npm run test:storage

# SSE 流式响应测试
npm run test:sse

# 预览服务测试
npm run test:preview
```

---

## 📡 API 接口

### 认证接口

**POST /api/auth/login**
```json
// 请求
{
  "username": "zhangsan"
}

// 响应
{
  "success": true,
  "data": {
    "userId": "uuid",
    "username": "zhangsan",
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**GET /api/auth/me**
```
Headers: Authorization: Bearer {token}

响应: 用户信息
```

### 项目接口

**GET /api/projects**
```
Headers: Authorization: Bearer {token}

响应: 项目列表
```

**GET /api/projects/:id**
```
响应: 项目详情
```

### 对话接口

**POST /api/conversations**
```json
{
  "taskId": "task-123",
  "initialPrompt": "修改登录按钮颜色为蓝色",
  "projectInfo": {
    "workDir": "/data/repos/main-site",
    "gitBranch": "main"
  },
  "mode": "edit"
}
```

**GET /api/conversations/:id/messages**
```
响应: 对话消息列表（SSE 流式）
```

**POST /api/conversations/:id/messages**
```json
{
  "role": "user",
  "content": "请继续实现"
}
```

**DELETE /api/conversations/:id**
```
删除对话（自动清理 Worktree）
```

### Docker 接口

**POST /api/docker-compose/parse**
```
解析 docker-compose.yml
```

**POST /api/docker-compose/up**
```
启动容器
```

**POST /api/conversations/:id/preview**
```
生成项目预览 URL
```

---

## 🔐 安全性考虑

1. **JWT Token**: 使用强密码作为 JWT_SECRET，Token 默认 7 天有效期
2. **敏感配置**: GitLab Token 等存储在环境变量，不存储在数据库
3. **用户隔离**: 每个用户独立的 Worktree，代码编辑互不干扰
4. **SSH 连接**: 使用密钥认证，避免密码泄露
5. **API 认证**: 所有敏感接口需要 JWT Token 验证

---

## 🐛 故障排查

### 数据库连接失败
- 检查 `DATABASE_URL` 配置
- 确认 PostgreSQL 服务运行中
- 验证用户名密码和数据库名称

### 项目初始化失败
- 检查环境变量中项目配置是否完整
- 确认 Git 仓库 URL 和 Token 正确
- 验证目录权限

### JWT Token 无效
- Token 有效期 7 天，过期需重新登录
- 检查 JWT_SECRET 配置

### SSH 连接失败
- 验证 SSH 配置（host, port, username）
- 检查私钥文件路径和权限
- 确认远程主机网络可达

### Worktree 创建失败
- 检查 Git 仓库是否正确初始化
- 验证 worktree_base_dir 目录权限
- 确认分支名称不冲突

---

## 📚 开发约定

### 代码风格
- TypeScript 严格模式
- ESLint + Prettier 格式化
- 函数式编程优先
- 详细的类型注解

### Git 提交
- 使用语义化提交信息
- 功能分支开发
- Code Review 后合并

### 错误处理
- 统一的错误响应格式
- 详细的错误日志
- 用户友好的错误提示

### 测试
- 单元测试覆盖核心逻辑
- 集成测试验证完整流程
- E2E 测试关键用户场景

---

## 🔄 下一步计划

### 功能增强
- [ ] 用户头像上传
- [ ] 项目成员管理
- [ ] 对话历史搜索
- [ ] 使用统计和报表
- [ ] 多语言支持

### 性能优化
- [ ] Worktree 池化管理
- [ ] 数据库查询优化
- [ ] 前端状态管理（Redux/Zustand）
- [ ] API 响应缓存

### 安全加固
- [ ] API 请求频率限制
- [ ] 用户权限分级
- [ ] 审计日志
- [ ] 敏感操作二次确认

---

## 📞 技术支持

### 常见问题

1. **如何添加新项目？**
   - 在 `.env` 文件中添加项目配置
   - 运行 `npm run init:projects`
   - 重启后端服务

2. **如何切换 AI 工具？**
   - 修改 `CODE_TOOL_TYPE` 环境变量
   - 配置对应工具的 API Key
   - 重启后端服务

3. **如何清理旧的 Worktree？**
   - 删除对话会自动清理
   - 手动清理：`git worktree prune`

### 日志位置
- 后端日志：控制台输出
- 数据库日志：PostgreSQL 日志目录
- SSH 执行日志：控制台输出

### 联系方式
- 技术文档：`/docs` 目录
- 需求文档：`.kiro/specs/web-frontend-intern-assistant/requirements.md`
- 设计文档：`.kiro/specs/web-frontend-intern-assistant/design.md`

---

## 📄 相关文档

- [完整实现总结](./COMPLETE_SUMMARY.md) - 多用户多项目功能完整说明
- [实施文档](./IMPLEMENTATION.md) - 详细的实施步骤
- [需求文档](./.kiro/specs/web-frontend-intern-assistant/requirements.md) - 用户故事和验收标准
- [设计文档](./.kiro/specs/web-frontend-intern-assistant/design.md) - 架构设计和技术选型

---

**最后更新**: 2024年  
**项目状态**: ✅ 核心功能已完成，持续迭代中  
**维护者**: 开发团队
