# Query 任务使用指南

## 概述

Query 任务是系统的只读模式，允许用户通过自然语言查询代码库，AI 会分析代码并返回详细的答案，而不会修改任何代码。

## 使用场景

### 1. 了解代码功能

**示例**：
```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt":"/dataCenter 页面的作用是什么？","type":"query"}'
```

**AI 会**：
- 读取相关的代码文件
- 分析页面结构和功能
- 返回详细的功能说明

### 2. 查询 API 用法

**示例**：
```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt":"TaskManager 类有哪些方法？","type":"query"}'
```

**AI 会**：
- 查找 TaskManager 类的定义
- 列出所有公共方法
- 说明每个方法的用途

### 3. 分析代码结构

**示例**：
```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt":"分析 backend/src/services 目录下的所有服务类","type":"query"}'
```

**AI 会**：
- 遍历指定目录
- 分析每个服务类的职责
- 总结服务之间的关系

### 4. 理解业务逻辑

**示例**：
```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt":"订单创建的完整流程是什么？","type":"query"}'
```

**AI 会**：
- 追踪订单创建的代码路径
- 分析涉及的组件和服务
- 描述完整的业务流程

## 与编辑模式的区别

| 特性 | Query 模式（只读） | Code Change 模式（编辑） |
|------|-------------------|------------------------|
| 修改代码 | ❌ 否 | ✅ 是 |
| 创建分支 | ❌ 否 | ✅ 是 |
| 创建 MR | ❌ 否 | ✅ 是 |
| 返回结果 | AI 的分析答案 | MR 链接 + 代码变更 |
| 执行时间 | 较快（只读取） | 较慢（需要修改和提交） |
| 适用场景 | 学习、理解代码 | 开发、修改功能 |

## 执行流程

```
用户发送 Query 请求
    ↓
系统创建任务
    ↓
连接 SSH（如果是远程模式）
    ↓
准备工作区
    ↓
调用 AI 工具（只读模式）
    ↓
AI 读取相关文件
    ↓
AI 分析代码
    ↓
返回分析结果
    ↓
保存到任务结果
    ↓
前端展示答案
```

## 结果格式

Query 任务的结果是 neovate 的 stream-json 格式输出，包含：

### 1. 系统初始化消息
```json
{
  "type": "system",
  "subtype": "init",
  "sessionId": "xxx",
  "model": "iflow/qwen3-coder-plus",
  "cwd": "/path/to/workspace",
  "tools": ["read", "ls", "grep", ...]
}
```

### 2. AI 思考过程
```json
{
  "role": "assistant",
  "type": "message",
  "text": "Let me check the file...",
  "content": [
    {
      "type": "tool_use",
      "name": "read",
      "input": {"file_path": "/path/to/file"}
    }
  ]
}
```

### 3. 工具执行结果
```json
{
  "role": "tool",
  "type": "message",
  "content": [
    {
      "type": "tool-result",
      "toolName": "read",
      "result": {
        "returnDisplay": "Read 100 lines",
        "llmContent": "..."
      }
    }
  ]
}
```

### 4. 最终答案
```json
{
  "type": "result",
  "subtype": "success",
  "isError": false,
  "content": "The /dataCenter page serves as a dashboard..."
}
```

前端会自动解析这些消息，提取最终的 `result` 消息并展示给用户。

## 前端展示

在前端界面中，Query 任务的结果会以对话形式展示：

1. **用户请求**：显示在右侧的聊天气泡中
2. **AI 响应**：显示在左侧的卡片中
3. **状态指示**：显示任务状态（思考中、执行中、已完成）
4. **结果展示**：解析 stream-json 并展示最终答案

## 故障排查

### 问题 1: 任务返回用户输入

**症状**：Query 任务的结果就是用户的输入，没有 AI 的分析

**原因**：旧版本的 bug，没有调用 AI 工具

**解决方案**：
- 确保使用最新版本的代码
- 检查 `TaskOrchestrator.ts` 中的 query 分支是否调用了 `step3_QueryCode`

### 问题 2: AI 工具不可用

**症状**：任务失败，错误信息为"代码工具 neovate 不可用"

**原因**：neovate 未安装或不在 PATH 中

**解决方案**：
```bash
# 检查 neovate 是否安装
which neovate

# 如果未安装，请联系管理员安装
```

### 问题 3: 结果无法解析

**症状**：前端显示原始的 JSON 输出，而不是格式化的答案

**原因**：前端解析逻辑问题

**解决方案**：
- 检查 `TaskExecutionView.tsx` 中的结果解析逻辑
- 确保能够正确提取 `type: 'result'` 的消息

### 问题 4: 执行超时

**症状**：任务长时间处于"执行中"状态

**原因**：
- AI 工具响应慢
- 查询的代码库太大
- 网络问题

**解决方案**：
- 缩小查询范围，使用更具体的问题
- 检查网络连接
- 查看任务日志了解详细情况

## 最佳实践

### 1. 使用具体的问题

❌ **不好**：
```
"这个项目是做什么的？"
```

✅ **好**：
```
"/dataCenter 页面的作用是什么？"
"TaskManager 类的 createTask 方法如何工作？"
```

### 2. 指定文件或目录

❌ **不好**：
```
"有哪些服务？"
```

✅ **好**：
```
"backend/src/services 目录下有哪些服务类？"
```

### 3. 分步查询

对于复杂的问题，分成多个小问题：

```
1. "TaskManager 类有哪些方法？"
2. "TaskManager 的 createTask 方法如何工作？"
3. "TaskManager 如何与 TaskOrchestrator 交互？"
```

### 4. 利用上下文

如果 AI 已经读取了某个文件，可以继续追问：

```
1. "读取 TaskManager.ts 文件"
2. "这个类的主要职责是什么？"
3. "它如何管理任务状态？"
```

## API 参考

### 创建 Query 任务

**端点**：`POST /api/tasks`

**请求体**：
```json
{
  "prompt": "你的问题",
  "type": "query"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "task-id",
    "prompt": "你的问题",
    "type": "query",
    "status": "pending",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 获取任务结果

**端点**：`GET /api/tasks/:id`

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "task-id",
    "prompt": "你的问题",
    "type": "query",
    "status": "success",
    "result": "AI 的分析结果（stream-json 格式）",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "completedAt": "2024-01-01T00:00:10.000Z"
  }
}
```

### 获取任务日志

**端点**：`GET /api/tasks/:id/logs`

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2024-01-01T00:00:00.000Z",
      "level": "info",
      "source": "system",
      "message": "📋 只读模式：查询代码库"
    },
    {
      "timestamp": "2024-01-01T00:00:01.000Z",
      "level": "info",
      "source": "codetool",
      "message": "🤖 正在使用 neovate 查询代码库..."
    }
  ],
  "total": 10
}
```

## 总结

Query 任务是一个强大的代码学习和理解工具，它允许你：

- ✅ 快速了解代码功能
- ✅ 学习 API 用法
- ✅ 分析代码结构
- ✅ 理解业务逻辑
- ✅ 无需担心修改代码

通过合理使用 Query 任务，可以大大提高代码理解效率，加速开发学习过程。
