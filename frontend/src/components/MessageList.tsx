import React from 'react';
import { Tag, Card, Collapse } from 'antd';
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
   * 格式化时间戳
   */
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

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
   * 渲染单条消息
   */
  const renderMessage = (message: ConversationMessage) => {
    const isUser = message.role === MessageRole.USER;
    const isSystem = message.role === MessageRole.SYSTEM;
    const isQuestion = message.metadata?.isQuestion;

    return (
      <div
        key={message.id}
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginBottom: 16,
        }}
        onClick={() => onMessageClick?.(message)}
      >
        <div
          style={{
            maxWidth: '80%',
            padding: '12px 16px',
            borderRadius: 12,
            background: isUser
              ? '#1890ff'
              : isSystem
              ? '#f5f5f5'
              : isQuestion
              ? '#fff7e6'
              : '#fff',
            color: isUser ? '#fff' : '#000',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            cursor: onMessageClick ? 'pointer' : 'default',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            if (onMessageClick) {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
          }}
        >
          {/* 角色标签 */}
          <div style={{ marginBottom: 8 }}>
            <Tag
              color={
                isUser ? 'blue' : isSystem ? 'default' : isQuestion ? 'orange' : 'green'
              }
              style={{ fontSize: 11 }}
            >
              {isUser ? '用户' : isSystem ? '系统' : isQuestion ? 'AI 询问' : 'AI'}
            </Tag>
            <span
              style={{
                fontSize: 11,
                opacity: 0.7,
                marginLeft: 8,
                color: isUser ? '#fff' : '#999',
              }}
            >
              {formatTime(message.timestamp)}
            </span>
          </div>

          {/* 消息内容 - 使用 Markdown 渲染 */}
          <div
            style={{
              color: isUser ? '#fff' : '#000',
            }}
          >
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
                        margin: '8px 0',
                        borderRadius: 4,
                        fontSize: 13,
                      }}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code
                      className={className}
                      style={{
                        background: isUser ? 'rgba(255,255,255,0.2)' : '#f5f5f5',
                        padding: '2px 6px',
                        borderRadius: 3,
                        fontSize: 13,
                      }}
                    >
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
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
