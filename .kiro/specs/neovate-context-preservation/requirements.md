# 需求文档

## 简介

本功能旨在让 Neovate AI 代理在多轮对话中保留上下文，使得用户可以在同一个会话中进行连续的代码修改和查询，而不需要每次都重新提供背景信息。

## 术语表

- **Neovate**: 一个 AI 代码助手工具，支持通过命令行进行代码修改和查询
- **会话 (Session)**: Neovate 的一次完整交互过程，包含多轮对话
- **会话 ID (Session ID)**: Neovate 工具返回的唯一标识一个 Neovate 会话的字符串
- **任务 ID (Task ID)**: 系统中唯一标识一个任务的字符串
- **上下文 (Context)**: 会话中累积的历史对话信息，包括之前的提示词、AI 响应和代码变更
- **NeovateProvider**: 系统中封装 Neovate 命令行工具的服务类
- **会话映射 (Session Mapping)**: 任务 ID 到 Neovate 会话 ID 的映射关系

## 需求

### 需求 1

**用户故事:** 作为开发者，我希望在与 Neovate 的多轮对话中保留上下文，这样我可以进行连续的代码修改而不需要重复说明背景。

#### 验收标准

1. WHEN 用户在同一个任务中发送第一次请求 THEN NeovateProvider SHALL 不使用会话恢复参数调用 Neovate
2. WHEN Neovate 第一次执行完成 THEN 系统 SHALL 从输出中提取 Neovate 会话 ID 并与任务 ID 关联保存
3. WHEN 用户在同一个任务中发送第二次及后续请求 THEN NeovateProvider SHALL 使用 `--resume <session-id>` 参数调用 Neovate
4. WHEN 用户开始一个新的任务 THEN 系统 SHALL 创建新的 Neovate 会话映射记录
5. WHEN 用户在任务中切换工作目录 THEN 系统 SHALL 开始一个新的 Neovate 会话
6. WHEN 会话恢复失败 THEN 系统 SHALL 自动开始一个新会话并通知用户

### 需求 2

**用户故事:** 作为开发者，我希望系统能够自动管理 Neovate 会话的生命周期，这样我不需要手动处理会话 ID。

#### 验收标准

1. WHEN 任务开始时 THEN 系统 SHALL 为该任务创建一个新的 Neovate 会话映射记录
2. WHEN 任务完成或失败时 THEN 系统 SHALL 保留 Neovate 会话记录以供查看历史
3. WHEN 系统重启时 THEN 系统 SHALL 能够从持久化存储中恢复任务 ID 到 Neovate 会话 ID 的映射关系
4. WHEN 多个任务并发执行时 THEN 系统 SHALL 正确隔离每个任务的 Neovate 会话

### 需求 3

**用户故事:** 作为开发者，我希望能够查看和管理 Neovate 会话映射，这样我可以了解任务与 Neovate 会话的关联关系。

#### 验收标准

1. WHEN 用户请求查看任务的 Neovate 会话信息时 THEN 系统 SHALL 返回该任务关联的 Neovate 会话 ID 和相关元数据
2. WHEN 用户请求重置任务的 Neovate 会话时 THEN 系统 SHALL 删除对应的会话映射并在下次执行时创建新会话
3. WHEN 系统保存会话映射时 THEN 系统 SHALL 包含任务 ID、Neovate 会话 ID、创建时间、最后使用时间和工作目录

### 需求 4

**用户故事:** 作为开发者，我希望系统在调用 Neovate 时正确传递 API 密钥，这样 Neovate 能够正常访问 AI 服务。

#### 验收标准

1. WHEN 系统执行 Neovate 命令时 THEN 系统 SHALL 在命令执行前通过 export 设置 IFLOW_API_KEY 环境变量
2. WHEN 系统从配置文件读取 IFLOW_API_KEY 时 THEN 系统 SHALL 将其传递给命令执行器
3. WHEN IFLOW_API_KEY 未配置时 THEN 系统 SHALL 记录警告并尝试执行命令
4. WHEN Neovate 因 API 密钥问题失败时 THEN 系统 SHALL 返回明确的错误信息提示用户检查 IFLOW_API_KEY

### 需求 5

**用户故事:** 作为系统管理员，我希望系统能够处理 Neovate 会话的异常情况，这样系统能够保持稳定运行。

#### 验收标准

1. WHEN Neovate 命令执行超时时 THEN 系统 SHALL 终止该会话并记录错误
2. WHEN Neovate 返回无效的会话 ID 时 THEN 系统 SHALL 忽略该 ID 并继续使用旧 ID 或创建新会话
3. WHEN 会话 ID 文件损坏时 THEN 系统 SHALL 重新初始化会话存储
4. WHEN 系统检测到会话泄漏时 THEN 系统 SHALL 自动清理超过 24 小时未使用的会话记录
