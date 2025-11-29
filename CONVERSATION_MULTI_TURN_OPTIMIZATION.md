# 多次连续对话交互优化

## 问题描述

前端在处理多次连续对话时，只能正确解析首次响应，后续的 AI 响应无法正确显示。

## 根本原因

AI 服务返回的响应采用 **stream-json** 格式（换行符分隔的 JSON 对象），前端需要从中提取 `type: "result"` 的消息内容，但之前的实现只在任务结果展示中处理了这种格式，对话消息列表中没有进行解析。

## 解决方案

### 1. 优化 TaskExecutionView 组件

**文件**: `frontend/src/components/TaskExecutionView.tsx`

**改动**:
- 在对话消息渲染时，添加 stream-json 格式解析逻辑
- 从多行 JSON 中提取 `type: "result"` 的消息内容
- 添加调试日志，便于追踪消息流转

```typescript
// 解析 AI 消息内容
if (msg.role === 'assistant') {
  try {
    const lines = msg.content.trim().split('\n').filter(line => line.trim());
    
    // 查找 result 类型的消息
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'result' && parsed.content) {
          displayContent = parsed.content;
          break;
        }
      } catch (e) {
        // 跳过无法解析的行
      }
    }
  } catch (e) {
    // 保持原始内容
  }
}
```

### 2. 优化 MessageList 组件

**文件**: `frontend/src/components/MessageList.tsx`

**改动**:
- 添加 `parseAIContent` 函数，统一处理 AI 消息的解析
- 在渲染消息前，对非用户消息进行格式解析
- 保持向后兼容，纯文本消息仍能正常显示

```typescript
const parseAIContent = (content: string): string => {
  try {
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'result' && parsed.content) {
          return parsed.content;
        }
      } catch (e) {
        // 跳过无法解析的行
      }
    }
  } catch (e) {
    // 解析失败，返回原始内容
  }
  
  return content;
};
```

### 3. 添加调试日志

在 `handleSendMessage` 函数中添加日志：
- 记录发送的消息内容
- 记录后端返回的响应
- 记录消息列表更新情况

## Stream-JSON 格式说明

Neovate AI 返回的响应有两种格式：

### 格式 1: 对象格式（每行一个 JSON 对象）
```json
{"type":"thinking","content":"正在分析你的问题..."}
{"type":"progress","step":"analyzing","message":"分析代码结构"}
{"type":"result","content":"我已经完成了代码修改","subtype":"success"}
{"sessionId":"neovate-session-123"}
```

### 格式 2: 数组格式（每行一个 JSON 数组）
```json
[{"type":"system","subtype":"init","sessionId":"cf00503d","model":"qwen","cwd":"/workspace"}]
[{"type":"thinking","content":"分析中..."}]
[{"type":"result","content":"我已经完成了修改","subtype":"success"}]
```

前端解析逻辑会自动处理这两种格式，提取 `type: "result"` 的消息，其 `content` 字段包含最终的 AI 响应。

## 测试

创建了测试页面 `frontend/test-conversation-parsing.html`，包含三个测试用例：

1. **测试 1**: 解析标准 stream-json 格式
2. **测试 2**: 解析纯文本格式（向后兼容）
3. **测试 3**: 解析混合格式

在浏览器中打开测试页面，所有测试应该通过。

## 验证步骤

1. 启动后端服务：
   ```bash
   cd backend
   pnpm run dev
   ```

2. 启动前端服务：
   ```bash
   cd frontend
   pnpm run dev
   ```

3. 创建一个任务并等待完成

4. 在对话输入框中发送多条消息，验证：
   - 用户消息正确显示
   - AI 响应正确解析并显示
   - 多次对话都能正常工作
   - 消息历史完整保留

## 技术细节

### 后端流程

1. 用户发送消息 → `POST /api/conversations/:sessionId/messages`
2. 后端调用 `messageRouter.handleUserMessage()` 保存用户消息
3. 后端调用 `aiService.generateResponse()` 生成 AI 响应
4. AI 服务调用 Neovate，获取 stream-json 格式的输出
5. 后端调用 `messageRouter.handleAIResponse()` 保存 AI 消息
6. 返回完整的消息列表（包括新的用户消息和 AI 响应）

### 前端流程

1. 用户输入消息 → `handleSendMessage()`
2. 发送 POST 请求到后端
3. 接收完整的消息列表
4. 更新 `conversationMessages` 状态
5. 渲染消息列表时，对 AI 消息进行格式解析
6. 显示解析后的内容

## 注意事项

1. **向后兼容**: 如果 AI 响应不是 stream-json 格式，会直接显示原始内容
2. **错误处理**: 解析失败时不会抛出异常，而是返回原始内容
3. **性能**: 解析逻辑在渲染时执行，对于大量消息可能需要优化（可以考虑在接收时就解析并缓存）

## 未来改进

1. **流式显示**: 支持实时流式显示 AI 响应，而不是等待完整响应
2. **消息缓存**: 解析后的消息内容可以缓存，避免重复解析
3. **类型定义**: 为 stream-json 格式添加 TypeScript 类型定义
4. **错误提示**: 当解析失败时，给用户友好的错误提示
