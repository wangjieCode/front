import React, { useMemo, useState } from 'react';
import { Layout, Button, Drawer, Dropdown, Space, Tabs } from 'antd';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import {
  MenuOutlined,
  MessageOutlined,
  FolderOutlined,
  InfoCircleOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import MobileIntroPage from './mobile-pages/IntroPage';
import MobileProjectsPage from './mobile-pages/ProjectsPage';
import MobileLoginModal from './mobile-components/MobileLoginModal';
import AccountSettingsModal from './components/AccountSettingsModal';
import MobileChatRoute from './mobile-components/MobileChatRoute';
import MobileConversationList from './mobile-components/MobileConversationList';
import MobileCreateConversation from './mobile-components/MobileCreateConversation';
import { useAppLogic } from './hooks/useAppLogic';
import './AppMobile.css';

const MobileContent: React.FC = () => {
  const navigate = useNavigate();
  const { Content, Header } = Layout;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const {
    currentPage,
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
        <div className="mobile-header-main">
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
        </div>

        <div className="mobile-page-shell mobile-page-shell--in-header">
          <Tabs
            className="mobile-tabs"
            activeKey={currentPage}
            items={tabItems}
            onChange={handleTabChange}
            tabBarExtraContent={{
              right: (
                <Button
                  type="primary"
                  size="small"
                  className="mobile-tabs-new-button"
                  onClick={handleNewConversation}
                >
                  新对话
                </Button>
              ),
            }}
          />
        </div>
      </Header>

      <Content className="mobile-content">
        <div className="mobile-route-container">
          <Routes>
            <Route path="/projects" element={<MobileProjectsPage />} />
            <Route path="/intro" element={<MobileIntroPage />} />
            <Route
              path="/chat/:sessionId"
              element={
                <MobileChatRoute
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
                <MobileCreateConversation
                  onNewConversation={handleSubmit}
                  mode={mode}
                  onModeChange={setMode}
                />
              }
            />
          </Routes>
        </div>

      </Content>

      <Drawer
        title="对话列表"
        className="mobile-conversation-drawer"
        placement="left"
        width={320}
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      >
        <MobileConversationList
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

      <MobileLoginModal
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

const AppMobile: React.FC = () => {
  return (
    <Router basename="/m">
      <MobileContent />
    </Router>
  );
};

export default AppMobile;
