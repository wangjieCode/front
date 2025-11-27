# 快速启动指南

本指南帮助你在 5 分钟内启动系统（本机模式）。

## 步骤 1: 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

## 步骤 2: 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env` 文件，**最小配置**：

```bash
# 运行模式
RUN_MODE=local

# Git 配置
GIT_WORK_DIR=./workspace
GIT_DEFAULT_BRANCH=main

# GitLab 配置（如果不需要创建 MR，可以暂时使用占位符）
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=placeholder
GITLAB_PROJECT_ID=1
```

## 步骤 3: 启动服务

```bash
# 启动后端（在 backend 目录）
npm run dev
```

你应该看到：

```
🔧 运行模式: 本机模式
✅ 本机执行器已初始化
✅ 任务编排器已初始化
🚀 后端服务器运行在 http://localhost:3001
```

## 步骤 4: 测试 API

打开新终端，测试 API：

```bash
# 健康检查
curl http://localhost:3001/health

# 创建测试任务
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt":"测试任务"}'

# 查看任务列表
curl http://localhost:3001/api/tasks
```

## 步骤 5: 启动前端（可选）

```bash
cd frontend
npm run dev
```

访问 http://localhost:3000

## 本机模式 vs 远程模式

### 本机模式（当前配置）

✅ **优点**：
- 无需远程虚拟机
- 无需 SSH 配置
- 快速启动
- 适合开发和测试

❌ **限制**：
- 命令在本机执行
- 需要本机安装 Git 和 Node.js
- qodercli 需要在本机安装

### 远程模式

✅ **优点**：
- 隔离的执行环境
- 预配置的开发工具
- 适合生产环境

❌ **要求**：
- 需要远程虚拟机
- 需要 SSH 配置
- 需要网络连接

## 下一步

- 查看 [README.md](README.md) 了解完整功能
- 查看 [CONFIGURATION.md](CONFIGURATION.md) 了解详细配置
- 查看 [VERIFICATION.md](VERIFICATION.md) 了解 qodercli 集成验证
- 如需使用远程模式，设置 `RUN_MODE=remote` 并配置 SSH

## 常见问题

### Q: 如何切换到远程模式？

A: 编辑 `.env` 文件：
```bash
RUN_MODE=remote
SSH_HOST=your-vm-host
SSH_USERNAME=your-username
SSH_PRIVATE_KEY_PATH=/path/to/key
```

### Q: 本机模式下 qodercli 在哪里运行？

A: 在本机运行。你需要在本机安装并登录 qodercli：
```bash
# 安装
npm install -g qodercli

# 首次运行会提示登录
qodercli
```

### Q: workspace 目录是什么？

A: 本机模式下的 Git 工作目录。系统会在这里执行 Git 操作。

### Q: 可以不配置 GitLab 吗？

A: 可以。如果不需要创建 MR 功能，使用占位符即可。系统会在创建 MR 时报错，但其他功能正常。
