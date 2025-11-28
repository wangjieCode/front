# Agent 对话式 UI 设计文档

## 概述

本设计文档描述如何将任务执行界面改造为 Agent 对话式交互，展示 neovate AI 代码助手的完整工作流程。

## 架构

### 整体架构

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Frontend  │◄────────│   WebSocket  │◄────────│   Backend   │
│             │  实时消息 │              │  解析输出 │             │
│ - 对话组件   │         │              │         │ - neovate   │
│ - 消息渲染   │         │              │         │ - 消息解析   │
└─────────────┘         └──────────────┘         └─────────────┘
```

## 数据模型

### 消息类型定义

```typescript
// 消息基础类型
interface BaseMessage {
  id: string;
  timestamp: string;
  sessionId: string;
}

// 系统初始化消息
interface SystemMessage extends BaseMessage {
  type: 'system';
  subtype: 'init';
  model: string;
  cwd: string;
  tools: string[];
}

// AI 助手消息
interface AssistantMessage extends BaseMessage {
  type: 'assistant';
  role: 'assistant';
  uuid: string;
  parentUuid: string;
  text: string;
  content: MessageContent[];
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// 消息内容（文本或工具调用）
type MessageContent = TextContent | ToolUseContent;

interface TextContent {
  type: 'text';
  text: string;
}

interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
  description?: string;
}

// 工具执行结果消息
interface ToolMessage extends BaseMessage {
  type: 'tool';
  role: 'tool';
  uuid: string;
  parentUuid: string;
  content: ToolResultContent[];
}

interface ToolResultContent {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  input: Record<string, any>;
  result: {
    returnDisplay: string;
    llmContent?: string;
  };
}

// 最终结果消息
interface ResultMessage extends BaseMessage {
  type: 'result';
  subtype: 'success' | 'error';
  isError: boolean;
  content: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// 联合类型
type ConversationMessage = 
  | SystemMessage 
  | AssistantMessage 
  | ToolMessage 
  | ResultMessage;
```

## 组件设计

### 1. AgentConversationViewer 组件

主对话展示组件，负责渲染整个对话流。

```typescript
interface AgentConversationViewerProps {
  messages: ConversationMessage[];
  loading?: boolean;
}

const AgentConversationViewer: React.FC<AgentConversationViewerProps> = ({
  messages,
  loading
}) => {
  return (
    <div className="agent-conversation">
      {messages.map(message => (
        <MessageRenderer key={message.id} message={message} />
      ))}
      {loading && <LoadingIndicator />}
    </div>
  );
};
```

### 2. MessageRenderer 组件

根据消息类型渲染不同的消息组件。

```typescript
const MessageRenderer: React.FC<{ message: ConversationMessage }> = ({ message }) => {
  switch (message.type) {
    case 'system':
      return <SystemMessageView message={message} />;
    case 'assistant':
      return <AssistantMessageView message={message} />;
    case 'tool':
      return <ToolMessageView message={message} />;
    case 'result':
      return <ResultMessageView message={message} />;
    default:
      return null;
  }
};
```

### 3. SystemMessageView 组件

展示系统初始化信息。

```tsx
const SystemMessageView: React.FC<{ message: SystemMessage }> = ({ message }) => {
  return (
    <div className="message system-message">
      <div className="message-header">
        <RobotOutlined /> 系统初始化
      </div>
      <div className="message-content">
        <div><strong>模型:</strong> {message.model}</div>
        <div><strong>工作目录:</strong> {message.cwd}</div>
        <div><strong>可用工具:</strong> {message.tools.join(', ')}</div>
      </div>
    </div>
  );
};
```

### 4. AssistantMessageView 组件

展示 AI 的思考和工具调用。

```tsx
const AssistantMessageView: React.FC<{ message: AssistantMessage }> = ({ message }) => {
  return (
    <div className="message assistant-message">
      <div className="message-header">
        <RobotOutlined /> AI 助手
        <span className="timestamp">{formatTime(message.timestamp)}</span>
      </div>
      
      {/* AI 思考文本 */}
      {message.text && (
        <div className="thinking-text">
          <ReactMarkdown>{message.text}</ReactMarkdown>
        </div>
      )}
      
      {/* 工具调用 */}
      {message.content.map((content, index) => {
        if (content.type === 'tool_use') {
          return (
            <ToolUseView 
              key={content.id} 
              toolUse={content} 
            />
          );
        }
        return null;
      })}
      
      {/* Token 使用统计 */}
      {message.usage && (
        <div className="usage-info">
          输入: {message.usage.input_tokens} tokens, 
          输出: {message.usage.output_tokens} tokens
        </div>
      )}
    </div>
  );
};
```

### 5. ToolUseView 组件

展示工具调用信息。

```tsx
const ToolUseView: React.FC<{ toolUse: ToolUseContent }> = ({ toolUse }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="tool-use">
      <div className="tool-header" onClick={() => setExpanded(!expanded)}>
        <ToolOutlined /> 
        <strong>{toolUse.name}</strong>
        {toolUse.description && <span>: {toolUse.description}</span>}
        {expanded ? <DownOutlined /> : <RightOutlined />}
      </div>
      
      {expanded && (
        <div className="tool-input">
          <pre>{JSON.stringify(toolUse.input, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
```

### 6. ToolMessageView 组件

展示工具执行结果。

```tsx
const ToolMessageView: React.FC<{ message: ToolMessage }> = ({ message }) => {
  return (
    <div className="message tool-message">
      {message.content.map((result, index) => (
        <ToolResultView key={result.toolCallId} result={result} />
      ))}
    </div>
  );
};

const ToolResultView: React.FC<{ result: ToolResultContent }> = ({ result }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="tool-result">
      <div className="result-header" onClick={() => setExpanded(!expanded)}>
        <CheckCircleOutlined style={{ color: '#52c41a' }} />
        <strong>{result.toolName}</strong> 执行完成
        <span className="result-summary">{result.result.returnDisplay}</span>
        {expanded ? <DownOutlined /> : <RightOutlined />}
      </div>
      
      {expanded && result.result.llmContent && (
        <div className="result-content">
          <pre>{formatToolResult(result.result.llmContent)}</pre>
        </div>
      )}
    </div>
  );
};
```

### 7. ResultMessageView 组件

展示最终结果。

```tsx
const ResultMessageView: React.FC<{ message: ResultMessage }> = ({ message }) => {
  return (
    <div className={`message result-message ${message.isError ? 'error' : 'success'}`}>
      <div className="message-header">
        {message.isError ? (
          <><CloseCircleOutlined /> 执行失败</>
        ) : (
          <><CheckCircleOutlined /> 执行成功</>
        )}
      </div>
      <div className="message-content">
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>
      {message.usage && (
        <div className="usage-summary">
          总计 - 输入: {message.usage.input_tokens} tokens, 
          输出: {message.usage.output_tokens} tokens
        </div>
      )}
    </div>
  );
};
```

## 后端实现

### 消息解析服务

```typescript
export class NeovateMessageParser {
  /**
   * 解析 neovate 的 stream-json 输出
   */
  parseStreamLine(line: string): ConversationMessage | null {
    try {
      const data = JSON.parse(line);
      
      // 系统消息
      if (data.type === 'system' && data.subtype === 'init') {
        return {
          id: generateId(),
          type: 'system',
          subtype: 'init',
          timestamp: new Date().toISOString(),
          sessionId: data.sessionId,
          model: data.model,
          cwd: data.cwd,
          tools: data.tools || []
        };
      }
      
      // AI 助手消息
      if (data.role === 'assistant' && data.type === 'message') {
        return {
          id: generateId(),
          type: 'assistant',
          role: 'assistant',
          timestamp: data.timestamp || new Date().toISOString(),
          sessionId: data.sessionId,
          uuid: data.uuid,
          parentUuid: data.parentUuid,
          text: data.text || '',
          content: data.content || [],
          model: data.model,
          usage: data.usage
        };
      }
      
      // 工具结果消息
      if (data.role === 'tool' && data.type === 'message') {
        return {
          id: generateId(),
          type: 'tool',
          role: 'tool',
          timestamp: data.timestamp || new Date().toISOString(),
          sessionId: data.sessionId,
          uuid: data.uuid,
          parentUuid: data.parentUuid,
          content: data.content || []
        };
      }
      
      // 最终结果消息
      if (data.type === 'result') {
        return {
          id: generateId(),
          type: 'result',
          subtype: data.subtype,
          timestamp: new Date().toISOString(),
          sessionId: data.sessionId,
          isError: data.isError || false,
          content: data.content || '',
          usage: data.usage
        };
      }
      
      return null;
    } catch (error) {
      console.error('[NeovateMessageParser] 解析失败:', error);
      return null;
    }
  }
}
```

### WebSocket 消息发送

```typescript
// 在 NeovateProvider 中
async modifyCodeStream(
  prompt: string,
  workDir: string,
  onData: (data: string) => void,
  onError?: (data: string) => void
): Promise<CodeToolResult> {
  const parser = new NeovateMessageParser();
  
  const result = await this.sshExecutor.executeCommandStream(
    command,
    workDir,
    (data: string) => {
      // 逐行解析
      const lines = data.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const message = parser.parseStreamLine(line);
        if (message) {
          // 发送结构化消息
          onData(JSON.stringify({ type: 'conversation', message }));
        } else {
          // 发送原始数据（兼容旧格式）
          onData(line);
        }
      }
    },
    onError
  );
  
  return result;
}
```

## 样式设计

```scss
.agent-conversation {
  padding: 16px;
  max-height: 600px;
  overflow-y: auto;
  
  .message {
    margin-bottom: 16px;
    padding: 12px;
    border-radius: 8px;
    background: #f5f5f5;
    
    &.system-message {
      background: #e6f7ff;
      border-left: 4px solid #1890ff;
    }
    
    &.assistant-message {
      background: #f0f5ff;
      border-left: 4px solid #597ef7;
    }
    
    &.tool-message {
      background: #f6ffed;
      border-left: 4px solid #52c41a;
    }
    
    &.result-message {
      background: #f0f5ff;
      border-left: 4px solid #52c41a;
      
      &.error {
        background: #fff1f0;
        border-left-color: #ff4d4f;
      }
    }
  }
  
  .message-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    margin-bottom: 8px;
    
    .timestamp {
      margin-left: auto;
      font-size: 12px;
      color: #8c8c8c;
      font-weight: normal;
    }
  }
  
  .thinking-text {
    margin: 8px 0;
    line-height: 1.6;
  }
  
  .tool-use, .tool-result {
    margin: 8px 0;
    padding: 8px;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    
    .tool-header, .result-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .tool-input, .result-content {
      margin-top: 8px;
      padding: 8px;
      background: #fafafa;
      border-radius: 4px;
      
      pre {
        margin: 0;
        font-size: 12px;
        white-space: pre-wrap;
        word-break: break-all;
      }
    }
  }
  
  .usage-info, .usage-summary {
    margin-top: 8px;
    font-size: 12px;
    color: #8c8c8c;
  }
}
```

## 错误处理

1. **解析错误**: 如果某行 JSON 解析失败，记录错误但继续处理后续消息
2. **消息丢失**: 使用 uuid 和 parentUuid 建立消息关联，检测丢失的消息
3. **会话中断**: 如果长时间没有收到消息，显示超时提示
4. **格式不兼容**: 如果 neovate 输出格式变化，降级到显示原始日志

## 测试策略

### 单元测试
- 测试消息解析器对各种消息类型的解析
- 测试组件渲染不同类型的消息
- 测试折叠/展开功能

### 集成测试
- 测试完整的对话流展示
- 测试实时流式更新
- 测试与现有功能的兼容性

## 性能优化

1. **虚拟滚动**: 对于长对话，使用虚拟滚动减少 DOM 节点
2. **消息缓存**: 缓存已渲染的消息，避免重复渲染
3. **懒加载**: 工具结果内容默认折叠，点击时才渲染详细内容
4. **防抖**: 对快速到达的消息进行批量处理

## 兼容性

- 保留现有的日志查看器作为备选
- 添加切换按钮，允许用户在对话视图和原始日志之间切换
- 如果解析失败，自动降级到原始日志显示
