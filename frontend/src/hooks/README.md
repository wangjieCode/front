# 流式消息 Hooks 使用指南

## 概述

本模块提供了三个 React Hooks 用于实现流式消息功能：

1. `useSSEStream` - SSE 流式接收
2. `useTypewriter` - 打字机效果
3. `useStreamingMessage` - 组合 Hook（推荐使用）

## 快速开始

### 1. 使用 useStreamingMessage（推荐）

最简单的方式是使用组合 Hook：

```tsx
import { useStreamingMessage } from './hooks/useStreamingMessage';

function MessageDisplay({ sessionId, messageId }) {
  const { displayedContent, isComplete, error } = useStreamingMessage(
    sessionId,
    messageId
  );

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <p>{displayedContent}</p>
      {!isComplete && <span>...</span>}
    </div>
  );
}
```

### 2. 使用 StreamingMessage 组件

或者直接使用封装好的组件：

```tsx
import StreamingMessage from './components/StreamingMessage';
import './components/StreamingMessage.css';

function ChatMessage({ sessionId, messageId }) {
  return (
    <StreamingMessage
      sessionId={sessionId}
      messageId={messageId}
      enableTypewriter={true}
      showControls={true}
      onComplete={() => console.log('Message complete!')}
      onError={(error) => console.error('Error:', error)}
    />
  );
}
```

## API 参考

### useStreamingMessage

组合 Hook，提供完整的流式消息功能。

```typescript
const {
  rawContent,        // 原始内容（SSE 接收到的）
  displayedContent,  // 显示内容（打字机效果后的）
  isComplete,        // 是否完全完成
  sseComplete,       // SSE 是否完成
  isTyping,          // 是否正在打字
  isPaused,          // 是否暂停
  isConnected,       // SSE 是否连接
  progress,          // 打字进度（0-100）
  error,             // 错误信息
  reconnectAttempts, // 重连次数
  reconnect,         // 重连方法
  pause,             // 暂停打字机
  resume,            // 恢复打字机
  skip,              // 跳过打字机效果
  disconnect,        // 断开 SSE 连接
  reset,             // 重置所有状态
} = useStreamingMessage(sessionId, messageId, config);
```

**配置选项：**

```typescript
interface StreamingMessageConfig {
  sse?: {
    reconnect?: boolean;              // 是否自动重连，默认 true
    reconnectInterval?: number;       // 重连间隔（毫秒），默认 3000
    maxReconnectAttempts?: number;    // 最大重连次数，默认 3
    onChunk?: (chunk: string) => void;
    onComplete?: () => void;
    onError?: (error: string) => void;
    onHeartbeat?: () => void;
  };
  typewriter?: {
    speed?: number;           // 字符显示速度（毫秒/字符），默认 30
    minSpeed?: number;        // 最小速度，默认 10
    maxSpeed?: number;        // 最大速度，默认 100
    pauseOnScroll?: boolean;  // 滚动时暂停，默认 true
    autoScroll?: boolean;     // 自动滚动，默认 true
    enabled?: boolean;        // 是否启用打字机效果，默认 true
  };
}
```

### useSSEStream

仅处理 SSE 流式接收。

```typescript
const {
  content,           // 接收到的内容
  isComplete,        // 是否完成
  error,             // 错误信息
  isConnected,       // 是否连接
  reconnectAttempts, // 重连次数
  reconnect,         // 重连方法
  disconnect,        // 断开连接
  reset,             // 重置状态
} = useSSEStream(sessionId, messageId, config);
```

### useTypewriter

仅处理打字机效果。

```typescript
const {
  displayedContent,  // 显示的内容
  isTyping,          // 是否正在打字
  isPaused,          // 是否暂停
  progress,          // 进度（0-100）
  pause,             // 暂停
  resume,            // 恢复
  skip,              // 跳过
  reset,             // 重置
} = useTypewriter(content, config);
```

## 使用示例

### 示例 1：基本用法

```tsx
function BasicExample() {
  const [sessionId] = useState('session-123');
  const [messageId] = useState('message-456');

  const { displayedContent, isComplete } = useStreamingMessage(
    sessionId,
    messageId
  );

  return (
    <div>
      <p>{displayedContent}</p>
      {isComplete && <span>✓</span>}
    </div>
  );
}
```

### 示例 2：自定义配置

```tsx
function CustomConfigExample() {
  const { displayedContent, isTyping, skip } = useStreamingMessage(
    sessionId,
    messageId,
    {
      sse: {
        reconnect: true,
        maxReconnectAttempts: 5,
        onComplete: () => console.log('Stream complete!'),
      },
      typewriter: {
        speed: 50,
        autoScroll: true,
        pauseOnScroll: false,
      },
    }
  );

  return (
    <div>
      <p>{displayedContent}</p>
      {isTyping && (
        <button onClick={skip}>跳过动画</button>
      )}
    </div>
  );
}
```

### 示例 3：错误处理

```tsx
function ErrorHandlingExample() {
  const {
    displayedContent,
    error,
    reconnectAttempts,
    reconnect,
  } = useStreamingMessage(sessionId, messageId, {
    sse: {
      onError: (err) => {
        console.error('Stream error:', err);
        // 可以在这里显示通知
      },
    },
  });

  if (error) {
    return (
      <div className="error">
        <p>错误: {error}</p>
        {reconnectAttempts < 3 && (
          <button onClick={reconnect}>重试</button>
        )}
      </div>
    );
  }

  return <p>{displayedContent}</p>;
}
```

### 示例 4：控制打字机

```tsx
function ControlledTypewriterExample() {
  const {
    displayedContent,
    isTyping,
    isPaused,
    progress,
    pause,
    resume,
    skip,
  } = useStreamingMessage(sessionId, messageId);

  return (
    <div>
      <p>{displayedContent}</p>
      
      {isTyping && (
        <div className="controls">
          {isPaused ? (
            <button onClick={resume}>继续</button>
          ) : (
            <button onClick={pause}>暂停</button>
          )}
          <button onClick={skip}>跳过</button>
          <div className="progress">{progress.toFixed(0)}%</div>
        </div>
      )}
    </div>
  );
}
```

### 示例 5：聊天消息列表

```tsx
function ChatMessageList({ messages }) {
  return (
    <div className="message-list">
      {messages.map((msg) => (
        <div key={msg.id} className="message">
          <div className="author">{msg.author}</div>
          {msg.isStreaming ? (
            <StreamingMessage
              sessionId={msg.sessionId}
              messageId={msg.id}
              enableTypewriter={true}
            />
          ) : (
            <div className="content">{msg.content}</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

## 环境变量

在 `.env` 文件中配置 API 地址：

```env
VITE_API_URL=http://localhost:3001
```

## 最佳实践

1. **使用 useStreamingMessage**：大多数情况下使用组合 Hook 即可
2. **错误处理**：始终处理 error 状态
3. **清理资源**：组件卸载时 Hook 会自动清理
4. **禁用打字机**：对于历史消息，设置 `enabled: false`
5. **自定义速度**：根据内容长度调整打字速度

## 故障排查

### 连接失败
- 检查 `VITE_API_URL` 是否正确
- 确认后端 SSE 端点正常运行
- 检查浏览器控制台的网络请求

### 打字机不工作
- 确认 `enabled: true`
- 检查 `speed` 配置是否合理
- 查看浏览器控制台是否有错误

### 自动滚动不工作
- 确认容器有 `.message-container` 或 `.chat-container` 类名
- 或者手动设置 `scrollContainerRef`

## 性能优化

1. **禁用不需要的功能**：历史消息不需要打字机效果
2. **调整速度**：根据内容长度动态调整
3. **减少重渲染**：使用 `React.memo` 包装组件
4. **虚拟滚动**：消息列表很长时使用虚拟滚动
