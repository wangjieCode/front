# SSE 流式响应实现

## 概述

实现了基于 SSE (Server-Sent Events) 的流式响应，替代原有的一次性 JSON 响应，提供打字机效果的用户体验。

## 关键问题修复

### 问题：neovate 输出被截断
- **现象**：使用 `--output-format json` 时，输出被截断在 7910 字节
- **原因**：`json` 格式返回单个大 JSON 数组，可能触发某些缓冲限制
- **解决方案**：改用 `--output-format stream-json`，每行输出一个 JSON 对象
- **结果**：成功获取完整的 49KB+ 输出

## 主要改进

### 1. 后端改进

#### 修改文件：`backend/src/api/conversationRoutes.ts`

**核心变更：**

1. **添加 AI 响应解析函数**
   - 从复杂的 JSON 结构中提取可读文本
   - 支持多种格式：数组、对象、多行 JSON
   - 提取 `assistant.text` 或 `result.content` 字段

2. **改造消息发送接口**
   - 设置 SSE 响应头（`text/event-stream`）
   - 解析 AI 响应内容
   - 逐字符流式发送（20ms 延迟模拟打字机效果）
   - 发送事件类型：
     - `user_message`: 用户消息确认
     - `chunk`: 内容片段
     - `complete`: 传输完成
     - `error`: 错误信息

**代码示例：**

```typescript
// 设置 SSE 响应头
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

// 流式发送内容
for (let i = 0; i < parsedContent.length; i++) {
  const char = parsedContent[i];
  res.write(`data: ${JSON.stringify({ type: 'chunk', content: char })}\n\n`);
  await new Promise(resolve => setTimeout(resolve, 20));
}
```

### 2. 前端改进

#### 修改文件：`frontend/src/components/ConversationView.tsx`

**核心变更：**

1. **立即显示用户消息**
   - 发送前先在界面添加用户消息
   - 创建临时 AI 消息占位

2. **SSE 流式接收**
   - 使用 `fetch` + `ReadableStream` 读取 SSE 响应
   - 解析 `data:` 格式的事件
   - 实时更新 AI 消息内容（打字机效果）
   - 完成后重新加载完整消息

**代码示例：**

```typescript
const reader = response.body?.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      
      if (data.type === 'chunk') {
        // 更新消息内容
        setMessages(prev => 
          prev.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, content: msg.content + data.content }
              : msg
          )
        );
      }
    }
  }
}
```

### 3. 测试页面

创建了 `backend/public/test-stream.html` 用于测试 SSE 流式响应。

**访问地址：** `http://localhost:3001/test-stream.html`

**功能：**
- 输入会话 ID 和消息内容
- 实时显示流式响应
- 显示状态（发送中、接收中、完成、错误）

## 技术细节

### SSE 事件格式

```
event: chunk
data: {"type":"chunk","content":"你"}

event: chunk
data: {"type":"chunk","content":"好"}

event: complete
data: {"type":"complete"}
```

### 打字机效果参数

- **延迟时间：** 20ms/字符
- **可调整位置：** `conversationRoutes.ts` 第 88 行
- **建议范围：** 10-50ms

```typescript
await new Promise(resolve => setTimeout(resolve, 20)); // 调整此值
```

## 优势

1. **更好的用户体验**
   - 打字机效果，感觉更自然
   - 立即看到响应开始，减少等待焦虑

2. **更好的性能感知**
   - 即使总时间相同，流式响应让用户感觉更快
   - 可以提前看到部分内容

3. **格式化展示**
   - 后端解析复杂 JSON，前端只接收纯文本
   - 前端使用 Markdown 渲染，支持代码高亮

4. **错误处理**
   - 流式传输中断时可以保留已接收内容
   - 明确的错误事件通知

## 后续优化建议

1. **可配置的打字速度**
   - 添加用户设置，允许调整打字速度
   - 或根据内容长度动态调整

2. **更智能的分块**
   - 按句子或段落分块，而不是逐字符
   - 提高传输效率

3. **断点续传**
   - 连接中断时支持从断点继续
   - 保存已接收内容

4. **多消息并发**
   - 支持同时流式传输多个消息
   - 使用消息 ID 区分

## 测试步骤

1. 启动后端：`cd backend && pnpm dev`
2. 启动前端：`cd frontend && pnpm dev`
3. 访问前端创建对话
4. 发送消息，观察打字机效果
5. 或访问测试页面：`http://localhost:3001/test-stream.html`

## 注意事项

- SSE 连接需要保持打开状态，注意超时设置
- Nginx 等反向代理需要禁用缓冲：`X-Accel-Buffering: no`
- 移动网络可能不稳定，需要处理重连
