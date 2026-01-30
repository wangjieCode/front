# 后端服务职责

## 会话与消息

- ConversationManager：会话创建、状态维护、上下文持久化
- MessageRouter：消息入库、AI 响应入库、提问等待

## AI 与 Git

- ConversationAIService：调用 Neovate，构建元数据，自动提交
- NeovateAIService：执行 CLI，解析输出与 diff
- GitService：git add/commit/push
- GitLabMCPService：创建与查询 MR

## Worktree 与项目

- WorktreeManager：创建/删除/查询 worktree 与分支
- ProjectService：项目 CRUD 与仓库拉取
- RepositoryService：克隆与仓库初始化

## 预览与基础设施

- ProjectPreviewService：分配端口、建立软链接、PM2 启动
- DockerService：Docker 容器与镜像管理
- DockerComposeService：docker-compose 生命周期管理

## 存储

- DrizzleConversationStorage：数据库读写
- ConversationStorageAdapter：领域模型转换
