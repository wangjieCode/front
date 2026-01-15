import React from 'react';
import { Tag, Card, Collapse, Spin } from 'antd';
import {
  CodeOutlined,
  FileAddOutlined,
  FileTextOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  ConversationMessage,
  MessageRole,
  CodeChange,
  ParsedContent,
} from '../types/conversation';
import { parseNeovateStreamJsonStructured, isStreamJsonFormat } from '../utils/neovateParser';

const { Panel } = Collapse;

interface MessageListProps {
  messages: ConversationMessage[];
  onMessageClick?: (message: ConversationMessage) => void;
}

/**
 * 消息列表组件
 * 展示对话消息，支持代码高亮、代码变更展示等
 */
const MessageList: React.FC<MessageListProps> = ({
  messages,
  onMessageClick,
}) => {

  // 添加打字机光标动画样式
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);


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
  const renderCodeChanges = (codeChanges: CodeChange[]) => {
    if (!codeChanges || codeChanges.length === 0) {
      return null;
    }

    return (
      <Card
        size="small"
        title={
          <span>
            <CodeOutlined /> 代码变更 ({codeChanges.length})
          </span>
        }
        style={{ marginTop: 12 }}
      >
        <Collapse ghost>
          {codeChanges.map((change, index) => (
            <Panel
              key={index}
              header={
                <span>
                  {getChangeIcon(change.changeType)}{' '}
                  <Tag color={getChangeColor(change.changeType)}>
                    {change.changeType}
                  </Tag>
                  {change.filePath}
                </span>
              }
            >
              <SyntaxHighlighter
                language="diff"
                style={vscDarkPlus as any}
                customStyle={{
                  margin: 0,
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                {change.diff}
              </SyntaxHighlighter>
            </Panel>
          ))}
        </Collapse>
      </Card>
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

  /**
   * 渲染工具调用卡片
   */
  const renderToolUse = (content: ParsedContent, index: number) => {
    return (
      <Card
        key={`tool-use-${index}`}
        size="small"
        style={{
          marginTop: 8,
          background: '#fafafa',
          border: '1px solid #e8e8e8',
        }}
        bodyStyle={{ padding: 0 }}
      >
        <Collapse ghost>
          <Panel
            key="1"
            header={
              <span style={{ fontSize: 13 }}>
                <ThunderboltOutlined style={{ color: '#8c8c8c', marginRight: 6 }} />
                <span style={{ color: '#595959', fontWeight: 500 }}>
                  {content.toolName}
                </span>
                {content.toolDescription && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: '#8c8c8c' }}>
                    {content.toolDescription}
                  </span>
                )}
              </span>
            }
          >
            {content.toolInput && (
              <SyntaxHighlighter
                language="json"
                style={vscDarkPlus as any}
                customStyle={{
                  margin: 0,
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                {JSON.stringify(content.toolInput, null, 2)}
              </SyntaxHighlighter>
            )}
          </Panel>
        </Collapse>
      </Card>
    );
  };

  /**
   * 渲染工具结果卡片
   */
  const renderToolResult = (content: ParsedContent, index: number) => {
    const resultStr = typeof content.toolResult === 'string' 
      ? content.toolResult 
      : JSON.stringify(content.toolResult, null, 2);

    return (
      <Card
        key={`tool-result-${index}`}
        size="small"
        style={{
          marginTop: 8,
          background: '#fafafa',
          border: '1px solid #e8e8e8',
        }}
        bodyStyle={{ padding: 0 }}
      >
        <Collapse ghost>
          <Panel
            key="1"
            header={
              <span style={{ fontSize: 13 }}>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />
                <span style={{ color: '#595959', fontWeight: 500 }}>
                  {content.toolName}
                </span>
                <Tag 
                  color="success" 
                  style={{ 
                    marginLeft: 8, 
                    fontSize: 11,
                    padding: '0 6px',
                    lineHeight: '18px',
                  }}
                >
                  完成
                </Tag>
              </span>
            }
          >
            <SyntaxHighlighter
              language="bash"
              style={vscDarkPlus as any}
              customStyle={{
                margin: 0,
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              {resultStr}
            </SyntaxHighlighter>
          </Panel>
        </Collapse>
      </Card>
    );
  };

  /**
   * 渲染结构化内容
   */
  const renderStructuredContent = (parsedContents: ParsedContent[]) => {
    return parsedContents.map((content, index) => {
      if (content.type === 'tool_use') {
        return renderToolUse(content, index);
      } else if (content.type === 'tool_result') {
        return renderToolResult(content, index);
      }
      return null;
    });
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
    const displayContent = !isUser && !isSystem
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
              {renderStructuredContent(structuredContents)}
            </div>
          )}

          {/* 消息内容 - 使用 Markdown 渲染 */}
          <div className="message-content">
            {!isUser && !isSystem && !displayContent && structuredContents.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#999' }}>
                <Spin size="small" />
                <span>思考中...</span>
              </div>
            ) : displayContent ? (
              <>
                <ReactMarkdown
                  components={{
                    code({ className, children }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const inline = !match;
                      return !inline && match ? (
                        <SyntaxHighlighter
                          style={vscDarkPlus as any}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: '12px 0',
                            borderRadius: 8,
                            fontSize: 13,
                            border: '1px solid rgba(0,0,0,0.05)',
                          }}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code
                          className={className}
                          style={{
                            background: isUser ? 'rgba(255,255,255,0.2)' : '#ebebeb',
                            color: isUser ? '#fff' : '#c7254e',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 13,
                            fontFamily: 'monospace'
                          }}
                        >
                          {children}
                        </code>
                      );
                    },
                    p({ children }: any) {
                      return <p style={{ margin: '0 0 8px 0', lineHeight: 1.6 }}>{children}</p>;
                    },
                    ul({ children }: any) {
                      return <ul style={{ margin: '8px 0', paddingLeft: 24 }}>{children}</ul>;
                    },
                    ol({ children }: any) {
                      return <ol style={{ margin: '8px 0', paddingLeft: 24 }}>{children}</ol>;
                    },
                    a({ href, children }: any) {
                      return <a href={href} style={{ color: isUser ? '#fff' : '#7c5cff', textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer">{children}</a>;
                    },
                  }}
                >
                  {displayContent}
                </ReactMarkdown>
                
                {/* 流式消息的打字机效果指示器 */}
                {(message as any).isStreaming && (
                  <span 
                    style={{ 
                      display: 'inline-block',
                      width: '8px',
                      height: '16px',
                      backgroundColor: '#7c5cff',
                      marginLeft: '2px',
                      animation: 'blink 1s infinite',
                      verticalAlign: 'text-bottom'
                    }}
                  />
                )}
              </>
            ) : null}
          </div>

          {/* 代码变更展示 */}
          {message.metadata?.codeChanges &&
            renderCodeChanges(message.metadata.codeChanges)}

          {/* 问题选项 */}
          {message.metadata?.questionOptions &&
            renderQuestionOptions(message.metadata.questionOptions)}

          {/* 工具调用信息 */}
          {message.metadata?.toolCalls &&
            message.metadata.toolCalls.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Tag color="purple">
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

  // 按时间排序消息（从旧到新）
  const sortedMessages = [...messages].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <div style={{ padding: '8px 0' }}>
      {sortedMessages.map(renderMessage)}
    </div>
  );
};

export default MessageList;
