# IFLOW.md - Web 前端实习生助手系统

## 项目概述

**Web 前端实习生助手系统**是一个基于 Web 的智能开发平台，旨在降低前端开发门槛。系统通过可视化界面接收用户的自然语言指令，在预配置的远程虚拟机或本地环境上执行代码操作，并将结果实时反馈到 Web 端。

### 核心价值

- **零门槛操作**: 用户通过自然语言描述需求，无需了解命令行或配置开发环境
- **完整开发环境**: 支持本地或远程虚拟机，预装 Node.js、npm、构建工具等完整前端工具链
- **AI 代码修改**: 集成 qodercli/neovate，自动理解需求并修改代码
- **自动化工作流**: 通过 GitLab MCP 自动创建 Merge Request，简化代码审查流程

### 目标用户

产品经理、后端工程师、测试工程师等非前端专业人员，帮助他们快速完成前端相关任务，如：
- 快速修改 UI 文案、颜色、布局
- 调整数据展示逻辑和格式
- 修复简单的前端 bug
- 添加或修改表单验证规则

## 技术架构

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Web 前端 (React)                      │
│  - 用户界面 (Ant Design)                                     │
│  - SSE 客户端 (实时通信)                                     │
│  - 对话视图、代码 Diff 展示                                  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/SSE
┌────────────────────────┴────────────────────────────────────┐
│                    后端服务 (Node.js + Express)              │
│  - REST API (任务管理)                                       │
│  - SSE 流式响应 (StreamingResponseManager)                   │
│  - 对话管理器 (ConversationManager)                          │
│  - 消息路由器 (MessageRouter)                                │
│  - AI 服务 (ConversationAIService)                           │
│  - 数据存储 (Drizzle ORM + Supabase/PostgreSQL)             │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
┌───────┴────────┐              ┌─────────┴────────┐
│  本地执行器     │              │   SSH 执行器      │
│ (LocalExecutor)│              │  (SSHExecutor)   │
└───────┬────────┘              └─────────┬────────┘
        │                                 │
        │                                 │ SSH
┌───────┴────────┐              ┌─────────┴────────┐
│   本地环境      │              │   远程虚拟机      │
│ - Git 仓库     │              │ - Git 仓库       │
│ - Node.js      │              │ - Node.js        │
│ - neovate/qoder│              │ - neovate/qoder  │
└────────────────┘              └──────────────────┘
```

### 技术栈

**前端**:
- **框架**: React 18+
- **UI 组件**: Ant Design
- **状态管理**: useState/useReducer
- **代码高亮**: react-diff-viewer, react-syntax-highlighter
- **构建工具**: Vite

**后端**:
- **运行时**: Node.js 18+ LTS
- **框架**: Express.js
- **数据库**: PostgreSQL (Supabase)
- **ORM**: Drizzle ORM
- **SSH 客户端**: ssh2
- **Docker 管理**: dockerode

**AI 工具**:
- **neovate**: 主要 AI 代码修改工具（推荐）
- **qodercli**: 备选 AI 工具

**版本控制**:
- **GitLab MCP**: 自动创建 Merge Request
- **Git**: 分支管理、代码提交

## 项目结构

```
front-intern/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── index.ts           # 服务入口
│   │   ├── api/               # REST API 路由
│   │   │   ├── conversationRoutes.ts
│   │   │   ├── dockerRoutes.ts
│   │   │   ├── dockerComposeRoutes.ts
│   │   │   ├── previewRoutes.ts
│   │   │   └── middleware.ts
│   │   ├── services/          # 核心业务逻辑
│   │   │   ├── ConversationManager.ts
│   │   │   ├── ConversationAIService.ts
│   │   │   ├── MessageRouter.ts
│   │   │   ├── NeovateAIService.ts
│   │   │   ├── QoderCliProvider.ts
│   │   │   ├── GitService.ts
│   │   │   ├── GitLabMCPService.ts
│   │   │   ├── SSHExecutor.ts
│   │   │   ├── LocalExecutor.ts
│   │   │   ├── DockerService.ts
│   │   │   └── ProjectPreviewService.ts
│   │   ├── db/                # 数据库
│   │   │   ├── schema.ts      # Drizzle 数据库模式
│   │   │   ├── init.ts        # 数据库初始化
│   │   │   └── DatabaseManager.ts
│   │   ├── storage/           # 存储层
│   │   │   ├── DrizzleConversationStorage.ts
│   │   │   └── ConversationStorageAdapter.ts
│   │   ├── models/            # 数据模型
│   │   ├── types/             # TypeScript 类型定义
│   │   └── utils/             # 工具函数
│   ├── scripts/               # 脚本工具
│   ├── drizzle/               # 数据库迁移文件
│   ├── package.json
│   └── .env.example           # 环境变量示例
│
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── App.tsx            # 主应用组件
│   │   ├── main.tsx           # 入口文件
│   │   ├── components/        # React 组件
│   │   │   ├── ConversationView.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── CodeDiffViewer.tsx
│   │   │   └── ...
│   │   ├── services/          # API 服务
│   │   │   └── conversationService.ts
│   │   ├── types/             # TypeScript 类型
│   │   └── hooks/             # React Hooks
│   ├── package.json
│   └── vite.config.ts
│
├── front-workspace/            # 前端项目工作区
│   └── dtmall-admin/          # 示例项目（Vue 2 + Ant Design Vue）
│
├── .kiro/specs/               # 项目规格文档
│   └── web-frontend-intern-assistant/
│       ├── requirements.md    # 需求文档
│       ├── design.md          # 设计文档
│       └── tasks.md           # 任务列表
│
└── AGENTS.md                  # AI Agent 配置
```

## 快速开始

### 环境要求

- **Node.js**: 18+ LTS
- **pnpm**: 8.14.0+
- **PostgreSQL**: 14+ (或 Supabase 账号)
- **Git**: 2.0+

### 安装步骤

#### 1. 克隆项目

```bash
git clone https://github.com/wangjieCode/front.git
cd front-intern
```

#### 2. 安装依赖

```bash
# 安装后端依赖
cd backend
pnpm install

# 安装前端依赖
cd ../frontend
pnpm install
```

#### 3. 配置环境变量

```bash
# 复制后端环境变量示例
cd backend
cp .env.example .env

# 编辑 .env 文件，配置必要参数
# 必需配置：
# - DATABASE_URL: PostgreSQL 连接字符串
# - IFLOW_API_KEY: iFlow API 密钥
# - RUN_MODE: 'local' 或 'remote'
# - GIT_WORK_DIR: Git 工作目录路径
```

**关键环境变量说明**:

```bash
# 数据库（必需）
DATABASE_URL=postgresql://postgres:password@localhost:5432/conversation_db

# 运行模式（必需）
RUN_MODE=local  # 本地模式（推荐开发）或 remote（生产）

# Git 配置（必需）
GIT_WORK_DIR=../front-workspace/dtmall-admin
GIT_DEFAULT_BRANCH=master

# AI 工具配置（必需）
CODE_TOOL_TYPE=neovate
IFLOW_API_KEY=your-iflow-api-key

# GitLab 配置（可选，用于 MR 功能）
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your-gitlab-token
GITLAB_PROJECT_ID=your-project-id

# SSH 配置（仅 RUN_MODE=remote 时需要）
# SSH_HOST=your-vm-host
# SSH_PORT=22
# SSH_USERNAME=your-username
# SSH_PRIVATE_KEY_PATH=/path/to/private/key
```

#### 4. 初始化数据库

```bash
cd backend

# 生成数据库迁移文件
pnpm db:generate

# 执行数据库迁移
pnpm db:migrate

# 或直接推送 schema 到数据库
pnpm db:push
```

#### 5. 启动服务

**开发模式**:

```bash
# 启动后端（开发模式，支持热重载）
cd backend
pnpm dev

# 启动前端（新终端）
cd frontend
pnpm dev
```

**生产模式**:

```bash
# 构建后端
cd backend
pnpm build
pnpm start

# 构建前端
cd frontend
pnpm build
pnpm preview
```

### 访问应用

- **前端**: http://localhost:5173
- **后端 API**: http://localhost:3001
- **健康检查**: http://localhost:3001/health

## 核心功能

### 1. 对话管理

- **创建对话**: 用户输入自然语言需求，选择模式（编辑/查询）
- **多轮对话**: 支持上下文理解，连续对话
- **历史记录**: 查看和管理历史对话

### 2. 代码修改（编辑模式）

- **AI 理解**: 使用 neovate/qodercli 理解用户意图
- **自动修改**: AI 自动修改代码文件
- **实时反馈**: SSE 流式推送执行日志和 AI 响应
- **代码 Diff**: 可视化展示代码变更

### 3. 代码查询（查询模式）

- **代码搜索**: 搜索代码片段、函数定义
- **文件查看**: 查看文件内容
- **项目分析**: 分析项目结构和依赖

### 4. Git 集成

- **分支管理**: 自动创建任务分支
- **代码提交**: 自动提交代码变更
- **MR 创建**: 通过 GitLab MCP 自动创建 Merge Request

### 5. Docker 管理

- **容器管理**: 启动、停止、重启容器
- **Docker Compose**: 管理多容器应用
- **项目预览**: 自动启动项目预览服务

## 开发指南

### 后端开发

#### 添加新的 API 路由

1. 在 `backend/src/api/` 创建新的路由文件
2. 在 `backend/src/index.ts` 中注册路由

```typescript
// backend/src/api/myRoutes.ts
import { Router } from 'express';

export function createMyRoutes() {
  const router = Router();
  
  router.get('/', (req, res) => {
    res.json({ message: 'Hello' });
  });
  
  return router;
}

// backend/src/index.ts
import { createMyRoutes } from './api/myRoutes';
app.use('/api/my', createMyRoutes());
```

#### 添加新的服务

1. 在 `backend/src/services/` 创建服务类
2. 在需要的地方注入服务

```typescript
// backend/src/services/MyService.ts
export class MyService {
  async doSomething() {
    // 实现逻辑
  }
}
```

### 前端开发

#### 添加新的页面组件

```typescript
// frontend/src/pages/MyPage.tsx
import React from 'react';

const MyPage: React.FC = () => {
  return <div>My Page</div>;
};

export default MyPage;
```

#### 调用后端 API

```typescript
// frontend/src/services/myService.ts
export const myService = {
  async getData() {
    const response = await fetch('/api/my');
    return response.json();
  }
};
```

### 数据库操作

#### 修改数据库 Schema

1. 编辑 `backend/src/db/schema.ts`
2. 生成迁移文件: `pnpm db:generate`
3. 执行迁移: `pnpm db:migrate`

```typescript
// backend/src/db/schema.ts
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const myTable = pgTable('my_table', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

## 测试

### 运行测试

```bash
# 后端测试
cd backend
pnpm test

# 监听模式
pnpm test:watch
```

### 测试覆盖率

- 单元测试覆盖率目标: > 80%
- 关键路径覆盖率: 100%

### 测试策略

- **单元测试**: 测试独立函数和类
- **集成测试**: 测试 API 端点和服务交互
- **属性测试**: 使用 fast-check 验证通用属性

## 常用命令

### 后端

```bash
# 开发
pnpm dev              # 启动开发服务器（热重载）
pnpm build            # 构建生产版本
pnpm start            # 启动生产服务器

# 测试
pnpm test             # 运行测试
pnpm test:watch       # 监听模式测试
pnpm test:integration # 集成测试

# 数据库
pnpm db:generate      # 生成迁移文件
pnpm db:migrate       # 执行迁移
pnpm db:push          # 推送 schema
pnpm db:studio        # 打开数据库管理界面
pnpm db:clear         # 清空数据库

# 验证
pnpm verify           # 验证后端配置
pnpm check-config     # 检查环境配置

# Docker
pnpm docker:example   # Docker 示例
pnpm docker:clean     # 清理容器
```

### 前端

```bash
pnpm dev              # 启动开发服务器
pnpm build            # 构建生产版本
pnpm preview          # 预览生产构建
```

### 工作区项目（dtmall-admin）

```bash
cd front-workspace/dtmall-admin

pnpm install          # 安装依赖
pnpm serve            # 启动开发服务器
pnpm build            # 构建生产版本
pnpm lint:fix         # 修复 lint 错误
```

## 故障排除

### 数据库连接失败

**问题**: `数据库初始化失败: connection refused`

**解决方案**:
1. 检查 `DATABASE_URL` 配置是否正确
2. 确认 PostgreSQL 服务已启动
3. 验证网络连接和防火墙设置

### SSH 连接失败

**问题**: `SSH 连接失败: timeout`

**解决方案**:
1. 检查 `SSH_HOST` 和 `SSH_PORT` 配置
2. 验证私钥路径和权限 (`chmod 600 ~/.ssh/id_rsa`)
3. 测试 SSH 连接: `ssh user@host -p port`

### AI 工具调用失败

**问题**: `neovate 调用失败: API key invalid`

**解决方案**:
1. 检查 `IFLOW_API_KEY` 是否配置
2. 验证 API key 是否有效
3. 确认网络可访问 iFlow API

### 前端无法连接后端

**问题**: `Failed to fetch`

**解决方案**:
1. 确认后端服务已启动 (http://localhost:3001/health)
2. 检查前端 API 地址配置
3. 查看浏览器控制台和网络请求

## 项目约定

### 代码风格

- **使用 pnpm**: 项目统一使用 pnpm 作为包管理器
- **中文注释**: 代码注释和文档使用中文
- **TypeScript**: 后端和前端均使用 TypeScript
- **ESLint**: 遵循 ESLint 配置

### Git 工作流

- **分支命名**: `feat/功能名`、`fix/bug名`
- **提交信息**: 使用 commitlint 规范
- **MR 流程**: 代码审查后合并

### 文档规范

- **非必要不添加文档**: 代码应自解释
- **重要变更需文档**: 架构变更、API 变更需更新文档

## 相关资源

### 文档

- [需求文档](./.kiro/specs/web-frontend-intern-assistant/requirements.md)
- [设计文档](./.kiro/specs/web-frontend-intern-assistant/design.md)
- [任务列表](./.kiro/specs/web-frontend-intern-assistant/tasks.md)

### 工具

- [Drizzle ORM](https://orm.drizzle.team/)
- [Ant Design](https://ant.design/)
- [Vite](https://vitejs.dev/)
- [Express.js](https://expressjs.com/)

### API 文档

#### 对话 API

```
POST   /api/conversations              创建新对话
GET    /api/conversations              获取对话列表
GET    /api/conversations/:id          获取对话详情
DELETE /api/conversations/:id          删除对话
POST   /api/conversations/:id/messages 发送消息
GET    /api/conversations/:id/stream   SSE 流式响应
```

#### Docker API

```
GET    /api/docker/containers          列出容器
POST   /api/docker/containers/:id/start    启动容器
POST   /api/docker/containers/:id/stop     停止容器
```

## 许可证

MIT

---

**注意**: 本文档会随项目演进持续更新。如有问题或建议，请联系项目维护者。
