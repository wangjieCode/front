import React from 'react';
import { Tag, Card, Collapse, Spin } from 'antd';
import {
  CodeOutlined,
  FileAddOutlined,
  FileTextOutlined,
  DeleteOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  ConversationMessage,
  MessageRole,
  CodeChange,
} from '../types/conversation';

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


  /**
   * 获取代码变更图标
   */
  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'added':
        return <FileAddOutlined style={{ color: '#52c41a' }} />;
      case 'modified':
        return <FileTextOutlined style={{ color: '#1890ff' }} />;
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
            color="blue"
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
   * 解析 AI 消息内容（处理 stream-json 格式）
   */
  const parseAIContent = (content: string): string => {
    // 先尝试直接解析整个内容（可能是完整的 JSON 数组）
    try {
      const fullParsed = JSON.parse(content);

      if (Array.isArray(fullParsed)) {
        // 从后往前查找最后一个 assistant 消息的 text 字段
        for (let i = fullParsed.length - 1; i >= 0; i--) {
          const item = fullParsed[i];
          if (item.role === 'assistant' && item.text) {
            return item.text;
          }
          // 兼容旧格式：type: "result"
          if (item.type === 'result' && item.content) {
            return item.content;
          }
        }
      }
    } catch (e) {
      // 不是完整的 JSON，尝试按行解析
      try {
        const lines = content.trim().split('\n').filter(line => line.trim());

        // 查找消息
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);

            // 处理数组格式：[{...}]
            if (Array.isArray(parsed)) {
              for (let i = parsed.length - 1; i >= 0; i--) {
                const item = parsed[i];
                if (item.role === 'assistant' && item.text) {
                  return item.text;
                }
                if (item.type === 'result' && item.content) {
                  return item.content;
                }
              }
            }
            // 处理对象格式：{...}
            else if (parsed.type === 'result' && parsed.content) {
              return parsed.content;
            } else if (parsed.role === 'assistant' && parsed.text) {
              return parsed.text;
            }
          } catch (e2) {
            // 跳过无法解析的行
          }
        }
      } catch (e2) {
        // 解析失败，返回原始内容
      }
    }

    return content;
  };

  /**
   * 渲染单条消息
   */
  const renderMessage = (message: ConversationMessage) => {
    const isUser = message.role === MessageRole.USER;
    const isSystem = message.role === MessageRole.SYSTEM;

    // 解析 AI 消息内容
    const displayContent = !isUser && !isSystem
      ? parseAIContent(message.content)
      : message.content;

    return (
      <div
        key={message.id}
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginBottom: 24,
          padding: '0 24px'
        }}
        onClick={() => onMessageClick?.(message)}
      >
        <div
          style={{
            maxWidth: '48rem',
            width: '100%',
            padding: isUser ? '12px 16px' : '16px 0',
            borderRadius: isUser ? 12 : 0,
            background: isUser ? '#f4f4f4' : 'transparent',
            color: '#000',
            cursor: onMessageClick ? 'pointer' : 'default',
          }}
        >
          {/* 角色标签 */}
          {!isUser && (
            <div style={{ marginBottom: 12 }}>
              <img
                src="/ai-avatar.png"
                alt="AI"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  objectFit: 'cover'
                }}
              />
            </div>
          )}

          {/* 消息内容 - 使用 Markdown 渲染 */}
          <div style={{ color: '#000', lineHeight: 1.7 }}>
            {!isUser && !isSystem && !displayContent ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#999', padding: '8px 0' }}>
                <Spin size="small" />
                <span>思考中...</span>
              </div>
            ) : (
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
                          borderRadius: 6,
                          fontSize: 14,
                        }}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code
                        className={className}
                        style={{
                          background: '#f4f4f4',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 14,
                          fontFamily: 'monospace'
                        }}
                      >
                        {children}
                      </code>
                    );
                  },
                  p({ children }: any) {
                    return <p style={{ margin: '0 0 12px 0' }}>{children}</p>;
                  },
                  ul({ children }: any) {
                    return <ul style={{ margin: '8px 0', paddingLeft: 24 }}>{children}</ul>;
                  },
                  ol({ children }: any) {
                    return <ol style={{ margin: '8px 0', paddingLeft: 24 }}>{children}</ol>;
                  },
                }}
              >
                {displayContent}
              </ReactMarkdown>
            )}
          </div>

          {/* 代码变更展示 */}
          {message.metadata?.codeChanges &&
            renderCodeChanges(message.metadata.codeChanges)}

          {/* MR 链接展示 */}
          {message.metadata?.mrUrl && (
            <div style={{ marginTop: 12 }}>
              <Card
                size="small"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  borderRadius: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    fontSize: 20,
                    filter: 'brightness(0) invert(1)'
                  }}>
                    🔀
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fff', fontWeight: 500, marginBottom: 4 }}>
                      Merge Request 已创建
                    </div>
                    {message.metadata.gitBranch && (
                      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                        分支: {message.metadata.gitBranch}
                      </div>
                    )}
                  </div>
                  <a
                    href={message.metadata.mrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'rgba(255,255,255,0.2)',
                      color: '#fff',
                      padding: '6px 16px',
                      borderRadius: 6,
                      textDecoration: 'none',
                      fontSize: 13,
                      fontWeight: 500,
                      transition: 'all 0.2s',
                      border: '1px solid rgba(255,255,255,0.3)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                    }}
                  >
                    查看 MR →
                  </a>
                </div>
              </Card>
            </div>
          )}

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
