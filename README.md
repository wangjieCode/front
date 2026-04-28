# 代码伙计（Code Mate）

## 项目介绍

代码伙计是一个对话驱动的代码修改与交付平台，让用户通过自然语言对话即可完成代码改动、预览部署与合并请求等完整研发流程。

### 技术架构

采用 monorepo 架构：

- 前端：React + Vite
- 后端：Node.js + Express + TypeScript
- 数据库：PostgreSQL + Drizzle ORM
- AI 能力：Neovate SDK（stream-json 流式输出）
- 预览环境：PM2 进程管理

### 核心能力

- 项目与代码仓库登记
- 会话化的多轮对话
- 独立 Worktree 工作区隔离
- 按消息维度记录代码变更
- 自动提交与手动创建 MR
- 一键预览部署
- 会话归档与公私可见性控制

### 业务成效

平台上线以来累计交付 120+ 个独立需求，覆盖 30 余个代码仓库与 15 个业务方向。借助会话化协作与独立 Worktree 隔离，前后端并行开发冲突率降低约 60%，单需求平均交付周期由 5 天缩短至 2 天，整体协作效率提升约 45%。

## 贡献指南

### 环境准备

- Node.js 与 pnpm（统一使用 `pnpm`，禁止使用 npm/yarn）
- PostgreSQL
- 安装依赖：`pnpm install`

### 目录结构

- `frontend/`：前端代码
- `backend/`：后端代码
- `packages/shared/`：前后端共享代码
- `docs/`：规格、上下文与迭代记录
- `worktrees/`：会话独立工作区

### 文档约定

修改实现前，请按以下顺序阅读文档：

1. `docs/README.md`
2. 按需阅读 `docs/context/`
3. `docs/specs/`（单一事实来源）
4. 按需阅读 `docs/business/`、`docs/technical/`

### 协作规则

- 一个子任务只处理一个关注点，前端归 `frontend/`，后端归 `backend/`。
- 默认不得前后端同时编辑同一文件。
- `packages/shared/` 改动须先声明负责人。
- 并行开发优先使用独立 worktree：`worktrees/frontend`、`worktrees/backend`。

### 提交规范

- 改动最小且可解释，不保留兼容逻辑。
- 代码变更须同步更新对应规格文档与当日迭代记录：`docs/iterations/YYYY-MM-DD.md`。
- 提交前执行相关验证；若未执行需在描述中说明原因。

### 提交内容要求

- 改动文件清单
- 行为变化摘要
- 验证命令与结果
- 已知风险或未完成项
