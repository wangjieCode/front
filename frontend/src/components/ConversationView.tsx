import React, { useState, useEffect, useRef } from 'react';
import { Spin, Typography, Button, Input, message, Modal, Descriptions, Tag } from 'antd';
import { ThunderboltOutlined, SendOutlined, RocketOutlined, CheckOutlined, WarningOutlined, StopOutlined, GitlabOutlined, ClockCircleOutlined, LinkOutlined } from '@ant-design/icons';
import ModeSelector from './ModeSelector';
import {
  ConversationSession,
  ConversationMessage,
  ConversationMode,
  PreviewStatus,
} from '../types/conversation';
import MessageInput from './MessageInput';
import MessageList from './MessageList';
import { conversationService } from '../services/conversationService';

interface ConversationViewProps {
  sessionId?: string;
  initialPrompt?: string;
  initialSession?: ConversationSession;
  onNewConversation?: (prompt: string, mode: ConversationMode) => Promise<void>;
  mode?: ConversationMode;
  onModeChange?: (mode: ConversationMode) => void;
}

/**
 * 对话视图组件
 * 展示完整的对话历史和消息输入
 */
const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

const ConversationView: React.FC<ConversationViewProps> = ({
  sessionId,
  initialPrompt,
  initialSession,
  onNewConversation,
  mode = ConversationMode.EDIT,
  onModeChange,
}) => {
  const [session, setSession] = useState<ConversationSession | null>(initialSession || null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [creatingMR, setCreatingMR] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New conversation state
  const [prompt, setPrompt] = useState('');
  
  // 预览相关状态
  const [isDeploying, setIsDeploying] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus | null>(null);
  const [deploymentInfo, setDeploymentInfo] = useState<any>(null);
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);

  const examplePrompts = [
    '修改一下文案',
    '看一下页面的功能',
    '看一下某接口调用使用了哪些返回值',
  ];

  // 加载会话数据
  useEffect(() => {
    if (sessionId) {
      // 切换会话时清空状态
      setMessages([]);
      setSending(false);
      setLoadingMessages(true);

      // If initialSession is provided and matches the current sessionId, use it immediately
      if (initialSession && initialSession.id === sessionId) {
        setSession(initialSession);
        // We still fetch messages, but we don't need to block the UI with a full spinner
        // if we already have the session structure.
        // However, if we are switching to a new session, we might want to show loading for messages?
        // For a newly created session, messages are empty, so it's fine.
        // For an existing session, we might want to show loading in the message area.

        // We only set global loading if we don't have a session to show
        if (!session || session.id !== sessionId) {
          // If we are switching, we might want to clear old session data to avoid confusion
          // But if initialSession is here, we use it.
        }
      } else {
        // If no initial session, or it doesn't match, we need to fetch.
        // If we are switching sessions, we should probably show loading.
        setLoading(true);
        setSession(null);
      }

      const tasks = [loadSession()];

      // Only load messages if there is NO initial prompt.
      // If there is an initial prompt, we rely on handleSendMessage to create the first message optimistically.
      // Fetching messages immediately would return empty and overwrite the optimistic message.
      if (!initialPrompt) {
        tasks.push(loadMessages());
      }

      Promise.all(tasks).finally(() => {
        setLoading(false);
        setLoadingMessages(false);
      });
    } else {
      setLoading(false);
      setSession(null);
      setMessages([]);
      setPrompt('');
      setSending(false);
    }
  }, [sessionId, initialSession, initialPrompt]);

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
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/conversations/${sessionId}`);
      const data = await response.json();
      if (data.success) {
        setSession(data.data);
      }
    } catch (error) {
      console.error('加载会话失败:', error);
    }
  };

  const loadMessages = async () => {
    if (!sessionId) return;
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
    if (!sessionId) return;
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



  const handleMessageClick = (message: ConversationMessage) => {
    console.log('Message clicked:', message);
    // 可以在这里添加消息点击处理逻辑
  };

  /**
   * 处理预览点击
   */
  const handlePreview = async () => {
    if (!sessionId) return;

    // 如果已经有预览，直接打开
    if (session?.context?.previewInfo?.status === PreviewStatus.RUNNING && session?.context?.previewInfo?.url) {
      window.open(session.context.previewInfo.url, '_blank');
      return;
    }

    // 开始部署
    setIsDeploying(true);
    setPreviewStatus(PreviewStatus.BUILDING);
    message.loading({ content: '正在部署...', key: 'preview', duration: 0 });

    try {
      const result = await conversationService.createPreview(sessionId, false);
      
      if (result.success && result.previewUrl) {
        setPreviewStatus(PreviewStatus.RUNNING);
        setDeploymentInfo(result.deploymentInfo);
        
        // 显示部署成功信息
        if (result.deploymentInfo) {
          message.success({ 
            content: `部署成功！耗时 ${result.deploymentInfo.totalTime}s`, 
            key: 'preview', 
            duration: 3 
          });
          
          // 自动显示部署详情
          setShowDeploymentModal(true);
        } else {
          message.success({ content: '部署成功！', key: 'preview', duration: 2 });
        }
        
        // 刷新会话信息
        await loadSession();
        
        // 延迟打开预览页面
        setTimeout(() => {
          window.open(result.previewUrl, '_blank');
        }, 500);
      } else {
        setPreviewStatus(PreviewStatus.ERROR);
        message.error({ content: `部署失败: ${result.error}`, key: 'preview', duration: 3 });
      }
    } catch (error) {
      setPreviewStatus(PreviewStatus.ERROR);
      message.error({ 
        content: `部署失败: ${error instanceof Error ? error.message : '未知错误'}`, 
        key: 'preview', 
        duration: 3 
      });
    } finally {
      setIsDeploying(false);
    }
  };

  /**
   * 处理停止预览
   */
  const handleStopPreview = async () => {
    if (!sessionId) return;

    try {
      await conversationService.stopPreview(sessionId);
      message.success('预览已停止');
      setPreviewStatus(PreviewStatus.STOPPED);
      await loadSession();
    } catch (error) {
      message.error(`停止预览失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  /**
   * 创建 MR
   */
  const handleCreateMR = async () => {
    if (!sessionId) return;
    
    setCreatingMR(true);
    try {
      const result = await conversationService.createMergeRequest(sessionId);
      message.success('MR 已创建');
      
      // 重新加载会话以获取最新的 MR URL
      await loadSession();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建 MR 失败');
    } finally {
      setCreatingMR(false);
    }
  };

  /**
   * 获取预览按钮文案和样式
   */
  const getPreviewButtonProps = () => {
    const currentStatus = session?.context?.previewInfo?.status || previewStatus;
    
    if (isDeploying || currentStatus === PreviewStatus.BUILDING) {
      return {
        icon: <Spin size="small" />,
        text: '部署中...',
        disabled: true,
        style: { background: '#d9d9d9', borderColor: '#d9d9d9' },
      };
    }
    
    if (currentStatus === PreviewStatus.RUNNING) {
      return {
        icon: <CheckOutlined />,
        text: '查看预览',
        disabled: false,
        style: { background: '#52c41a', borderColor: '#52c41a', color: '#fff' },
      };
    }
    
    if (currentStatus === PreviewStatus.ERROR) {
      return {
        icon: <WarningOutlined />,
        text: '重新部署',
        disabled: false,
        style: { background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' },
      };
    }
    
    return {
      icon: <RocketOutlined />,
      text: '预览项目',
      disabled: false,
      style: { background: '#1890ff', borderColor: '#1890ff', color: '#fff' },
    };
  };

  const renderLandingContent = () => (
    <div style={{
      maxWidth: 800,
      margin: '0 auto',
      paddingTop: '5vh',
      animation: 'fadeIn 0.6s ease-in'
    }}>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>

      {/* 欢迎标题 */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <Title level={1} style={{ marginBottom: 16, fontSize: 42, fontWeight: 800 }}>
          有什么可以帮你的？
        </Title>
        <Paragraph style={{ color: '#666', fontSize: 18 }}>
          <ThunderboltOutlined style={{ color: '#faad14' }} /> 你的智能前端开发助手
        </Paragraph>
      </div>

      {/* 项目信息展示 */}
      <div style={{
        marginBottom: 24,
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        borderRadius: 12,
        border: '1px solid #e5e5e5'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 20 }}>📁</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>代码仓库</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#333', fontFamily: 'monospace' }}>
              /dtmall-admin
            </div>
          </div>
          <div style={{
            padding: '4px 12px',
            background: 'rgba(255,255,255,0.8)',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            color: '#667eea',
            border: '1px solid rgba(102, 126, 234, 0.2)'
          }}>
            <span style={{ marginRight: 4 }}>🌿</span>
            master
          </div>
        </div>
      </div>

      {/* 输入卡片 */}
      <div
        className="glass-card"
        style={{
          borderRadius: 24,
          border: '1px solid #f0f0f0',
          padding: '36px',
          background: '#fff',
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
        }}
      >
        <div style={{ marginBottom: 24 }}>
          {/* 模式选择器 */}
          <div>
            <Text type="secondary" style={{ fontSize: 14, marginBottom: 8, display: 'block' }}>
              选择对话模式：
            </Text>
            <ModeSelector value={mode} onChange={onModeChange || (() => { })} />
          </div>
        </div>

        <div className="main-input-wrapper" style={{ borderRadius: 12, padding: '4px', background: '#f5f5f5', marginBottom: 16 }}>
          <TextArea
            className="main-input-area"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要的功能，例如：在首页添加一个搜索框..."
            autoSize={{ minRows: 4, maxRows: 8 }}
            style={{
              fontSize: 16,
              background: 'transparent',
              border: 'none',
              resize: 'none'
            }}
            onPressEnter={async (e) => {
              if ((e.ctrlKey || e.metaKey) && onNewConversation) {
                setSending(true);
                try {
                  await onNewConversation(prompt, mode);
                } finally {
                  setSending(false);
                }
              }
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            按 Ctrl/Cmd + Enter 发送
          </Text>
          <Button
            type="primary"
            size="large"
            icon={<SendOutlined />}
            onClick={async () => {
              if (onNewConversation) {
                setSending(true);
                try {
                  await onNewConversation(prompt, mode);
                } finally {
                  setSending(false);
                }
              }
            }}
            loading={sending}
            style={{
              height: 48,
              padding: '0 32px',
              fontSize: 16,
              borderRadius: 24,
              background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
              border: 'none',
              boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)'
            }}
          >
            {sending ? '正在思考...' : '发送'}
          </Button>
        </div>
      </div>

      {/* 示例提示 */}
      <div style={{ marginTop: 48, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {examplePrompts.map((example, index) => (
          <Button
            key={index}
            style={{
              borderRadius: 20,
              background: '#fff',
              border: '1px solid #eee',
              color: '#666',
              padding: '4px 16px',
              height: 'auto'
            }}
            onClick={() => setPrompt(example)}
          >
            {example}
          </Button>
        ))}
      </div>
    </div>
  );

  const renderChatContent = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 0'
      }}>
        {loadingMessages ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" tip="加载消息..." />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            暂无消息
          </div>
        ) : (
          <>
            <MessageList messages={messages} onMessageClick={handleMessageClick} />
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div style={{
        padding: '16px 24px 24px',
        background: '#fff'
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 24,
          border: '1px solid #e5e5e5',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          padding: '12px 16px',
          transition: 'all 0.2s'
        }}>
          <MessageInput
            sessionId={sessionId}
            disabled={sending}
            onSend={handleSendMessage}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#fff'
    }}>
      {/* Header */}
      {sessionId && session && (
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e5e5e5',
          background: mode === ConversationMode.EDIT ? 'linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%)' : '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                fontSize: 14,
                color: '#333',
                fontWeight: 500,
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: mode === ConversationMode.EDIT ? 8 : 0
              }}>
                {initialPrompt || '对话会话'}
              </span>
              
              {mode === ConversationMode.EDIT && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {/* 项目名称 */}
                  {session.context?.projectInfo?.workDir && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      background: 'rgba(255,255,255,0.8)',
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#666',
                      border: '1px solid rgba(0,0,0,0.06)'
                    }}>
                      <span>📁</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                        {session.context.projectInfo.workDir.split('/').pop() || session.context.projectInfo.workDir}
                      </span>
                    </div>
                  )}
                  
                  {/* Git 分支 */}
                  {(session.context?.gitBranch || session.context?.projectInfo?.gitBranch) && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      background: 'rgba(102, 126, 234, 0.1)',
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#667eea',
                      fontWeight: 500,
                      border: '1px solid rgba(102, 126, 234, 0.2)'
                    }}>
                      <span>🌿</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        {session.context.gitBranch || session.context.projectInfo.gitBranch}
                      </span>
                    </div>
                  )}
                  
                  {/* MR 链接或创建按钮 */}
                  {session.context?.gitBranch && session.context.mode === 'edit' && (
                    session.context?.mrUrl ? (
                      <a
                        href={session.context.mrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          background: 'rgba(82, 196, 26, 0.1)',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#52c41a',
                          fontWeight: 500,
                          border: '1px solid rgba(82, 196, 26, 0.2)',
                          textDecoration: 'none',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(82, 196, 26, 0.15)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(82, 196, 26, 0.1)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <span>🔗</span>
                        <span>查看 MR</span>
                      </a>
                    ) : (
                      <Button
                        size="small"
                        icon={<GitlabOutlined />}
                        onClick={handleCreateMR}
                        loading={creatingMR}
                        style={{
                          fontSize: 12,
                          height: 26,
                          padding: '0 10px',
                          borderRadius: 6,
                          fontWeight: 500,
                          color: '#fc6d26',
                          borderColor: '#fc6d26',
                        }}
                      >
                        创建 MR
                      </Button>
                    )
                  )}
                  
                  {/* 预览按钮 */}
                  {session.context?.gitBranch && (() => {
                    const buttonProps = getPreviewButtonProps();
                    return (
                      <Button
                        size="small"
                        icon={buttonProps.icon}
                        onClick={handlePreview}
                        disabled={buttonProps.disabled}
                        style={{
                          fontSize: 12,
                          height: 26,
                          padding: '0 10px',
                          borderRadius: 6,
                          fontWeight: 500,
                          ...buttonProps.style,
                        }}
                      >
                        {buttonProps.text}
                      </Button>
                    );
                  })()}
                  
                  {/* 停止预览按钮 */}
                  {session.context?.previewInfo?.status === PreviewStatus.RUNNING && (
                    <>
                      <Button
                        size="small"
                        icon={<ClockCircleOutlined />}
                        onClick={() => setShowDeploymentModal(true)}
                        style={{
                          fontSize: 12,
                          height: 26,
                          padding: '0 10px',
                          borderRadius: 6,
                          fontWeight: 500,
                          color: '#1890ff',
                          borderColor: '#1890ff',
                        }}
                      >
                        部署详情
                      </Button>
                      <Button
                        size="small"
                        icon={<StopOutlined />}
                        onClick={handleStopPreview}
                        style={{
                          fontSize: 12,
                          height: 26,
                          padding: '0 10px',
                          borderRadius: 6,
                          fontWeight: 500,
                          color: '#ff4d4f',
                          borderColor: '#ff4d4f',
                        }}
                      >
                        停止
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        background: '#fff'
      }}>
        {loading && !session ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" tip="加载对话..." />
          </div>
        ) : (
          sessionId ? renderChatContent() : renderLandingContent()
        )}
      </div>

      {/* 部署详情 Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckOutlined style={{ color: '#52c41a', fontSize: 18 }} />
            <span>部署详情</span>
          </div>
        }
        open={showDeploymentModal}
        onCancel={() => setShowDeploymentModal(false)}
        footer={[
          <Button key="close" onClick={() => setShowDeploymentModal(false)}>
            关闭
          </Button>,
          session?.context?.previewInfo?.url && (
            <Button 
              key="open" 
              type="primary" 
              icon={<LinkOutlined />}
              onClick={() => {
                window.open(session.context.previewInfo!.url, '_blank');
                setShowDeploymentModal(false);
              }}
            >
              打开预览
            </Button>
          )
        ]}
        width={600}
      >
        {(deploymentInfo || session?.context?.previewInfo) && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="部署状态" span={2}>
              <Tag color="success" icon={<CheckOutlined />}>
                运行中
              </Tag>
            </Descriptions.Item>
            
            {deploymentInfo && (
              <>
                <Descriptions.Item label="总耗时" span={2}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#1890ff' }}>
                    <ClockCircleOutlined /> {deploymentInfo.totalTime}s
                  </span>
                </Descriptions.Item>
                
                <Descriptions.Item label="构建耗时">
                  <Tag color="blue">{deploymentInfo.buildTime}s</Tag>
                </Descriptions.Item>
                
                <Descriptions.Item label="启动耗时">
                  <Tag color="cyan">{deploymentInfo.startTime}s</Tag>
                </Descriptions.Item>
              </>
            )}
            
            <Descriptions.Item label="预览地址" span={2}>
              <a 
                href={session?.context?.previewInfo?.url} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ wordBreak: 'break-all' }}
              >
                {session?.context?.previewInfo?.url}
              </a>
            </Descriptions.Item>
            
            <Descriptions.Item label="容器 ID" span={2}>
              <code style={{ 
                fontSize: 11, 
                background: '#f5f5f5', 
                padding: '2px 6px', 
                borderRadius: 3,
                wordBreak: 'break-all'
              }}>
                {session?.context?.previewInfo?.containerId?.substring(0, 12)}
              </code>
            </Descriptions.Item>
            
            {(session?.context?.previewInfo?.imageId || session?.context?.previewInfo?.imageName) && (
              <>
                {session?.context?.previewInfo?.imageName && (
                  <Descriptions.Item label="镇像名称" span={2}>
                    <Tag color="geekblue" icon={<CheckOutlined />}>
                      {session.context.previewInfo.imageName}
                    </Tag>
                  </Descriptions.Item>
                )}
                
                {session?.context?.previewInfo?.imageId && (
                  <Descriptions.Item label="镇像 ID" span={2}>
                    <code style={{ 
                      fontSize: 11, 
                      background: '#f5f5f5', 
                      padding: '2px 6px', 
                      borderRadius: 3,
                      wordBreak: 'break-all'
                    }}>
                      {session.context.previewInfo.imageId.substring(0, 12)}
                    </code>
                  </Descriptions.Item>
                )}
              </>
            )}
            
            {(deploymentInfo?.ports || session?.context?.previewInfo?.ports) && (
              <Descriptions.Item label="端口映射" span={2}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(deploymentInfo?.ports || session?.context?.previewInfo?.ports)?.map((port: any, index: number) => (
                    <div 
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 12px',
                        background: '#f0f5ff',
                        borderRadius: 6,
                        border: '1px solid #d6e4ff'
                      }}
                    >
                      <Tag color="purple" style={{ margin: 0, minWidth: 100 }}>
                        {port.service}
                      </Tag>
                      <span style={{ fontFamily: 'monospace', fontSize: 13 }}>
                        {port.host} → {port.container}
                      </span>
                      <a 
                        href={`http://${session?.context?.previewInfo?.url?.split('//')[1]?.split(':')[0]}:${port.host}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginLeft: 'auto', fontSize: 12 }}
                      >
                        访问 <LinkOutlined />
                      </a>
                    </div>
                  ))}
                </div>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default ConversationView;
