import React, { useState, useEffect } from 'react';
import { Layout, Typography, Button, message, List, Spin, Popconfirm, Dropdown, Space } from 'antd';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  PlusOutlined,
  MessageOutlined,
  DeleteOutlined,
  LogoutOutlined,
  FolderOutlined,
  InfoCircleOutlined,
  FolderOpenOutlined,
  EditOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import IntroPage from './pages/IntroPage';
import ConversationView from './components/ConversationView';
import LoginModal from './components/LoginModal';
import ProjectsPage from './pages/ProjectsPage';
import { conversationService, setLoginModalCallback } from './services/conversationService';
import { setLoginModalCallback as setProjectLoginModalCallback } from './services/projectService';
import { ConversationMode } from './types/conversation';
import { authUtils } from './utils/auth';
import './App.css';

// 页面类型枚举
enum PageType {
  CONVERSATIONS = 'conversations',
  PROJECTS = 'projects',
  INTRO = 'intro',
}

// 包装 ConversationView 以获取 URL 参数
const ChatRoute: React.FC<{
  onNewConversation: (prompt: string, mode: ConversationMode, projectId: string) => Promise<void>;
  mode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
}> = ({ onNewConversation, mode, onModeChange }) => {
  const { sessionId } = useParams();
  const { state } = useLocation();

  return (
    <ConversationView
      sessionId={sessionId}
      initialSession={state?.session}
      onNewConversation={onNewConversation}
      mode={mode}
      onModeChange={onModeChange}
    />
  );
};

// AppContent组件处理路由逻辑
const AppContent: React.FC = () => {
  const { Title, Text } = Typography;
  const { Content } = Layout;
  const location = useLocation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<any[]>([]);
  const [isConversationsLoading, setIsConversationsLoading] = useState(true);
  const [mode, setMode] = useState<ConversationMode>(ConversationMode.READONLY);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ userId: string; username: string } | null>(null);

  // 根据路径确定当前页面
  let currentPage = PageType.CONVERSATIONS;
  if (location.pathname === '/projects') {
    currentPage = PageType.PROJECTS;
  } else if (location.pathname === '/intro') {
    currentPage = PageType.INTRO;
  }

  // 从 URL 获取当前会话 ID
  const activeSessionId = location.pathname.match(/\/chat\/(.+)/)?.[1] || null;

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
    
    // 设置登录回调
    const showLogin = () => {
      setIsLoggedIn(false);
      setCurrentUser(null);
      setShowLoginModal(true);
    };
    
    setLoginModalCallback(showLogin);
    setProjectLoginModalCallback(showLogin);
    
    loadConversations();
  }, []);

  // 提交新对话
  const handleSubmit = async (promptText: string, conversationMode: ConversationMode, projectId?: string) => {
    if (!promptText.trim()) {
      message.warning('请输入你的需求');
      return;
    }

    if (!authUtils.isLoggedIn()) {
      setShowLoginModal(true);
      return;
    }

    if (!projectId) {
      message.error('项目ID不能为空');
      return;
    }

    try {
      console.log('创建对话 - projectId:', projectId); // 调试日志

      const response = await conversationService.createConversation({
        taskId: `task-${Date.now()}`,
        initialPrompt: promptText,
        projectId: projectId,
        mode: conversationMode,
      });

      if (response.success) {
        // 刷新列表
        loadConversations();
        // 跳转到新会话，通过 state 传递初始会话数据，避免前端再次请求可能出现的竞态条件
        navigate(`/chat/${response.data.id}`, { state: { session: response.data } });
      }
    } catch (error) {
      console.error('创建对话失败:', error);
      message.error('创建对话失败');
    }
  };

  // 点击历史对话
  const handleConversationClick = (conversation: any) => {
    setMode(conversation.mode);
    navigate(`/chat/${conversation.id}`);
  };

  // 新建对话
  const handleNewConversation = () => {
    setMode(ConversationMode.EDIT); // 重置为默认模式
    navigate('/');
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
  // 取消登录
  const handleLoginCancel = () => {
    setShowLoginModal(false);
  };

  if (location.pathname === '/intro') {
    return <IntroPage />;
  }

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

        <div style={{ padding: '16px' }}>
          {isConversationsLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <Spin />
            </div>
          ) : (
            <List
              dataSource={conversations}
              renderItem={(conv: any) => {
                const mode = conv?.mode || ConversationMode.EDIT;
                const projectName = conv.projectInfo?.projectName || conv.context?.projectInfo?.projectName || conv.context?.projectInfo?.name || conv.context?.projectInfo?.workDir?.split('/').pop();
                const isActive = activeSessionId === conv.id;
                
                // Date formatting
                const date = new Date(conv.createdAt);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

                return (
                  <List.Item
                    key={conv.id}
                    className={`conversation-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleConversationClick(conv)}
                    style={{
                      cursor: 'pointer',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      position: 'relative',
                      paddingRight: '12px'
                    }}
                  >
                    <div className="conversation-icon">
                      <MessageOutlined />
                    </div>

                    <div className="conversation-content">
                      <div className="conversation-title" title={conv.title || conv.overview || conv.context?.taskDescription || '新对话'}>
                        {conv.title || conv.overview || conv.context?.taskDescription || '新对话'}
                      </div>

                      <div className="conversation-footer">
                        {projectName && (
                          <div className="project-pill" title={projectName}>
                            <FolderOpenOutlined style={{ fontSize: 12 }} />
                            <span>{projectName}</span>
                          </div>
                        )}
                        <span className="date-text">{dateStr}</span>
                      </div>
                    </div>

                    <div className={`mode-corner-tag ${mode === ConversationMode.EDIT ? 'edit' : ''}`}>
                      {mode === ConversationMode.EDIT ? <EditOutlined style={{ fontSize: 10 }} /> : <ReadOutlined style={{ fontSize: 10 }} />}
                      <span>{mode === ConversationMode.EDIT ? '编辑' : '只读'}</span>
                    </div>

                    <div className="delete-action" onClick={(e) => e.stopPropagation()}>
                      <Popconfirm
                        title="确认删除"
                        description="确定要删除这个对话吗？"
                        onConfirm={async (e) => {
                          e?.stopPropagation();
                          try {
                            const userId = localStorage.getItem('user_id');
                            const username = localStorage.getItem('username');
                            
                            const headers: Record<string, string> = {
                              'Content-Type': 'application/json',
                            };
                            
                            if (userId) {
                              headers['x-user-id'] = userId;
                              if (username) {
                                headers['x-username'] = username;
                              }
                            }

                            const response = await fetch(`/api/conversations/${conv.id}`, {
                              method: 'DELETE',
                              headers,
                            });

                            if (response.status === 401) {
                              localStorage.removeItem('user_id');
                              localStorage.removeItem('username');
                              setIsLoggedIn(false);
                              setCurrentUser(null);
                              setShowLoginModal(true);
                              return;
                            }

                            const data = await response.json();

                            if (data.success) {
                              message.success('对话已删除');
                              setConversations(prev => prev.filter(c => c.id !== conv.id));
                              if (activeSessionId === conv.id) {
                                navigate('/');
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
                          className="delete-btn"
                        />
                      </Popconfirm>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </div>
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
              {currentPage === PageType.PROJECTS ? '项目管理' : 
               currentPage === PageType.INTRO ? '项目介绍' : '对话'}
            </Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
            {currentPage === PageType.PROJECTS ? '管理您的Git项目和团队成员' : 
             currentPage === PageType.INTRO ? '了解前端小秘的功能与优势' : '与AI助手进行对话'}
            </Text>
          </div>
          <Space size={16}>
            <div style={{ background: '#f0f0f0', padding: '4px', borderRadius: '8px', display: 'flex' }}>
              <Link to="/">
                <Button
                  type={currentPage === PageType.CONVERSATIONS ? 'text' : 'text'}
                  icon={<MessageOutlined />}
                  style={{
                    background: currentPage === PageType.CONVERSATIONS ? '#fff' : 'transparent',
                    boxShadow: currentPage === PageType.CONVERSATIONS ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                    borderRadius: '6px',
                    color: currentPage === PageType.CONVERSATIONS ? '#1a1a1a' : '#666',
                    height: 32,
                    border: 'none'
                  }}
                >
                  对话
                </Button>
              </Link>
              <Link to="/projects">
                <Button
                  type={currentPage === PageType.PROJECTS ? 'text' : 'text'}
                  icon={<FolderOutlined />}
                  style={{
                    background: currentPage === PageType.PROJECTS ? '#fff' : 'transparent',
                    boxShadow: currentPage === PageType.PROJECTS ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                    borderRadius: '6px',
                    color: currentPage === PageType.PROJECTS ? '#1a1a1a' : '#666',
                    height: 32,
                    border: 'none'
                  }}
                >
                  项目
                </Button>
              </Link>
              <Link to="/intro">
                <Button
                  type={currentPage === PageType.INTRO ? 'text' : 'text'}
                  icon={<InfoCircleOutlined />}
                  style={{
                    background: currentPage === PageType.INTRO ? '#fff' : 'transparent',
                    boxShadow: currentPage === PageType.INTRO ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                    borderRadius: '6px',
                    color: currentPage === PageType.INTRO ? '#1a1a1a' : '#666',
                    height: 32,
                    border: 'none'
                  }}
                >
                  介绍
                </Button>
              </Link>
            </div>

            <div style={{ width: 1, height: 24, background: '#e0e0e0' }} />

            {isLoggedIn && currentUser ? (
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    background: '#7c5cff',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 14
                  }}>
                    {currentUser.username.charAt(0).toUpperCase()}
                  </div>
                  <Text strong style={{ color: '#333' }}>{currentUser.username}</Text>
                </div>
              </Dropdown>
            ) : (
              <Button type="primary" onClick={() => setShowLoginModal(true)}>
                登录
              </Button>
            )}
          </Space>
        </div>
        <Content className="main-content" style={{ height: 'calc(100% - 73px)', overflow: 'hidden' }}>
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/chat/:sessionId" element={
              <ChatRoute
                onNewConversation={handleSubmit}
                mode={mode}
                onModeChange={setMode}
              />
            } />
            <Route path="/" element={
              <ChatRoute
                onNewConversation={handleSubmit}
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
