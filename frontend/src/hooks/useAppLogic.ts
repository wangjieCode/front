import { useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { conversationService, setLoginModalCallback } from '../services/conversationService';
import { setLoginModalCallback as setProjectLoginModalCallback } from '../services/projectService';
import { ConversationMode, ConversationVisibility } from '../types/conversation';
import { authUtils } from '../utils/auth';

enum PageType {
  CONVERSATIONS = 'conversations',
  PROJECTS = 'projects',
  INTRO = 'intro',
}

const getPageMeta = (page: PageType) => {
  if (page === PageType.PROJECTS) {
    return { title: '项目管理', subtitle: '管理您的Git项目和团队成员' };
  }
  if (page === PageType.INTRO) {
    return { title: '项目介绍', subtitle: '了解前端小秘的功能与优势' };
  }
  return { title: '对话', subtitle: '与AI助手进行对话' };
};

export const useAppLogic = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<any[]>([]);
  const [isConversationsLoading, setIsConversationsLoading] = useState(true);
  const [mode, setMode] = useState<ConversationMode>(ConversationMode.READONLY);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ userId: string; username: string } | null>(null);

  let currentPage = PageType.CONVERSATIONS;
  if (location.pathname === '/projects') {
    currentPage = PageType.PROJECTS;
  } else if (location.pathname === '/intro') {
    currentPage = PageType.INTRO;
  }

  const activeSessionId = location.pathname.match(/\/chat\/(.+)/)?.[1] || null;
  const pageMeta = useMemo(() => getPageMeta(currentPage), [currentPage]);

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

  useEffect(() => {
    const userInfo = authUtils.getUserInfo();
    if (userInfo) {
      setIsLoggedIn(true);
      setCurrentUser(userInfo);
      loadConversations();
    } else {
      setIsConversationsLoading(false);
    }

    const showLogin = () => {
      setIsLoggedIn(false);
      setCurrentUser(null);
      setShowLoginModal(true);
    };

    setLoginModalCallback(showLogin);
    setProjectLoginModalCallback(showLogin);
  }, []);

  const handleSubmit = async (
    promptText: string,
    conversationMode: ConversationMode,
    projectId?: string,
    baseBranch?: string
  ) => {
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
      const response = await conversationService.createConversation({
        initialPrompt: promptText,
        projectId,
        baseBranch,
        mode: conversationMode,
      });

      if (response.success) {
        loadConversations();
        navigate(`/chat/${response.data.id}`, {
          state: {
            session: response.data,
            autoSend: true,
            initialContent: promptText,
            initialPrompt: promptText,
          },
        });
      }
    } catch (error) {
      console.error('创建对话失败:', error);
      message.error('创建对话失败');
    }
  };

  const handleConversationClick = (conversation: any) => {
    setMode(conversation.mode);
    navigate(`/chat/${conversation.id}`, { state: { session: conversation } });
  };

  const handleNewConversation = () => {
    setMode(ConversationMode.READONLY);
    navigate('/');
  };

  const handleLoginSuccess = (userId: string, username: string) => {
    authUtils.setUserInfo(userId, username);
    setIsLoggedIn(true);
    setCurrentUser({ userId, username });
    setShowLoginModal(false);
    message.success(`欢迎回来，${username}！`);
    loadConversations();
  };

  const handleLogout = () => {
    authUtils.clearUserInfo();
    setIsLoggedIn(false);
    setCurrentUser(null);
    message.success('已退出登录');
  };

  const handleVisibilityChange = (sessionId: string, visibility: ConversationVisibility) => {
    setConversations(prev =>
      prev.map(conv =>
        conv.id === sessionId
          ? { ...conv, visibility }
          : conv
      )
    );
  };

  const handleLoginCancel = () => {
    setShowLoginModal(false);
  };

  const handleDeleteConversation = async (conversationId: string) => {
    try {
      const result = await conversationService.deleteConversation(conversationId);

      if (result.success) {
        message.success('对话已删除');
        setConversations(prev => prev.filter(c => c.id !== conversationId));
        if (activeSessionId === conversationId) {
          navigate('/');
        }
      } else {
        message.error(result.error || '删除失败');
      }
    } catch (error) {
      console.error('删除对话失败:', error);
      message.error('删除失败');
    }
  };

  return {
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
  };
};

export type { PageType };
