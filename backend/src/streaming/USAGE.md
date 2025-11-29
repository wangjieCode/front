# SSE 流式响应使用指南

## 概述

本模块实现了基于 Server-Sent Events (SSE) 的流式响应功能，用于实时推送 AI 生成的内容到前端。

## 架构

```
客户端 → SSE 连接 → StreamingResponseManager → 内容推送 → 客户端接收
```

## 后端使用

### 1. 启动流式响应

```typescript
import { streamingManager } from './streaming/StreamingResponseManager';
import express from 'express';

const app = express();

// SSE 路由
app.get('/api/conversations/:sessionId/messages/:messageId/stream', async (req, res) => {
  const { sessionId, messageId } = req.params;

  // 建立 SSE 连接
  await streamingManager.startStream(sessionId, messageId, res);

  // 处理客户端断开
  req.on('close', () => {
    streamingManager.abortStream(messageId);
  });
});
```

### 2. 推送内容

```typescript
// 逐步推送内容
await streamingManager.appendContent(messageId, 'Hello');
await streamingManager.appendContent(messageId, ' World');
await streamingManager.appendContent(messageId, '!');

// 完成推送
await streamingManager.completeStream(messageId);
```

### 3. 完整示例：AI 响应流式推送

```typescript
import { streamingManager } from './streaming/StreamingResponseManager';
import { DrizzleConversationStorage } from './storage/DrizzleConversationStorage';

async function streamAIResponse(sessionId: string, messageId: string, prompt: string) {
  const storage = new DrizzleConversationStorage();

  // 1. 创建占位消息
  await storage.saveMessage({
    id: messageId,
    conversationId: sessionId,
    branchId: 'main-branch',
    role: 'assistant',
    content: '',
    isComplete: false,
    timestamp: new Date(),
  });

  // 2. 调用 AI API（模拟）
  const aiResponse = 'This is a simulated AI response that will be streamed.';
  const words = aiResponse.split(' ');

  // 3. 逐词推送
  let fullContent = '';
  for (const word of words) {
    const chunk = word + ' ';
    fullContent += chunk;

    // 推送到客户端
    await streamingManager.appendContent(messageId, chunk);

    // 更新数据库
    await storage.updateMessageContent(messageId, fullContent, false);

    // 模拟延迟
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // 4. 完成流式响应
  await streamingManager.completeStream(messageId);

  // 5. 更新数据库为完成状态
  await storage.updateMessageContent(messageId, fullContent.trim(), true);
}
```

### 4. 查询流式状态

```typescript
const state = streamingManager.getStreamState(messageId);

if (state) {
  console.log('Content length:', state.content.length);
  console.log('Is complete:', state.isComplete);
  console.log('Last update:', state.lastUpdateAt);
}
```

### 5. 中断流式响应

```typescript
await streamingManager.abortStream(messageId, 'User cancelled');
```

## 前端使用

### 1. 建立 SSE 连接

```typescript
const eventSource = new EventSource(
  `/api/conversations/${sessionId}/messages/${messageId}/stream`
);

// 监听内容片段
eventSource.addEventListener('chunk', (event) => {
  const data = JSON.parse(event.data);
  console.log('Received chunk:', data.data);
  // 更新 UI
  appendToMessage(data.data);
});

// 监听完成事件
eventSource.addEventListener('complete', (event) => {
  console.log('Stream completed');
  eventSource.close();
});

// 监听错误事件
eventSource.addEventListener('error', (event) => {
  const data = JSON.parse(event.data);
  console.error('Stream error:', data.data);
  eventSource.close();
});

// 监听心跳
eventSource.addEventListener('heartbeat', (event) => {
  console.log('Heartbeat received');
});
```

### 2. React Hook 示例

```typescript
import { useEffect, useState } from 'react';

function useSSEStream(sessionId: string, messageId: string) {
  const [content, setContent] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/conversations/${sessionId}/messages/${messageId}/stream`
    );

    eventSource.addEventListener('chunk', (event) => {
      const data = JSON.parse(event.data);
      setContent((prev) => prev + data.data);
    });

    eventSource.addEventListener('complete', () => {
      setIsComplete(true);
      eventSource.close();
    });

    eventSource.addEventListener('error', (event) => {
      const data = JSON.parse(event.data);
      setError(data.data);
      eventSource.close();
    });

    return () => {
      eventSource.close();
    };
  }, [sessionId, messageId]);

  return { content, isComplete, error };
}

// 使用
function MessageDisplay({ sessionId, messageId }) {
  const { content, isComplete, error } = useSSEStream(sessionId, messageId);

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <p>{content}</p>
      {!isComplete && <span>...</span>}
    </div>
  );
}
```

## API 端点

### SSE 流式端点
```
GET /api/conversations/:sessionId/messages/:messageId/stream
```

### 查询流式状态
```
GET /api/streaming/status/:messageId
```

### 查询活跃流
```
GET /api/streaming/active
```

### 中断流
```
POST /api/streaming/abort/:messageId
Body: { "reason": "User cancelled" }
```

## 配置

```typescript
import { StreamingResponseManager } from './streaming/StreamingResponseManager';

const manager = new StreamingResponseManager({
  heartbeatInterval: 30000, // 心跳间隔（毫秒）
  connectionTimeout: 60000, // 连接超时（毫秒）
});
```

## SSE 事件类型

- `chunk` - 内容片段
- `complete` - 流式完成
- `error` - 错误
- `heartbeat` - 心跳（保持连接）

## 最佳实践

1. **错误处理**：始终监听 error 事件
2. **连接清理**：组件卸载时关闭 EventSource
3. **心跳监控**：利用心跳检测连接状态
4. **重连机制**：实现自动重连逻辑
5. **内容累积**：在客户端累积内容片段

## 故障排查

### 连接立即关闭
- 检查 SSE 响应头是否正确设置
- 确认没有中间件缓冲响应

### 内容不更新
- 检查 `res.write()` 是否正确调用
- 确认 SSE 格式正确（`event: type\ndata: json\n\n`）

### 连接超时
- 增加 `connectionTimeout` 配置
- 确保定期发送心跳

### 内存泄漏
- 确保流完成后调用 `completeStream()` 或 `abortStream()`
- 检查是否有未清理的定时器
