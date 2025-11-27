# 配置指南

本文档详细说明如何配置 Web 前端实习生助手系统。

## 目录

- [环境要求](#环境要求)
- [SSH 配置](#ssh-配置)
- [Git 配置](#git-配置)
- [GitLab 配置](#gitlab-配置)
- [虚拟机环境准备](#虚拟机环境准备)
- [配置验证](#配置验证)
- [常见问题](#常见问题)

## 环境要求

### 本地环境

- Node.js 18+ LTS
- npm 或 yarn
- Git

### 远程虚拟机

- Linux 系统（Ubuntu 20.04+ 推荐）
- SSH 服务已启动
- Node.js 18+ LTS
- Git
- qodercli（AI 代码工具）

## SSH 配置

### 1. 生成 SSH 密钥对

如果还没有 SSH 密钥，生成一个：

```bash
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```

默认会生成在 `~/.ssh/id_rsa`（私钥）和 `~/.ssh/id_rsa.pub`（公钥）。

### 2. 将公钥添加到虚拟机

```bash
# 复制公钥内容
cat ~/.ssh/id_rsa.pub

# 在虚拟机上执行
mkdir -p ~/.ssh
echo "your-public-key-content" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### 3. 测试 SSH 连接

```bash
ssh -i ~/.ssh/id_rsa username@vm-host
```

如果能成功连接，说明 SSH 配置正确。

### 4. 配置环境变量

在 `backend/.env` 中设置：

```bash
SSH_HOST=your-vm-ip-or-domain
SSH_PORT=22
SSH_USERNAME=your-username
SSH_PRIVATE_KEY_PATH=/Users/your-username/.ssh/id_rsa  # macOS/Linux
# 或
SSH_PRIVATE_KEY_PATH=C:\Users\your-username\.ssh\id_rsa  # Windows
```

## Git 配置

### 1. 在虚拟机上克隆仓库

```bash
# SSH 到虚拟机
ssh username@vm-host

# 克隆你的前端项目
cd ~/projects
git clone git@gitlab.com:your-username/your-project.git
cd your-project

# 配置 Git 用户信息
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

### 2. 配置环境变量

在 `backend/.env` 中设置：

```bash
GIT_WORK_DIR=/home/username/projects/your-project
GIT_DEFAULT_BRANCH=main
```

## GitLab 配置

### 1. 创建 Personal Access Token

1. 登录 GitLab（https://gitlab.com 或你的私有实例）
2. 点击右上角头像 > Settings
3. 左侧菜单选择 "Access Tokens"
4. 填写信息：
   - Token name: `web-frontend-assistant`
   - Expiration date: 选择一个合适的过期时间
   - Select scopes: 勾选以下权限
     - ✅ `api` - 完整的 API 访问权限
     - ✅ `read_repository` - 读取仓库
     - ✅ `write_repository` - 写入仓库
5. 点击 "Create personal access token"
6. **重要**：复制生成的 Token（只显示一次）

### 2. 获取项目 ID

1. 打开你的 GitLab 项目
2. 进入 Settings > General
3. 在页面顶部可以看到 "Project ID: 12345"

### 3. 配置环境变量

在 `backend/.env` 中设置：

```bash
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx
GITLAB_PROJECT_ID=12345
```

## 虚拟机环境准备

### 1. 安装 Node.js

```bash
# 使用 nvm 安装（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# 验证安装
node --version
npm --version
```

### 2. 安装 qodercli

```bash
# 安装 qodercli
npm install -g qodercli

# 验证安装
qodercli --version
```

### 3. 配置 qodercli

qodercli 需要登录 Qoder 账号才能使用。首次运行时会提示登录：

```bash
# 首次运行会提示登录
qodercli

# 或者查看帮助
qodercli --help
```

登录后，qodercli 会自动保存认证信息。

## 配置验证

### 1. 检查配置文件

确保 `backend/.env` 文件存在且包含所有必需的配置项。

### 2. 启动服务器

```bash
cd backend
npm install
npm run dev
```

### 3. 查看启动日志

如果配置正确，你应该看到：

```
✅ SSH 连接已建立
✅ 任务编排器已初始化
🚀 后端服务器运行在 http://localhost:3001
📝 环境: development
📊 API 端点: http://localhost:3001/api/tasks
🔌 WebSocket 端点: ws://localhost:3001
```

如果看到警告或错误，请检查相应的配置项。

### 4. 测试 API

```bash
# 健康检查
curl http://localhost:3001/health

# 创建测试任务
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt":"测试任务"}'
```

## 常见问题

### SSH 连接失败

**问题**：`SSH 连接失败: connect ECONNREFUSED`

**解决方案**：
1. 检查虚拟机是否运行
2. 检查 SSH 服务是否启动：`sudo systemctl status sshd`
3. 检查防火墙设置
4. 验证 SSH 配置：`ssh -v username@vm-host`

### SSH 密钥权限错误

**问题**：`Load key: bad permissions`

**解决方案**：
```bash
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub
```

### GitLab Token 无效

**问题**：`创建 MR 失败 (401): Unauthorized`

**解决方案**：
1. 检查 Token 是否正确复制
2. 检查 Token 是否过期
3. 检查 Token 权限是否包含 `api`
4. 重新生成 Token

### Git 仓库路径错误

**问题**：`GIT_WORK_DIR 环境变量未设置`

**解决方案**：
1. 确保在虚拟机上克隆了仓库
2. 使用绝对路径：`/home/username/projects/repo`
3. 检查路径是否存在：`ssh username@vm-host "ls -la /path/to/repo"`

### qodercli 未找到

**问题**：`qodercli not found`

**解决方案**：
1. 在虚拟机上安装 qodercli
2. 检查安装：`ssh username@vm-host "which qodercli"`
3. 确保 qodercli 在 PATH 中

## 安全建议

1. **不要提交 .env 文件到 Git**
   - `.env` 已在 `.gitignore` 中
   - 只提交 `.env.example` 作为模板

2. **定期更换 GitLab Token**
   - 设置合理的过期时间
   - Token 泄露后立即撤销

3. **保护 SSH 私钥**
   - 设置正确的文件权限（600）
   - 不要分享私钥文件
   - 考虑使用密码保护的密钥

4. **限制虚拟机访问**
   - 使用防火墙限制 SSH 访问
   - 考虑使用 VPN
   - 定期更新系统和软件

## 获取帮助

如果遇到配置问题：

1. 查看服务器日志
2. 检查 `backend/.env` 配置
3. 运行配置验证脚本
4. 查看本文档的常见问题部分
