import * as React from 'react';
import { Tag, Collapse, Spin } from 'antd';
import {
  CodeOutlined,
  FileAddOutlined,
  FileTextOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  ConversationMessage,
  MessageRole,
  CodeChange,
  ParsedContent,
  CodeChangeFileJumpPayload,
} from '../types/conversation';
import { parseNeovateStreamJsonStructured, isStreamJsonFormat } from '../utils/neovateParser';
import { TypewriterText } from './TypewriterText';

const { Panel } = Collapse;

interface MessageListProps {
  messages: ConversationMessage[];
  onMessageClick?: (message: ConversationMessage) => void;
  onCodeChangeFileClick?: (payload: CodeChangeFileJumpPayload) => void;
}

/**
 * 消息列表组件
 * 展示对话消息，支持代码高亮、代码变更展示等
 */
const MessageList: React.FC<MessageListProps> = ({
  messages,
  onMessageClick,
  onCodeChangeFileClick,
}) => {
  // @keyframes blink 已移至全局 App.css，无需动态注入

  /**
   * 获取代码变更图标
   */
  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'added':
        return <FileAddOutlined style={{ color: '#52c41a' }} />;
      case 'modified':
        return <FileTextOutlined style={{ color: '#7c5cff' }} />;
      case 'deleted':
        return <DeleteOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <CodeOutlined />;
    }
  };

  /**
   * 获取代码变更标签颜色
   */
  const getChangeColor = (changeType: string) => {
    switch (changeType) {
      case 'added':
        return 'success';
      case 'modified':
        return 'processing';
      case 'deleted':
        return 'error';
      default:
        return 'default';
    }
  };

  /**
   * 渲染代码变更卡片
   */
  const renderCodeChanges = (message: ConversationMessage, codeChanges: CodeChange[]) => {
    if (!codeChanges || codeChanges.length === 0) {
      return null;
    }

    return (
      <div className="code-change-card">
        <div className="code-change-summary">
          <span className="code-change-summary-title">
            <CodeOutlined style={{ marginRight: 6 }} />
            代码变更
          </span>
          <span className="code-change-summary-stats">
            {codeChanges.length} 文件
          </span>
        </div>

        <div className="code-change-list">
          {codeChanges.map((change, index) => (
            <div className="code-change-item" key={`${change.filePath}-${index}`}>
              <div className="code-change-item-header">
                <div className="code-change-item-left">
                  {getChangeIcon(change.changeType)}
                  <Tag color={getChangeColor(change.changeType)}>{change.changeType}</Tag>
                  <button
                    type="button"
                    className="code-change-file-btn"
                    disabled={!onCodeChangeFileClick}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCodeChangeFileClick?.({
                        messageId: message.id,
                        filePath: change.filePath,
                        changeType: change.changeType,
                      });
                    }}
                  >
                    {change.filePath}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /**
   * 渲染问题选项
   */
  const renderQuestionOptions = (options: string[]) => {
    if (!options || options.length === 0) {
      return null;
    }

    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>
          <QuestionCircleOutlined /> 请选择：
        </div>
        {options.map((option, index) => (
          <Tag
            key={index}
            color="#7c5cff"
            style={{
              marginBottom: 4,
              padding: '4px 12px',
              fontSize: 13,
            }}
          >
            {index + 1}. {option}
          </Tag>
        ))}
      </div>
    );
  };

  const renderImages = (images: Array<{ data: string; name?: string }>) => {
    if (!images || images.length === 0) return null;

    return (
      <div className="message-images">
        {images.map((image, index) => (
          <div className="message-image" key={`${image.name || 'image'}-${index}`}>
            <img src={image.data} alt={image.name || `image-${index + 1}`} />
          </div>
        ))}
      </div>
    );
  };

  interface ToolTraceItem {
    id: string;
    name: string;
    description?: string;
    input?: any;
    result?: any;
    running: boolean;
  }

  const buildToolTraceItems = (parsedContents: ParsedContent[], isStreaming: boolean): ToolTraceItem[] => {
    const items: ToolTraceItem[] = [];
    const itemById = new Map<string, ToolTraceItem>();

    const ensureItem = (content: ParsedContent, fallbackIndex: number): ToolTraceItem => {
      const rawId = content.toolCallId || `${content.toolName || 'tool'}-${fallbackIndex}`;
      const existing = itemById.get(rawId);
      if (existing) {
        return existing;
      }

      const created: ToolTraceItem = {
        id: rawId,
        name: content.toolName || `工具 ${items.length + 1}`,
        description: content.toolDescription,
        input: content.toolInput,
        running: false,
      };
      items.push(created);
      itemById.set(rawId, created);
      return created;
    };

    parsedContents.forEach((content, index) => {
      if (content.type === 'tool_use') {
        const item = ensureItem(content, index);
        item.name = content.toolName || item.name;
        item.description = content.toolDescription || item.description;
        item.input = content.toolInput ?? item.input;
        return;
      }

      if (content.type === 'tool_result') {
        const byId = content.toolCallId ? itemById.get(content.toolCallId) : undefined;
        const target =
          byId
          || items.find(item => item.name === (content.toolName || '') && item.result === undefined)
          || ensureItem(content, index);
        target.name = content.toolName || target.name;
        target.result = content.toolResult;
      }
    });

    items.forEach(item => {
      item.running = isStreaming && item.result === undefined;
    });

    return items;
  };

  /**
   * 渲染结构化内容
   */
  const renderStructuredContent = (parsedContents: ParsedContent[], isStreaming: boolean) => {
    const toolContents = parsedContents.filter(
      content => content.type === 'tool_use' || content.type === 'tool_result'
    );
    if (toolContents.length === 0) {
      return null;
    }

    const toolItems = buildToolTraceItems(toolContents, isStreaming);
    const runningCount = toolItems.filter(item => item.running).length;
    const doneCount = toolItems.filter(item => item.result !== undefined).length;

    return (
      <div className="tool-trace-container">
        <Collapse ghost className="tool-trace-collapse">
          <Panel
            key="tool-trace-panel"
            header={
              <div className="tool-trace-summary">
                <span className="tool-trace-summary-title">
                  <ThunderboltOutlined style={{ marginRight: 6 }} />
                  工具调用
                </span>
                <span className="tool-trace-summary-meta">
                  {toolItems.length} 个工具
                  {runningCount > 0 ? ` · ${runningCount} 执行中` : ` · ${doneCount} 已完成`}
                </span>
              </div>
            }
          >
            <div className="tool-trace-list">
              <Collapse ghost className="tool-trace-nested-collapse">
                {toolItems.map((item, index) => (
                  <Panel
                    key={item.id}
                    header={
                      <div className="tool-trace-item-summary">
                        <span className="tool-trace-item-title">
                          {item.running ? (
                            <Spin size="small" style={{ marginRight: 6 }} />
                          ) : (
                            <CheckCircleOutlined style={{ color: '#16a34a', marginRight: 6 }} />
                          )}
                          {item.name}
                        </span>
                        {item.running ? (
                          <Tag className="tool-trace-item-tag" color="processing">执行中</Tag>
                        ) : (
                          <Tag className="tool-trace-item-tag" color="success">完成</Tag>
                        )}
                      </div>
                    }
                  >
                    <div className="tool-trace-item" key={`${item.id}-${index}`}>
                      {item.description && (
                        <div className="tool-trace-item-desc">{item.description}</div>
                      )}
                      {item.input !== undefined && (
                        <SyntaxHighlighter
                          language="json"
                          style={vscDarkPlus as any}
                          customStyle={{ margin: 0, borderRadius: 8, fontSize: 12 }}
                        >
                          {JSON.stringify(item.input, null, 2)}
                        </SyntaxHighlighter>
                      )}
                      {item.result !== undefined && (
                        <div style={{ marginTop: item.input !== undefined ? 8 : 0 }}>
                          <SyntaxHighlighter
                            language="bash"
                            style={vscDarkPlus as any}
                            customStyle={{ margin: 0, borderRadius: 8, fontSize: 12 }}
                          >
                            {typeof item.result === 'string' ? item.result : JSON.stringify(item.result, null, 2)}
                          </SyntaxHighlighter>
                        </div>
                      )}
                    </div>
                  </Panel>
                ))}
              </Collapse>
            </div>
          </Panel>
        </Collapse>
      </div>
    );
  };

  /**
   * 提取文本内容
   */
  const extractTextContent = (message: ConversationMessage): string => {
    // 优先使用 parsedContents
    if (message.parsedContents && message.parsedContents.length > 0) {
      return message.parsedContents
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');
    }

    // 回退到解析 content
    if (isStreamJsonFormat(message.content)) {
      const parsed = parseNeovateStreamJsonStructured(message.content);
      return parsed
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');
    }

    return message.content;
  };

  /**
   * 渲染单条消息
   */
  const renderMessage = (message: ConversationMessage) => {
    const isUser = message.role === MessageRole.USER;
    const isSystem = message.role === MessageRole.SYSTEM;


    // 提取文本内容
    let displayContent = !isUser && !isSystem
      ? extractTextContent(message)
      : message.content;



    // 获取结构化内容（工具调用和结果）
    const structuredContents = !isUser && !isSystem
      ? (message.parsedContents || 
         (isStreamJsonFormat(message.content) ? parseNeovateStreamJsonStructured(message.content) : []))
      : [];

    return (
      <div
        key={message.id}
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginBottom: 24,
          padding: '0 24px',
          gap: 16,
        }}
        onClick={() => onMessageClick?.(message)}
      >
        {/* AI 头像 */}
        {!isUser && (
          <div style={{ flexShrink: 0, marginTop: 4 }}>
            <img
              src="/ai-avatar.png"
              alt="AI"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid #eee'
              }}
            />
          </div>
        )}

        {/* 消息内容容器 */}
        <div
          style={{
            maxWidth: '48rem',
            padding: isUser ? '12px 18px' : '12px 18px',
            borderRadius: isUser ? '20px 20px 4px 20px' : '4px 20px 20px 20px',
            background: isUser ? '#7c5cff' : '#f7f8fa',
            color: isUser ? '#fff' : '#1f2937',
            boxShadow: isUser ? '0 2px 8px rgba(124, 92, 255, 0.2)' : 'none',
            lineHeight: 1.6,
            fontSize: 15,
            cursor: onMessageClick ? 'pointer' : 'default',
          }}
        >
          {/* 思维链展示 - 工具调用和结果 */}
          {!isUser && !isSystem && structuredContents.length > 0 && (
            <div style={{ marginBottom: displayContent ? 12 : 0 }}>
              {renderStructuredContent(structuredContents, (message as any).isStreaming || false)}
            </div>
          )}

          {/* 消息内容 - 使用 Markdown 渲染 */}
          <div className="message-content">
            {!isUser && !isSystem && (message as any).isStreaming && !displayContent && structuredContents.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#999' }}>
                <Spin size="small" />
                <span>AI 正在处理您的消息...</span>
              </div>
            ) : displayContent ? (
              <TypewriterText
                text={displayContent}
                isStreaming={(message as any).isStreaming || false}
                isUser={isUser}
              />
            ) : null}
          </div>

          {/* 代码变更展示 */}
          {message.metadata?.codeChanges &&
            renderCodeChanges(message, message.metadata.codeChanges)}

          {/* 图片附件 */}
          {message.metadata?.images && message.metadata.images.length > 0 &&
            renderImages(message.metadata.images)}

          {/* 问题选项 */}
          {message.metadata?.questionOptions &&
            renderQuestionOptions(message.metadata.questionOptions)}

          {/* 工具调用信息 */}
          {message.metadata?.toolCalls &&
            message.metadata.toolCalls.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Tag>
                  {message.metadata.toolCalls.length} 个工具调用
                </Tag>
              </div>
            )}
        </div>

        {/* 用户头像 (可选) */}
        {isUser && (
          <div style={{ flexShrink: 0, marginTop: 4 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#7c5cff',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold'
            }}>
              ME
            </div>
          </div>
        )}
      </div>
    );
  };

  // 按时间排序消息（从旧到新），用 useMemo 避免每次渲染重排
  const sortedMessages = React.useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ),
    [messages]
  );

  return (
    <div style={{ padding: '8px 0' }}>
      {sortedMessages.map(renderMessage)}
    </div>
  );
};

export default React.memo(MessageList);
