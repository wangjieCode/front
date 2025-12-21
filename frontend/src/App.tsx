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
                const mode = conv.context?.mode || ConversationMode.EDIT;
                const projectName = conv.context?.projectInfo?.name || conv.context?.projectInfo?.workDir?.split('/').pop();

                return (
                  <List.Item
                    key={conv.id}
                    className={`conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}`}
                    onMouseEnter={() => setHoveredConvId(conv.id)}
                    onMouseLeave={() => setHoveredConvId(null)}
                    style={{
                      cursor: 'pointer',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      borderBottom: '1px solid #f0f0f0',
                      background: currentConversation?.id === conv.id ? '#e6f7ff' : 'transparent',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div
                      style={{ flex: 1, minWidth: 0 }}
                      onClick={() => handleConversationClick(conv)}
                    >
                      <div style={{ display: 'flex', gap: 12 }}>
                        {/* Avatar */}
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: mode === ConversationMode.EDIT ? 'rgba(124, 92, 255, 0.1)' : '#f5f5f5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: mode === ConversationMode.EDIT ? '#7c5cff' : '#999',
                          flexShrink: 0
                        }}>
                          <MessageOutlined style={{ fontSize: 16 }} />
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontWeight: 500,
                            fontSize: 14,
                            color: '#333',
                            marginBottom: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {conv.context?.taskDescription || '未命名对话'}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: mode === ConversationMode.EDIT ? 'rgba(124, 92, 255, 0.1)' : '#f0f0f0',
                                color: mode === ConversationMode.EDIT ? '#7c5cff' : '#666',
                                border: mode === ConversationMode.EDIT ? '1px solid rgba(124, 92, 255, 0.2)' : '1px solid #d9d9d9',
                                whiteSpace: 'nowrap'
                              }}>
                                {mode === ConversationMode.EDIT ? '编辑' : '只读'}
                              </span>

                              {projectName && (
                                <span style={{
                                  fontSize: 12,
                                  color: '#666',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  minWidth: 0
                                }}>
                                  <FolderOutlined style={{ fontSize: 10, flexShrink: 0 }} />
                                  <span style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 90
                                  }}>
                                    {projectName}
                                  </span>
                                </span>
                              )}
                            </div>

                            <div style={{ fontSize: 11, color: '#999' }}>
                              {new Date(conv.createdAt).toLocaleString('zh-CN', {
                                month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
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
                            marginTop: 8,
                            opacity: 0.6,
                            transition: 'opacity 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '1';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '0.6';
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
            <Route path="/" element={
              <ConversationView
                sessionId={currentConversation?.id}
                initialPrompt={currentConversation?.initialPrompt}
                initialSession={currentConversation}
                onNewConversation={async (prompt, mode, projectId) => {
                  setMode(mode);
                  await handleSubmit(prompt, mode, projectId);
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
