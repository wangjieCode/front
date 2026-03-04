# 系统上下文

## 系统定位

`代码伙计（Code Mate）` 是一个“对话驱动的代码修改与交付”系统，核心能力包括：

- 项目管理：登记代码仓库与工作目录
- 会话对话：用户用自然语言提出改动需求
- AI 执行：调用 Neovate SDK 修改代码并记录变更
- Worktree 管理：每个会话独立工作区
- 交付操作：自动提交、手动创建 MR、预览部署

## 运行形态

- 前端：React + Vite
- 后端：Node.js + Express + TypeScript
- 数据库：PostgreSQL（Drizzle ORM）
- 代码工具：Neovate SDK（stream-json 输出）
- 进程管理：PM2（用于预览启动）

## 核心状态与权限

- 会话状态：ACTIVE / ARCHIVED
- 可见性：PRIVATE / PUBLIC
- 归档后限制：禁止发送消息、禁止创建 MR、禁止预览

## 目录约束

- 主工作区：`LOCAL_GIT_WORK_DIR`
- Worktree 基础目录：`WORKTREE_BASE_DIR`
- Worktree 路径规则：`{WORKTREE_BASE_DIR}/project-{projectId}/user-{userId}/conversation-{sessionId}`

## 数据持久化

- 会话、上下文、消息、元数据均落库
- 代码变更以“消息维度”存储
