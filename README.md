# Web 前端实习生助手系统

一个基于 Web 的智能前端开发助手系统，通过可视化界面接收用户指令，在远程虚拟机上执行代码操作，并将结果反馈到 Web 端展示。

## 核心特性

- **零门槛操作**: 用户通过自然语言描述需求，无需了解命令行或配置开发环境
- **完整开发环境**: 远程虚拟机预装 Node.js、npm、构建工具等完整前端工具链
- **AI 代码修改**: 集成 qodercli，自动理解需求并修改代码
- **自动化工作流**: 通过 GitLab MCP 自动创建 Merge Request，简化代码审查流程

## 项目结构

```
.
├── backend/              # 后端服务
│   ├── src/
│   │   ├── models/       # 数据模型
│   │   ├── services/     # 业务逻辑服务
│   │   ├── api/          # REST API 路由
│   │   ├── websocket/    # WebSocket 服务
│   │   ├── utils/        # 工具函数
│   │   └── types/        # TypeScript 类型定义
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/             # 前端应用
    ├── src/
    │   ├── components/   # React 组件
    │   ├── services/     # API 服务
    │   ├── types/        # TypeScript 类型定义
    │   └── utils/        # 工具函数
    ├── package.json
    └── tsconfig.json
```

## 快速开始

### 前置要求

- Node.js 18+ LTS
- npm 或 yarn
- Git
- （可选）远程虚拟机（用于生产环境）

**注意**：系统支持两种运行模式：
- **本机模式**（推荐用于开发）：在本机直接执行命令，无需远程虚拟机
- **远程模式**（用于生产）：通过 SSH 在远程虚拟机上执行命令

### 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 配置环境变量

1. 复制配置文件模板：

```bash
cd backend
cp .env.example .env
```

2. 编辑 `.env` 文件，选择运行模式：

#### 运行模式选择

```bash
# 本机模式（推荐用于开发和测试）
RUN_MODE=local

# 或远程模式（用于生产环境）
RUN_MODE=remote
```

#### 本机模式配置（RUN_MODE=local）

```bash
GIT_WORK_DIR=./workspace          # 工作目录（相对或绝对路径）
GIT_DEFAULT_BRANCH=main           # 默认分支
GITLAB_URL=https://gitlab.com     # GitLab URL
GITLAB_TOKEN=your-token           # Personal Access Token
GITLAB_PROJECT_ID=12345           # 项目 ID
```

**本机模式优势**：
- ✅ 无需配置远程虚拟机
- ✅ 无需 SSH 密钥
- ✅ 快速启动和测试
- ✅ 适合开发环境

#### 远程模式配置（RUN_MODE=remote）

如果选择远程模式，还需要配置 SSH：

#### SSH 配置（仅远程模式）

```bash
SSH_HOST=your-vm-ip-or-domain    # 虚拟机 IP 或域名
SSH_PORT=22                       # SSH 端口
SSH_USERNAME=your-username        # SSH 用户名
SSH_PRIVATE_KEY_PATH=/path/to/key # SSH 私钥路径（绝对路径）
```

**生成 SSH 密钥**（如果还没有）：
```bash
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
# 将公钥添加到虚拟机的 ~/.ssh/authorized_keys
```

#### Git 配置

```bash
GIT_WORK_DIR=/path/to/repo       # Git 仓库路径（虚拟机上）
GIT_DEFAULT_BRANCH=main          # 默认分支
```

#### GitLab 配置

```bash
GITLAB_URL=https://gitlab.com    # GitLab URL
GITLAB_TOKEN=your-token          # Personal Access Token
GITLAB_PROJECT_ID=12345          # 项目 ID
```

**创建 GitLab Personal Access Token**：
1. 登录 GitLab
2. 进入 Settings > Access Tokens
3. 创建新 Token，勾选权限：`api`, `read_repository`, `write_repository`
4. 复制生成的 Token 到配置文件

**获取项目 ID**：
- 在 GitLab 项目页面，进入 Settings > General
- 项目 ID 显示在页面顶部

### 验证后端能力

在启动服务器前，可以验证后端功能：

```bash
cd backend

# 1. 检查配置
npm run check-config

# 2. 验证后端能力（测试核心功能）
npm run verify
```

如果看到 "✅ 所有测试通过！后端功能正常。"，说明后端已准备就绪。

### 启动开发服务器

```bash
# 启动后端服务
cd backend
npm run dev

# 启动前端服务（新终端）
cd frontend
npm run dev
```

访问 http://localhost:3000 查看应用。

**注意**：
- 本机模式：看到 "✅ 本机执行器已初始化" 说明配置正确
- 远程模式：看到 "✅ SSH 连接已建立" 说明配置正确

### 测试 API

服务器启动后，可以测试 API：

```bash
# 在新终端运行
cd backend
npm run test:api
```

或手动测试：

```bash
# 健康检查
curl http://localhost:3001/health

# 创建任务
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt":"测试任务"}'

# 查看任务列表
curl http://localhost:3001/api/tasks
```

## 技术栈

### 后端
- Node.js 18+
- Express.js
- WebSocket (ws)
- SSH2
- TypeScript

### 前端
- React 18+
- Ant Design
- Vite
- TypeScript

## 开发指南

### 运行测试

```bash
# 后端测试
cd backend
npm test

# 前端测试
cd frontend
npm test
```

### 构建生产版本

```bash
# 构建后端
cd backend
npm run build

# 构建前端
cd frontend
npm run build
```

## 许可证

MIT
