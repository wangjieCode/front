# 对话逻辑链路文档

本文档详细描述了对话系统的前后端逻辑链路，涵盖会话创建、消息交互、Git 集成以及状态管理等核心流程。

## 1. 核心架构概览

对话系统由前端（React + Ant Design）和后端（Node.js + Express）组成，后端采用分层架构，主要通过 **ConversationManager**、**MessageRouter** 和 **ConversationAIService** 协同工作。

### 核心实体
*   **ConversationSession**: 会话主体，包含状态 (`status`)、上下文 (`context`) 和项目信息 (`projectInfo`)。
*   **ConversationContext**: 维护当前 Git 分支 (`gitBranch`)、MR 链接 (`mrUrl`) 和运行模式 (`mode` - EDIT/READONLY)。
*   **ConversationManager**: 领域服务核心，管理会话生命周期、Worktree 和 Git 分支。
*   **ConversationAIService**: AI 能力通过此服务暴露，负责调用底层模型 (`NeovateAIService`) 并处理代码提交。

---

## 2. 详细流程链路

### 2.1 会话创建流程 (Session Creation)

用户在首页输入提示词并选择项目后，系统初始化会话环境。

**前端动作**:
1.  用户在 `App.tsx` (Sidebar) 或 `ConversationView.tsx` (Landing) 输入 prompt。
2.  调用 `conversationService.createConversation` (POST `/api/conversations`)。
3.  请求成功后，前端路由导航至 `/chat/:sessionId`，并刷新侧边栏列表。

**后端处理**:
1.  **API Layer** (`conversationRoutes.ts`): 接收 `projectId`, `mode`, `initialPrompt`。
2.  **ConversationManager.createSession**:
    *   生成 `sessionId` 和 `mainBranchId`。
    *   **Worktree/Git 初始化**:
        *   **EDIT 模式**:
            1.  调用 `WorktreeManager` 确保用户专属 Worktree 存在。
            2.  创建新的 Git 分支 (基于 `master` 或默认分支)。
            3.  将新分支和 Worktree 路径更新到 `session.context`。
        *   **READONLY 模式**:
            1.  确保 Worktree 存在。
            2.  切换 Worktree 到主分支。
    *   **持久化**: 保存 Session 到数据库/存储。
3.  **返回**: 返回包含 `sessionId` 和初始上下文的 Session 对象。

### 2.2 消息交互流程 (Message Interaction)

用户发送消息，系统流式返回 AI 响应。

**前端动作**:
1.  `ConversationView` 调用 `handleSendMessage`。
2.  **UI 乐观更新**: 立即展示用户消息和临时 Loading 状态的 AI 消息泡。
3.  发起 `POST /api/conversations/:sessionId/messages` 请求。
4.  **SSE 处理**: 监听 Server-Sent Events 流，实时解析 `data: output` 并追加显示到 UI。
5.  **完成**: 收到 `type: complete` 事件后，重新拉取完整消息历史以同步元数据（如 Git 分支变更）。

**后端处理**:
1.  **API Layer**:
    *   接收消息内容，建立 SSE 连接。
2.  **MessageRouter.handleUserMessage**:
    *   验证会话存在。
    *   如果会话处于 `EXECUTING` 状态，强制转为 `PAUSED`（处理插嘴情况）。
    *   将用户消息存入历史记录。
3.  **ConversationAIService.generateResponse**:
    *   **上下文准备**: 获取当前 Session 的 `workDir`, `projectInfo`。
    *   **AI 调用**: 调用 `NeovateAIService` 执行代码修改或问答。
    *   **代码提交 (Auto-Commit)**:
        *   如果是 **EDIT 模式** 且 AI 生成了代码变更 (`result.changes > 0`)：
        *   调用 `GitService` 执行 `add .` 和 `commit`。
        *   自动 `push` 到远程分支。
    *   **工具调用记录**: 解析 AI 输出中的 Tool Calls 并记录。
4.  **流式响应**:
    *   后端将 AI 输出解析为可读文本，分块 (Chunk) 写入 SSE 流。
5.  **状态同步**:
    *   `messageRouter.handleAIResponse`: 保存 AI 消息，并更新 Session Context 中的 `gitBranch` 或 `mrUrl` (如果 AI 修改了这些元数据)。

### 2.3 状态与上下文管理

系统需要维护长期的上下文（如当前在哪个分支上工作）。

*   **Git 分支同步**:
    *   `ConversationManager` 在创建时确定初始分支。
    *   AI 响应中如果包含 `metadata.gitBranch`，`MessageRouter` 会更新 Session Context。
    *   前端通过轮询或消息响应更新 UI 上的分支显示。
*   **User Worktree**:
    *   每个用户在每个项目下拥有独立的 Worktree，避免多人协作冲突。
    *   `WorktreeManager` 负责在会话开始时准备这个环境。

## 3. 关键服务职责说明

### ConversationManager
*   **职责**: 会话 CRUD、Git/Worktree 环境初始化、锁管理。
*   **关键方法**:
    *   `createSession`: 编排创建流程。
    *   `handleEditModeSetup`: 处理复杂的 Worktree/Git 分支逻辑。
    *   `switchBranch`: 支持在对话中切换 Git 分支。

### MessageRouter
*   **职责**: 消息流转控制、人机交互状态机。
*   **关键方法**:
    *   `handleUserMessage`: 记录用户输入。
    *   `pauseForUserInput`: 当 AI 需要澄清时（Human-in-the-Loop），挂起会话。
    *   `resumeExecution`: 用户回复后恢复会话。

### ConversationAIService
*   **职责**: AI 逻辑封装、代码变更执行。
*   **关键方法**:
    *   `generateResponse`: 核心入口，调用大模型。
    *   `commitChanges`: 自动执行 Git 提交和推送。
    *   `detectRisks`: (预留) 检测危险操作并生成警告。

## 4. 前端组件交互

*   **App.tsx**: 负责全局路由和侧边栏状态。通过监听 URL (`/chat/:id`) 来高亮当前会话。
*   **ConversationView.tsx**:
    *   **Landing Mode**: 无 `sessionId` 时显示欢迎页和输入框。
    *   **Chat Mode**: 有 `sessionId` 时显示 `MessageList` 和输入框。
    *   **Header**: 展示当前分支、MR 链接、预览按钮 (调用 Deployment Service)。

---
*文档更新时间: 2025-12-24*
