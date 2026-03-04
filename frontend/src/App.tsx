import React from 'react';
import { Layout, Typography, Button, Dropdown, Space } from 'antd';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

import {
  PlusOutlined,
  MessageOutlined,
  LogoutOutlined,
  FolderOutlined,
  InfoCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import IntroPage from './pages/IntroPage';
import LoginModal from './components/LoginModal';
import AccountSettingsModal from './components/AccountSettingsModal';
import ProjectsPage from './pages/ProjectsPage';
import './App.css';
import { useAppLogic } from './hooks/useAppLogic';
import ChatRoute from './components/ChatRoute';
import ConversationList from './components/ConversationList';

const AppContent: React.FC = () => {
  const { Title, Text } = Typography;
  const { Content } = Layout;
  const {
    currentPage,
    pageMeta,
    activeSessionId,
    conversations,
    isConversationsLoading,
    mode,
    setMode,
    showLoginModal,
    setShowLoginModal,
    showAccountSettingsModal,
    isLoggedIn,
    currentUser,
    handleSubmit,
    handleConversationClick,
    handleNewConversation,
    handleLoginSuccess,
    handleLogout,
    handleOpenAccountSettings,
    handleAccountSettingsCancel,
    handleAccountUpdated,
    handleVisibilityChange,
    handleLoginCancel,
    handleDeleteConversation,
  } = useAppLogic();
  const isIntroPage = currentPage === 'intro';

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {!isIntroPage && (
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
                  代码伙计
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
            <ConversationList
              conversations={conversations}
              isLoading={isConversationsLoading}
              activeSessionId={activeSessionId}
              onConversationClick={handleConversationClick}
              onDeleteConversation={handleDeleteConversation}
            />
          </div>
        </Layout.Sider>
      )}

      <Layout
        style={{
          marginLeft: isIntroPage ? 0 : 300,
          background: '#f5f5f5',
          height: '100vh',
          overflow: isIntroPage ? 'auto' : 'hidden',
        }}
      >
        {!isIntroPage && (
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
                {pageMeta.title}
              </Title>
              <Text type="secondary" style={{ fontSize: 14 }}>
                {pageMeta.subtitle}
              </Text>
            </div>
            <Space size={16}>
              <div style={{ background: '#f0f0f0', padding: '4px', borderRadius: '8px', display: 'flex' }}>
                <Link to="/">
                  <Button
                    type="text"
                    icon={<MessageOutlined />}
                    style={{
                      background: currentPage === 'conversations' ? '#fff' : 'transparent',
                      boxShadow: currentPage === 'conversations' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                      borderRadius: '6px',
                      color: currentPage === 'conversations' ? '#1a1a1a' : '#666',
                      height: 32,
                      border: 'none'
                    }}
                  >
                    对话
                  </Button>
                </Link>
                <Link to="/projects">
                  <Button
                    type="text"
                    icon={<FolderOutlined />}
                    style={{
                      background: currentPage === 'projects' ? '#fff' : 'transparent',
                      boxShadow: currentPage === 'projects' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                      borderRadius: '6px',
                      color: currentPage === 'projects' ? '#1a1a1a' : '#666',
                      height: 32,
                      border: 'none'
                    }}
                  >
                    项目
                  </Button>
                </Link>
                <Link to="/intro">
                  <Button
                    type="text"
                    icon={<InfoCircleOutlined />}
                    style={{
                      background: currentPage === 'intro' ? '#fff' : 'transparent',
                      boxShadow: currentPage === 'intro' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                      borderRadius: '6px',
                      color: currentPage === 'intro' ? '#1a1a1a' : '#666',
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
                        key: 'account-settings',
                        icon: <SettingOutlined />,
                        label: '账号设置',
                        onClick: handleOpenAccountSettings,
                      },
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
        )}
        <Content className="main-content" style={{ height: isIntroPage ? '100vh' : 'calc(100% - 73px)', overflow: isIntroPage ? 'auto' : 'hidden' }}>
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/intro" element={<IntroPage />} />
            <Route path="/chat/:sessionId" element={
              <ChatRoute
                onNewConversation={handleSubmit}
                mode={mode}
                onModeChange={setMode}
                onVisibilityChange={handleVisibilityChange}
              />
            } />
            <Route path="/" element={
              <ChatRoute
                onNewConversation={handleSubmit}
                mode={mode}
                onModeChange={setMode}
                onVisibilityChange={handleVisibilityChange}
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
      {currentUser && (
        <AccountSettingsModal
          visible={showAccountSettingsModal}
          userId={currentUser.userId}
          username={currentUser.username}
          hasPassword={currentUser.hasPassword}
          onCancel={handleAccountSettingsCancel}
          onUserUpdated={handleAccountUpdated}
        />
      )}
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
