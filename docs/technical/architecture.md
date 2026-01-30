# 技术架构

## 总体结构

- 前端：React + Vite
- 后端：Express + TypeScript
- 数据库：PostgreSQL（Drizzle）
- 代码执行：本地或 SSH 远程执行器

## 关键子系统

- 会话与消息：ConversationManager / MessageRouter
- AI 执行：ConversationAIService / NeovateAIService
- Worktree：WorktreeManager
- 预览部署：ProjectPreviewService（PM2）
- 项目管理：ProjectService + RepositoryService
- Docker 管理：DockerService / DockerComposeService

## 典型链路

- 创建会话 -> 创建 Worktree -> 发送消息 -> AI 修改 -> 自动提交
- 预览 -> 分配端口 -> 建立 node_modules 软连接 -> PM2 启动
