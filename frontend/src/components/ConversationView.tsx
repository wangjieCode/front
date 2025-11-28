import React, { useState, useEffect, useRef } from 'react';
import { Card, Space, Spin, Empty, Tag } from 'antd';
import {
  ConversationSession,
  ConversationMessage,
  ConversationStatus,
} from '../types/conversation';
import MessageInput from './MessageInput';
import MessageList from './MessageList';

interface ConversationViewProps {
  sessionId: string;
  onClose?: () => void;
}

/**
 * 对话视图组件
 * 展示完整的对话历史和消息输入
 */
const ConversationView: React.FC<ConversationViewProps> = ({
  sessionId,
  onClose,
}) => {
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 加载会话数据
  useEffect(() => {
    loadSession();
    loadMessages();
  }, [sessionId]);

  // 自动滚动到最新消息
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadSession = async () => {
    try {
      const response = await fetch(`/api/conversations/${sessionId}`);
      const data = await response.json();
      if (data.success) {
        setSession(data.data);
      }
    } catch (error) {
      console.error('加载会话失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/conversations/${sessionId}/messages`);
      const data = await response.json();
      if (data.success) {
        setMessages(data.data);
      }
    } catch (error) {
      console.error('加载消息失败:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (content: string) => {
    setSending(true);
    try {
      const response = await fetch(`/api/conversations/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      const data = await response.json();
      if (data.success) {
        // 重新加载消息
        await loadMessages();
      }
    } catch (error) {
      console.error('发送消息失败:', error);
    } finally {
      setSending(false);
    }
  };

  const getStatusTag = (status: ConversationStatus) => {
    const statusConfig = {
      [ConversationStatus.PLANNING]: { color: 'blue', text: '规划中' },
      [ConversationStatus.EXECUTING]: { color: 'processing', text: '执行中' },
      [ConversationStatus.PAUSED]: { color: 'warning', text: '已暂停' },
      [ConversationStatus.COMPLETED]: { color: 'success', text: '已完成' },
      [ConversationStatus.FAILED]: { color: 'error', text: '失败' },
    };

    const config = statusConfig[status];
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const handleMessageClick = (message: ConversationMessage) => {
    console.log('Message clicked:', message);
    // 可以在这里添加消息点击处理逻辑
  };

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="加载对话..." />
        </div>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card>
        <Empty description="会话不存在" />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <span>对话会话</span>
          {getStatusTag(session.status)}
        </Space>
      }
      extra={onClose && <a onClick={onClose}>关闭</a>}
    >
      <div
        style={{
          height: '600px',
          overflowY: 'auto',
          padding: '16px',
          background: '#fafafa',
          borderRadius: 8,
        }}
      >
        {messages.length === 0 ? (
          <Empty description="暂无消息" />
        ) : (
          <>
            <MessageList messages={messages} onMessageClick={handleMessageClick} />
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 消息输入 */}
      <div style={{ marginTop: 16 }}>
        <MessageInput
          sessionId={sessionId}
          disabled={
            sending ||
            session.status === ConversationStatus.COMPLETED ||
            session.status === ConversationStatus.FAILED
          }
          onSend={handleSendMessage}
        />
      </div>
    </Card>
  );
};

export default ConversationView;
