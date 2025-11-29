import React, { useState, useEffect, useRef } from 'react';
import { Card, Space, Spin, Empty, Tag, Tooltip } from 'antd';
import { EditOutlined, EyeOutlined } from '@ant-design/icons';
import {
  ConversationSession,
  ConversationMessage,
  ConversationStatus,
  ConversationMode,
} from '../types/conversation';
import MessageInput from './MessageInput';
import MessageList from './MessageList';

interface ConversationViewProps {
  sessionId: string;
  initialPrompt?: string;
  onClose?: () => void;
}

/**
 * 对话视图组件
 * 展示完整的对话历史和消息输入
 */
const ConversationView: React.FC<ConversationViewProps> = ({
  sessionId,
  initialPrompt,
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

  // 自动发送初始消息
  useEffect(() => {
    if (initialPrompt && messages.length === 0 && !sending && session) {
      handleSendMessage(initialPrompt);
    }
  }, [initialPrompt, messages.length, session]);

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
    
    // 立即添加用户消息到界面
    const userMessage: ConversationMessage = {
      id: `temp-${Date.now()}`,
      sessionId,
      branchId: session?.context?.currentBranchId || 'main',
      role: 'user' as any,
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    // 创建临时 AI 消息用于流式更新
    const aiMessageId = `ai-${Date.now()}`;
    const aiMessage: ConversationMessage = {
      id: aiMessageId,
      sessionId,
      branchId: session?.context?.currentBranchId || 'main',
      role: 'assistant' as any,
      content: '',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, aiMessage]);

    try {
      const response = await fetch(`/api/conversations/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error('发送消息失败');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'chunk') {
                // 更新 AI 消息内容
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === aiMessageId 
                      ? { ...msg, content: msg.content + data.content }
                      : msg
                  )
                );
              } else if (data.type === 'complete') {
                // 流式传输完成，重新加载消息获取完整数据
                await loadMessages();
              } else if (data.type === 'error') {
                console.error('AI 响应错误:', data.message);
              }
            } catch (e) {
              console.error('解析 SSE 数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      // 移除临时消息
      setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
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

  const getModeTag = (mode: ConversationMode) => {
    if (mode === ConversationMode.EDIT) {
      return (
        <Tooltip title="AI 可以修改代码，创建 Git 分支和 MR">
          <Tag icon={<EditOutlined />} color="blue">
            编辑模式
          </Tag>
        </Tooltip>
      );
    } else {
      return (
        <Tooltip title="AI 只能查询代码，不能修改">
          <Tag icon={<EyeOutlined />} color="default">
            只读模式
          </Tag>
        </Tooltip>
      );
    }
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
          {session.context?.mode && getModeTag(session.context.mode)}
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
