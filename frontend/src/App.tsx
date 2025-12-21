import React, { useState, useEffect } from 'react';
import { Layout, Typography, Button, message, List, Spin, Popconfirm, Dropdown, Space } from 'antd';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  PlusOutlined,
  MessageOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  UserOutlined,
  LogoutOutlined,
  FolderOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import ConversationView from './components/ConversationView';
import LoginModal from './components/LoginModal';
import ProjectsPage from './pages/ProjectsPage';
import { conversationService } from './services/conversationService';
import { ConversationMode } from './types/conversation';
import { authUtils } from './utils/auth';
import './App.css';

// 页面类型枚举
enum PageType {
  CONVERSATIONS = 'conversations',
  PROJECTS = 'projects',
}

// AppContent组件处理路由逻辑
const AppContent: React.FC = () => {
  const { Title, Text } = Typography;
  const { Content } = Layout;
  const location = useLocation();
  const [conversations, setConversations] = useState<any[]>([]);
  const [isConversationsLoading, setIsConversationsLoading] = useState(true);
  const [currentConversation, setCurrentConversation] = useState<any | null>(null);
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const [mode, setMode] = useState<ConversationMode>(ConversationMode.EDIT);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ userId: string; username: string } | null>(null);

  // 根据路径确定当前页面
  const currentPage = location.pathname === '/projects' ? PageType.PROJECTS : PageType.CONVERSATIONS;

  // 加载对话列表
  const loadConversations = async () => {
    setIsConversationsLoading(true);
    try {
      const response = await conversationService.listConversations();
      if (response.success && Array.isArray(response.data)) {
        setConversations(response.data);
      }
    } catch (error) {
      console.error('加载对话列表失败:', error);
      message.error('加载对话列表失败');
    } finally {
      setIsConversationsLoading(false);
    }
  };

  // 组件挂载时检查登录状态和加载对话列表
  useEffect(() => {
    const userInfo = authUtils.getUserInfo();
    if (userInfo) {
      setIsLoggedIn(true);
      setCurrentUser(userInfo);
    }
    loadConversations();
  }, []);

  // 提交新对话
  const handleSubmit = async (promptText: string, conversationMode: ConversationMode) => {
    if (!promptText.trim()) {
      message.warning('请输入你的需求');
      return;
    }

    if (!authUtils.isLoggedIn()) {
      setShowLoginModal(true);
      return;
    }

    try {
      const response = await conversationService.createConversation({
        taskId: `task-${Date.now()}`,
        initialPrompt: promptText,
        projectInfo: {
          workDir: '/Users/admin/desktop/front-workspace/dtmall-admin',
          gitBranch: 'master',
        },
        mode: conversationMode,
      });

      if (response.success) {
        const initialPrompt = promptText;
        setCurrentConversation({ ...response.data, initialPrompt });
        setConversations(prev => [response.data, ...prev]);
      }
    } catch (error) {
      console.error('创建对话失败:', error);
      message.error('创建对话失败');
    }
  };

  // 点击历史对话
  const handleConversationClick = (conversation: any) => {
    setCurrentConversation(conversation);
  };

  // 新建对话
  const handleNewConversation = () => {
    setCurrentConversation(null);
    setMode(ConversationMode.EDIT); // 重置为默认模式
  };

  // 登录成功
  const handleLoginSuccess = (userId: string, username: string) => {
    authUtils.setUserInfo(userId, username);
    setIsLoggedIn(true);
    setCurrentUser({ userId, username });
    setShowLoginModal(false);
    message.success(`欢迎回来，${username}！`);
  };

  // 退出登录
  const handleLogout = () => {
    authUtils.clearUserInfo();
    setIsLoggedIn(false);
    setCurrentUser(null);
    message.success('已退出登录');
  };

  // 取消登录
  const handleLoginCancel = () => {
    setShowLoginModal(false);
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Layout.Sider
        width={300}
        className="app-sidebar"
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
        }}
      >
        <div className="sidebar-header">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <Link to="/" className="brand-logo" onClick={handleNewConversation}>
              <img
                src="/ai-avatar.png"
                alt="AI"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%'
                }}
              />
              <Title level={4} className="brand-title">
                前端小秘
              </Title>
            </Link>
            {isLoggedIn && currentUser && (
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'logout',
                      icon: <LogoutOutlined />,
                      label: '退出登录',
                      onClick: handleLogout,
                    },
                  ],
                }}
                placement="bottomRight"
              >
                <Button
                  className="user-info-btn"
                  icon={<UserOutlined />}
                  size="small"
                >
                  {currentUser.username}
                </Button>
              </Dropdown>
            )}
          </div>
          <Button
            type="primary"
            block
            icon={<PlusOutlined />}
            onClick={handleNewConversation}
            className="btn-primary"
          >
            新对话
          </Button>
        </div>
        
        {currentPage === PageType.CONVERSATIONS && (
          <div style={{ padding: '16px' }}>
            {isConversationsLoading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin />
              </div>
            ) : (
              <List
                dataSource={conversations}
                renderItem={(conv: any) => {
                  const mode = conv.context?.mode || ConversationMode.EDIT;
                  const ModeIcon = mode === ConversationMode.EDIT ? EditOutlined : EyeOutlined;
                  const modeColor = mode === ConversationMode.EDIT ? '#1890ff' : '#8c8c8c';

                  return (
                    <List.Item
                      key={conv.id}
                      className={`conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}`}
                      onMouseEnter={() => setHoveredConvId(conv.id)}
                      onMouseLeave={() => setHoveredConvId(null)}
                      style={{
                        cursor: 'pointer',
                        padding: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <div 
                        style={{ flex: 1, minWidth: 0 }}
                        onClick={() => handleConversationClick(conv)}
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
                                  color: mode === ConversationMode.EDIT ? '#7c5cff' : '#8c8c8c',
                                  background: '#ffffff',
                                  borderRadius: '50%',
                                  padding: 2
                                }}
                              />
                            </div>
                          }
                          title={conv.context?.taskDescription || '未命名对话'}
                          description={new Date(conv.createdAt).toLocaleString('zh-CN')}
                        />
                      </div>
                      {hoveredConvId === conv.id && (
                        <Popconfirm
                          title="确认删除"
                          description="确定要删除这个对话吗？"
                          onConfirm={async (e) => {
                            e?.stopPropagation();
                            try {
                              const response = await fetch(`/api/conversations/${conv.id}`, {
                                method: 'DELETE',
                              });
                              const data = await response.json();
                              
                              if (data.success) {
                                message.success('对话已删除');
                                setConversations(prev => prev.filter(c => c.id !== conv.id));
                                if (currentConversation?.id === conv.id) {
                                  setCurrentConversation(null);
                                }
                              } else {
                                message.error(data.error || '删除失败');
                              }
                            } catch (error) {
                              console.error('删除对话失败:', error);
                              message.error('删除失败');
                            }
                          }}
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                            style={{ 
                              flexShrink: 0,
                              opacity: 0.8,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.opacity = '1';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = '0.8';
                            }}
                          />
                        </Popconfirm>
                      )}
                    </List.Item>
                  );
                }}
              />
            )}
          </div>
        )}
      </Layout.Sider>

      <Layout style={{ marginLeft: 300, background: '#f5f5f5', height: '100vh', overflow: 'hidden' }}>
        {/* 页面头部 */}
        <div style={{
          background: '#fff',
          padding: '16px 24px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <Title level={3} style={{ margin: 0, color: '#1a1a1a' }}>
              {currentPage === PageType.PROJECTS ? '项目管理' : '对话'}
            </Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
              {currentPage === PageType.PROJECTS ? '管理您的Git项目和团队成员' : '与AI助手进行对话'}
            </Text>
          </div>
          <Space>
            <Link to="/">
              <Button
                type={currentPage === PageType.CONVERSATIONS ? 'default' : 'primary'}
                icon={<MessageOutlined />}
                className={currentPage === PageType.CONVERSATIONS ? '' : 'btn-primary'}
              >
                对话
              </Button>
            </Link>
            <Link to="/projects">
              <Button
                type={currentPage === PageType.PROJECTS ? 'default' : 'primary'}
                icon={<FolderOutlined />}
                className={currentPage === PageType.PROJECTS ? '' : 'btn-primary'}
              >
                项目
              </Button>
            </Link>
          </Space>
        </div>
        
        <Content className="main-content" style={{ height: 'calc(100% - 73px)', overflow: 'hidden' }}>
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/" element={
              <ConversationView
                sessionId={currentConversation?.id}
                initialPrompt={currentConversation?.initialPrompt}
                initialSession={currentConversation}
                onNewConversation={async (prompt, mode) => {
                  setMode(mode);
                  await handleSubmit(prompt, mode);
                }}
                mode={mode}
                onModeChange={setMode}
              />
            } />
          </Routes>
        </Content>
      </Layout>

      <LoginModal
        visible={showLoginModal}
        onSuccess={handleLoginSuccess}
        onCancel={handleLoginCancel}
      />
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
