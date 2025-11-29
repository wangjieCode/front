import React, { useState, useEffect } from 'react';
import { Layout, Typography, Input, Button, Space, Card, message, List } from 'antd';
import {
  SendOutlined,
  ThunderboltOutlined,
  RocketOutlined,
  PlusOutlined,
  MessageOutlined,
  EditOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import ConversationView from './components/ConversationView';
import ModeSelector from './components/ModeSelector';
import { conversationService } from './services/conversationService';
import { ConversationMode } from './types/conversation';
import './App.css';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversation, setCurrentConversation] = useState<any | null>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [mode, setMode] = useState<ConversationMode>(ConversationMode.EDIT);

  // 加载对话列表
  const loadConversations = async () => {
    try {
      const response = await conversationService.listConversations();
      if (response.success && Array.isArray(response.data)) {
        setConversations(response.data);
      }
    } catch (error) {
      console.error('加载对话列表失败:', error);
      message.error('加载对话列表失败');
    }
  };

  // 组件挂载时加载对话列表
  useEffect(() => {
    loadConversations();
  }, []);

  // 提交新对话
  const handleSubmit = async () => {
    if (!prompt.trim()) {
      message.warning('请输入你的需求');
      return;
    }

    setIsLoading(true);

    try {
      const response = await conversationService.createConversation({
        taskId: `task-${Date.now()}`,
        initialPrompt: prompt,
        projectInfo: {
          workDir: '/workspace/dtmall-admin',
          gitBranch: 'master',
        },
        mode,
      });

      if (response.success) {
        const initialPrompt = prompt;
        setCurrentConversation({ ...response.data, initialPrompt });
        setShowConversation(true);
        setConversations(prev => [response.data, ...prev]);
        setPrompt('');
      }
    } catch (error) {
      console.error('创建对话失败:', error);
      message.error('创建对话失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 点击历史对话
  const handleConversationClick = (conversation: any) => {
    setCurrentConversation(conversation);
    setShowConversation(true);
  };

  // 新建对话
  const handleNewConversation = () => {
    setShowConversation(false);
    setCurrentConversation(null);
    setPrompt('');
    setMode(ConversationMode.EDIT); // 重置为默认模式
  };

  // 示例提示
  const examplePrompts = [
    '修改一下文案',
    '看一下页面的功能',
    '看一下某接口调用使用了哪些返回值',
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider
        width={300}
        theme="light"
        style={{
          borderRight: '1px solid #f0f0f0',
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
        }}
      >
        <div style={{ padding: '24px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 24,
              cursor: 'pointer',
            }}
            onClick={handleNewConversation}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                width: 32,
                height: 32,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
                color: '#fff',
              }}
            >
              <RocketOutlined />
            </div>
            <Title level={4} style={{ margin: 0, fontSize: 18 }}>
              前端小秘
            </Title>
          </div>
          <Button
            type="primary"
            block
            icon={<PlusOutlined />}
            onClick={handleNewConversation}
            style={{ borderRadius: 8 }}
          >
            新对话
          </Button>
        </div>
        <div style={{ padding: '16px' }}>
          <List
            dataSource={conversations}
            renderItem={(conv: any) => {
              const mode = conv.context?.mode || ConversationMode.EDIT;
              const ModeIcon = mode === ConversationMode.EDIT ? EditOutlined : EyeOutlined;
              const modeColor = mode === ConversationMode.EDIT ? '#1890ff' : '#8c8c8c';
              
              return (
                <List.Item
                  key={conv.id}
                  onClick={() => handleConversationClick(conv)}
                  style={{
                    cursor: 'pointer',
                    padding: '12px',
                    borderRadius: 8,
                    marginBottom: 8,
                    background: currentConversation?.id === conv.id ? '#e6f7ff' : '#fff',
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <List.Item.Meta
                    avatar={
                      <div style={{ position: 'relative' }}>
                        <MessageOutlined />
                        <ModeIcon 
                          style={{ 
                            position: 'absolute', 
                            bottom: -4, 
                            right: -4, 
                            fontSize: 10,
                            color: modeColor,
                            background: '#fff',
                            borderRadius: '50%',
                            padding: 2
                          }} 
                        />
                      </div>
                    }
                    title={conv.context?.taskDescription || '未命名对话'}
                    description={new Date(conv.createdAt).toLocaleString('zh-CN')}
                  />
                </List.Item>
              );
            }}
          />
        </div>
      </Layout.Sider>

      <Layout style={{ marginLeft: 300, background: '#f0f2f5', minHeight: '100vh' }}>
        <Content style={{ padding: '24px', height: '100vh', overflow: 'auto' }}>
          {!showConversation ? (
            // 主输入界面
            <div style={{
              maxWidth: 800,
              margin: '0 auto',
              paddingTop: '10vh',
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

              {/* 输入卡片 */}
              <Card
                className="glass-card"
                style={{
                  borderRadius: 24,
                  border: 'none',
                  padding: '12px',
                  background: '#fff'
                }}
                bodyStyle={{ padding: '24px' }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  {/* 模式选择器 */}
                  <div>
                    <Text type="secondary" style={{ fontSize: 14, marginBottom: 8, display: 'block' }}>
                      选择对话模式：
                    </Text>
                    <ModeSelector value={mode} onChange={setMode} />
                  </div>

                  <div className="main-input-wrapper" style={{ borderRadius: 12, padding: '4px', background: '#f5f5f5' }}>
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
                      onPressEnter={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          handleSubmit();
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
                      onClick={handleSubmit}
                      loading={isLoading}
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
                      {isLoading ? '正在思考...' : '发送'}
                    </Button>
                  </div>
                </Space>
              </Card>

              {/* 示例提示 */}
              <div style={{ marginTop: 48 }}>
                <Space wrap size={[12, 12]} style={{ justifyContent: 'center', width: '100%' }}>
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
                </Space>
              </div>
            </div>
          ) : (
            // 对话界面
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
              {currentConversation && (
                <ConversationView 
                  sessionId={currentConversation.id}
                  initialPrompt={currentConversation.initialPrompt}
                  onClose={handleNewConversation}
                />
              )}
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
