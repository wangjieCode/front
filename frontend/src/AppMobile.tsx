import React, { useMemo, useState } from 'react';
import { Layout, Typography, Button, Drawer, Dropdown, Space, Tabs } from 'antd';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import {
  MenuOutlined,
  MessageOutlined,
  FolderOutlined,
  InfoCircleOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import IntroPage from './pages/IntroPage';
import ProjectsPage from './pages/ProjectsPage';
import LoginModal from './components/LoginModal';
import ChatRoute from './components/ChatRoute';
import ConversationList from './components/ConversationList';
import { useAppLogic } from './hooks/useAppLogic';
import './AppMobile.css';

const MobileContent: React.FC = () => {
  const navigate = useNavigate();
  const { Title, Text } = Typography;
  const { Content, Header } = Layout;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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
    isLoggedIn,
    currentUser,
    handleSubmit,
    handleConversationClick,
    handleNewConversation,
    handleLoginSuccess,
    handleLogout,
    handleVisibilityChange,
    handleLoginCancel,
    handleDeleteConversation,
  } = useAppLogic();

  const tabItems = useMemo(() => [
    { key: 'conversations', label: '对话', icon: <MessageOutlined /> },
    { key: 'projects', label: '项目', icon: <FolderOutlined /> },
    { key: 'intro', label: '介绍', icon: <InfoCircleOutlined /> },
  ], []);

  const handleTabChange = (key: string) => {
    if (key === 'conversations') {
      navigate('/');
    } else {
      navigate(`/${key}`);
    }
  };

  return (
    <Layout className="mobile-layout">
      <Header className="mobile-header">
        <div className="mobile-header-left">
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setIsDrawerOpen(true)}
          />
          <Link to="/" className="mobile-brand" onClick={handleNewConversation}>
            <img src="/ai-avatar.png" alt="AI" />
            <span>前端小秘</span>
          </Link>
        </div>
        <Space size={12}>
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
              <div className="mobile-user">
                <div className="mobile-user-avatar">
                  {currentUser.username.charAt(0).toUpperCase()}
                </div>
                <span className="mobile-user-name">{currentUser.username}</span>
              </div>
            </Dropdown>
          ) : (
            <Button type="primary" size="small" onClick={() => setShowLoginModal(true)}>
              登录
            </Button>
          )}
        </Space>
      </Header>

      <Content className="mobile-content">
        <div className="mobile-page-header">
          <div>
            <Title level={4}>{pageMeta.title}</Title>
            <Text type="secondary">{pageMeta.subtitle}</Text>
          </div>
          {currentPage === 'conversations' && (
            <Button type="primary" size="small" onClick={handleNewConversation}>
              新对话
            </Button>
          )}
        </div>

        <Tabs
          className="mobile-tabs"
          activeKey={currentPage}
          items={tabItems}
          onChange={handleTabChange}
        />

        <div className="mobile-route-container">
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/intro" element={<IntroPage />} />
            <Route
              path="/chat/:sessionId"
              element={
                <ChatRoute
                  onNewConversation={handleSubmit}
                  mode={mode}
                  onModeChange={setMode}
                  onVisibilityChange={handleVisibilityChange}
                />
              }
            />
            <Route
              path="/"
              element={
                <ChatRoute
                  onNewConversation={handleSubmit}
                  mode={mode}
                  onModeChange={setMode}
                  onVisibilityChange={handleVisibilityChange}
                />
              }
            />
          </Routes>
        </div>
      </Content>

      <Drawer
        title="对话列表"
        placement="left"
        width={320}
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      >
        <ConversationList
          conversations={conversations}
          isLoading={isConversationsLoading}
          activeSessionId={activeSessionId}
          onConversationClick={(conversation) => {
            handleConversationClick(conversation);
            setIsDrawerOpen(false);
          }}
          onDeleteConversation={handleDeleteConversation}
        />
      </Drawer>

      <LoginModal
        visible={showLoginModal}
        onSuccess={handleLoginSuccess}
        onCancel={handleLoginCancel}
      />
    </Layout>
  );
};

const AppMobile: React.FC = () => {
  return (
    <Router>
      <MobileContent />
    </Router>
  );
};

export default AppMobile;
