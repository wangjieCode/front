import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Spin, Typography, Button, Input, message, Modal, Descriptions, Tag, Tooltip, Select, Dropdown } from 'antd';
import { ThunderboltOutlined, SendOutlined, RocketOutlined, CheckOutlined, WarningOutlined, StopOutlined, GitlabOutlined, ClockCircleOutlined, LinkOutlined, LockOutlined, InboxOutlined, GlobalOutlined, EllipsisOutlined } from '@ant-design/icons';
import ModeSelector from './ModeSelector';
import ProjectSelector from './ProjectSelector';
import {
  ConversationSession,
  ConversationMessage,
  ConversationMode,
  ConversationStatus,
  ConversationVisibility,
  ImageAttachment,
  PreviewStatus,
} from '../types/conversation';
import { Project } from '../types/project';
import MessageInput from './MessageInput';
import MessageList from './MessageList';
import { conversationService } from '../services/conversationService';
import { parseNeovateChunkStructured, ParsedContent } from '../utils/neovateParser';
import { authUtils } from '../utils/auth';
import { DEFAULT_NEOVATE_MODEL, NEOVATE_MODEL_OPTIONS, isNeovateModelSupported } from '../constants/neovateModels';

interface ConversationViewProps {
  sessionId?: string;
  initialPrompt?: string;
  initialSession?: ConversationSession;
  onNewConversation?: (prompt: string, mode: ConversationMode, projectId: string, baseBranch?: string, model?: string) => Promise<void>;
  onVisibilityChange?: (sessionId: string, visibility: ConversationVisibility) => void;
  mode?: ConversationMode;
  onModeChange?: (mode: ConversationMode) => void;
  autoSend?: boolean;
  initialContent?: string;
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
  onVisibilityChange,
  mode = ConversationMode.READONLY,
  onModeChange,
  autoSend,
  initialContent,
}) => {
  const [session, setSession] = useState<ConversationSession | null>(initialSession || null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [creatingMR, setCreatingMR] = useState(false);
  const [stoppingPreview, setStoppingPreview] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const hasAutoSentRef = useRef(false);
  const suppressInitialLoadRef = useRef(false);
  const currentUserId = authUtils.getUserId();

  // New conversation state
  const [prompt, setPrompt] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [baseBranch, setBaseBranch] = useState<string>('');
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_NEOVATE_MODEL);
  const [chatModel, setChatModel] = useState<string>(DEFAULT_NEOVATE_MODEL);

  // 预览相关状态
  const [isDeploying, setIsDeploying] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus | null>(null);
  const [deploymentInfo, setDeploymentInfo] = useState<any>(null);
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);

  const lastSentMessageRef = useRef('');
  const streamAbortRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const examplePrompts = [
    '修改一下文案',
    '看一下页面的功能',
    '看一下某接口调用使用了哪些返回值',
  ];

  const loadBranches = async (projectId: string, fallbackBranch: string, canceled?: { value: boolean }) => {
    if (loadingBranches) return;
    setLoadingBranches(true);
    try {
      const result = await conversationService.getGitBranches(projectId);
      if (canceled?.value) return;
      const branches = result.branches || [];
      const defaultBranch = result.defaultBranch || fallbackBranch || branches[0] || '';
      setBranchOptions(branches);
      setBaseBranch(defaultBranch);
    } catch (error) {
      if (canceled?.value) return;
      message.error('获取基线分支失败');
      setBranchOptions(fallbackBranch ? [fallbackBranch] : []);
      setBaseBranch(fallbackBranch);
    } finally {
      if (!canceled?.value) {
        setLoadingBranches(false);
      }
    }
  };

  useEffect(() => {
    if (!selectedProjectId) {
      setBranchOptions([]);
      setBaseBranch('');
      return;
    }

    const canceled = { value: false };
    void loadBranches(selectedProjectId, selectedProject?.gitBranch || '', canceled);

    return () => {
      canceled.value = true;
    };
  }, [selectedProjectId, selectedProject?.gitBranch]);

  useEffect(() => {
    if (!sessionId) {
      setSelectedModel(DEFAULT_NEOVATE_MODEL);
    }
  }, [sessionId]);

  useEffect(() => {
    if (session?.context?.variables?.model) {
      setChatModel(session.context.variables.model);
    } else if (sessionId) {
      setChatModel(DEFAULT_NEOVATE_MODEL);
    }
  }, [sessionId, session?.context?.variables?.model]);

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
        // We only set global loading if we don't have a session to show
        if (!session || session.id !== sessionId) {
          setLoading(false);
        }
      } else {
        // If no initial session, or it doesn't match, we need to fetch.
        setLoading(true);
        setSession(null);
      }

      const tasks = [loadSession()];

      // Only load messages if NOT in autoSend mode.
      // In autoSend mode, we rely on handleSendMessage to create the first message optimistically.
      // Fetching messages immediately would return empty and overwrite the optimistic message.
      if (!autoSend && !suppressInitialLoadRef.current) {
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
  }, [sessionId, initialSession, autoSend]);


  // 处理自动发送消息
  useEffect(() => {
    if (autoSend && initialContent && sessionId && !hasAutoSentRef.current) {
      hasAutoSentRef.current = true;
      suppressInitialLoadRef.current = true;
      if (location.state?.autoSend || location.state?.initialContent) {
        navigate(location.pathname, {
          replace: true,
          state: { ...location.state, autoSend: false, initialContent: undefined },
        });
      }
      const initialModel = location.state?.model || session?.context?.variables?.model || chatModel;
      // 延迟一点点发送，避免组件挂载期的状态竞争
      setTimeout(() => {
        handleSendMessage(initialContent, { modelOverride: initialModel });
      }, 50);
    }
  }, [sessionId, autoSend, initialContent, location.pathname, location.state, navigate, session?.context?.variables?.model, chatModel]);

  // 自动滚动到最新消息
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 处理内容高度变化导致的滚动（解决打字机效果不跟随滚动的问题）
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      // 只有在正在发送或流式传输时才自动滚动
      const isStreaming = messages.some(msg => (msg as any).isStreaming);
      if (sending || isStreaming) {
        scrollToBottom();
      }
    });

    // 观察内部消息列表的高度变化
    const messageListElement = container.querySelector('.message-list-inner');
    if (messageListElement) {
      observer.observe(messageListElement);
    } else {
      observer.observe(container);
    }

    return () => observer.disconnect();
  }, [sending, messages]);

  // 检查对话是否已归档
  const isArchived = session?.status === ConversationStatus.ARCHIVED;
  const isStreaming = messages.some(msg => (msg as any).isStreaming);

  const handleInterrupt = async () => {
    if (!sessionId) return;
    try {
      const result = await conversationService.interruptConversation(sessionId);
      if (!result.success) {
        message.error(result.error || '中断失败');
        return;
      }
      streamAbortRef.current?.abort();
      setMessages(prev =>
        prev.map(msg =>
          (msg as any).isStreaming ? { ...msg, isStreaming: false } : msg
        )
      );
      setDraftMessage(lastSentMessageRef.current);
      setSending(false);
      message.success('已中断');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '中断失败');
    }
  };

  const loadSession = async () => {
    if (!sessionId) return;
    try {
      const session = await conversationService.getSession(sessionId);
      setSession(session);
    } catch (error) {
      console.error('加载会话失败:', error);
    }
  };

  const loadMessages = async () => {
    if (!sessionId) return;
    try {
      const messages = await conversationService.getMessages(sessionId);
      setMessages(messages);
    } catch (error) {
      console.error('加载消息失败:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (
    content: string,
    options?: { images?: ImageAttachment[]; modelOverride?: string }
  ) => {
    if (!sessionId) return;
    const images = options?.images || [];
    
    // 检查是否已归档
    if (isArchived) {
      message.error('已归档的对话不能发送消息');
      return;
    }
    
    setSending(true);
    lastSentMessageRef.current = content;

    // 立即添加用户消息到界面
    const userMessage: ConversationMessage = {
      id: `temp-user-${Date.now()}`,
      sessionId,
      branchId: session?.context?.gitBranch || 'main',
      role: 'user' as any,
      content,
      metadata: images.length > 0 ? { images } : undefined,
      timestamp: new Date().toISOString(),
    };
    // 创建临时 AI 消息用于流式更新，显示"正在思考"状态
    const aiMessageId = `ai-${Date.now()}`;
    const aiMessage: ConversationMessage = {
      id: aiMessageId,
      sessionId,
      branchId: session?.context?.gitBranch || 'main',
      role: 'assistant' as any,
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      parsedContents: [],
    };
    setMessages(prev => [...prev, userMessage, aiMessage]);

    // 立即滚动到底部
    setTimeout(scrollToBottom, 100);

    try {
      const modelToSend = options?.modelOverride || chatModel;
      const normalizedModel = modelToSend?.toLowerCase();
      const abortController = new AbortController();
      streamAbortRef.current = abortController;
      const response = await fetch(`/api/conversations/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': localStorage.getItem('user_id') || '',
          'x-username': localStorage.getItem('username') || '',
        },
        signal: abortController.signal,
        body: JSON.stringify({
          content,
          ...(images.length > 0 ? { images } : {}),
          ...(normalizedModel && isNeovateModelSupported(normalizedModel) ? { model: normalizedModel } : {}),
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          message.error('请先登录');
          return;
        }
        throw new Error('发送消息失败');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let buffer = '';
      let accumulatedContents: ParsedContent[] = [];
      let fullContent = '';
      let streamCompleted = false;

      const markStreamComplete = () => {
        if (streamCompleted) return;
        streamCompleted = true;
        setMessages(prev =>
          prev.map(msg =>
            msg.id === aiMessageId
              ? { ...msg, isStreaming: false }
              : msg
          )
        );
        console.log('[ConversationView] 流式传输完成，将在 2500ms 后加载消息以获取元数据');
        setTimeout(() => {
          console.log('[ConversationView] 开始加载消息以获取元数据...');
          loadMessages().then(() => {
            console.log('[ConversationView] 消息加载完成');
          });
        }, 2500);
      };

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

              if (data.type === 'user_message') {
                console.log('用户消息已确认');
              } else if (data.type === 'thinking') {
                // AI 开始思考，不再显示"正在思考"文本，等待实际内容
              } else if (data.type === 'chunk') {
                // 累积完整文本内容
                fullContent += data.content;

                // 处理 Neovate SDK result 结束事件（兼容无 complete 场景）
                if (typeof data.content === 'string' && data.content.trim().startsWith('{')) {
                  try {
                    const event = JSON.parse(data.content);
                    if (event?.type === 'result') {
                      markStreamComplete();
                    }
                  } catch (error) {
                    // ignore JSON parse errors
                  }
                }
                
                // 解析 chunk 为结构化内容
                const parsedContents = parseNeovateChunkStructured(data.content);
                
                if (parsedContents.length > 0) {
                  // 累积所有内容
                  accumulatedContents = [...accumulatedContents, ...parsedContents];
                  
                  // 更新消息
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === aiMessageId
                        ? { 
                            ...msg, 
                            content: fullContent, // 使用累积的完整内容
                            parsedContents: accumulatedContents,
                            isStreaming: true 
                          }
                        : msg
                    )
                  );
                  
                  // 实时滚动到底部
                  setTimeout(scrollToBottom, 50);
                } else {
                    // 即使没有结构化内容解析出来（可能是纯空格等），也要更新 content
                    setMessages(prev =>
                        prev.map(msg =>
                          msg.id === aiMessageId
                            ? { 
                                ...msg, 
                                content: fullContent, // 使用累积的完整内容
                                isStreaming: true 
                              }
                            : msg
                        )
                      );
                }
              } else if (data.type === 'complete') {
                markStreamComplete();
              } else if (data.type === 'error') {
                console.error('AI 响应错误:', data.message);
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === aiMessageId
                      ? { 
                          ...msg, 
                          content: `❌ ${data.message}`, 
                          parsedContents: [{ type: 'text', text: `❌ ${data.message}` }],
                          isStreaming: false 
                        }
                      : msg
                  )
                );
              }
            } catch (e) {
              console.error('解析 SSE 数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (error instanceof Error && error.message.includes('aborted')) {
        return;
      }
      console.error('发送消息失败:', error);
      // 更新 AI 消息显示错误
      setMessages(prev =>
        prev.map(msg =>
          msg.id === aiMessageId
            ? { 
                ...msg, 
                content: `❌ 发送失败: ${error instanceof Error ? error.message : '未知错误'}`, 
                parsedContents: [{ 
                  type: 'text', 
                  text: `❌ 发送失败: ${error instanceof Error ? error.message : '未知错误'}` 
                }],
                isStreaming: false 
              }
            : msg
        )
      );
      message.error('发送消息失败，请重试');
    } finally {
      streamAbortRef.current = null;
      suppressInitialLoadRef.current = false;
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
    
    // 检查是否已归档
    if (isArchived) {
      message.error('已归档的对话不能预览');
      return;
    }
    
    if(!session?.context?.projectInfo?.projectName?.includes('boss')) {
      message.error('当前项目不支持预览');
      return
    }
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
      setStoppingPreview(true);
      await conversationService.stopPreview(sessionId);
      message.success('预览已停止');
      setPreviewStatus(PreviewStatus.STOPPED);
      await loadSession();
    } catch (error) {
      message.error(`停止预览失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setStoppingPreview(false);
    }
  };

  /**
   * 创建 MR
   */
  const handleCreateMR = async () => {
    if (!sessionId) return;
    
    // 检查是否已归档
    if (isArchived) {
      message.error('已归档的对话不能创建 MR');
      return;
    }

    setCreatingMR(true);
    try {
      await conversationService.createMergeRequest(sessionId);
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
   * 归档对话
   */
  const handleArchive = async () => {
    if (!sessionId) return;

    Modal.confirm({
      title: '确认归档对话？',
      content: '归档后将无法发送消息、创建 MR 或预览项目。此操作不可逆，归档后无法恢复。',
      okText: '确认归档',
      cancelText: '取消',
      onOk: async () => {
        try {
          await conversationService.archiveConversation(sessionId);
          message.success('对话已归档');
          await loadSession();
        } catch (error) {
          message.error('归档失败: ' + (error instanceof Error ? error.message : '未知错误'));
        }
      },
    });
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
        disabled: false, // 允许点击终止
        style: { background: '#d9d9d9', borderColor: '#d9d9d9' },
        onClick: handleStopPreview, // 点击时终止部署
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
      style: { background: '#7c5cff', borderColor: '#7c5cff', color: '#fff' },
    };
   };

   /**
    * 切换对话可见性
    */
  const handleToggleVisibility = async () => {
     if (!sessionId || !session) return;

     setUpdatingVisibility(true);
     try {
       const currentVisibility = session.visibility || ConversationVisibility.PRIVATE;
       const newVisibility = currentVisibility === ConversationVisibility.PRIVATE
         ? ConversationVisibility.PUBLIC
         : ConversationVisibility.PRIVATE;
       await conversationService.updateVisibility(sessionId, newVisibility);

       // 更新本地状态
       setSession(prev => prev ? { ...prev, visibility: newVisibility } : null);
       onVisibilityChange?.(sessionId, newVisibility);
       message.success(newVisibility === 'public' ? '对话已开启分享' : '对话已设为私密');
     } catch (error) {
       console.error('更新可见性失败:', error);
       message.error('更新可见性失败');
     } finally {
       setUpdatingVisibility(false);
     }
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
        <div style={{ marginBottom: 24, display: 'flex', gap: 20, flexWrap: 'nowrap', alignItems: 'stretch' }}>
          {/* 项目选择器 */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <Text type="secondary" style={{ fontSize: 14, marginBottom: 6, minHeight: 20, display: 'block' }}>
              选择项目 <span style={{ color: '#ff4d4f' }}>*</span>
            </Text>
            <ProjectSelector
              value={selectedProjectId}
              onChange={(projectId, project) => {
                setSelectedProjectId(projectId);
                setSelectedProject(project);
                setBaseBranch(project?.gitBranch || '');
              }}
              placeholder="请选择要操作的项目"
            />
          </div>

          {/* 基线分支选择 */}
          <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <Text type="secondary" style={{ fontSize: 14, marginBottom: 6, minHeight: 20, display: 'block' }}>
              基线分支 <span style={{ color: '#ff4d4f' }}>*</span>
            </Text>
            <Select
              value={baseBranch || undefined}
              placeholder={selectedProjectId ? '请选择基线分支' : '请先选择项目'}
              loading={loadingBranches}
              disabled={!selectedProjectId}
              showSearch
              size="large"
              style={{ width: '100%' }}
              onChange={(value) => setBaseBranch(value)}
              onDropdownVisibleChange={(open) => {
                if (open && selectedProjectId) {
                  void loadBranches(selectedProjectId, selectedProject?.gitBranch || '');
                }
              }}
              options={branchOptions.map(branch => ({ value: branch, label: branch }))}
            />
          </div>

          {/* 模式选择器 */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <Text type="secondary" style={{ fontSize: 14, marginBottom: 6, minHeight: 20, display: 'block' }}>
              对话模式
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
                if (!selectedProjectId) {
                  message.warning('请先选择项目');
                  return;
                }
                if (!baseBranch) {
                  message.warning('请先选择基线分支');
                  return;
                }
                setSending(true);
                try {
                  await onNewConversation(prompt, mode, selectedProjectId, baseBranch, selectedModel);
                } finally {
                  setSending(false);
                }
              }
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            按 Ctrl/Cmd + Enter 发送
          </Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Select
              value={selectedModel}
              size="middle"
              style={{
                width: 210,
                background: '#f7f7f7',
                borderRadius: 8,
                opacity: 0.85,
              }}
              dropdownStyle={{ minWidth: 240 }}
              variant="filled"
              onChange={(value) => setSelectedModel(value)}
              options={NEOVATE_MODEL_OPTIONS.map(option => ({
                value: option.value,
                label: option.recommended ? `${option.label} (recommend)` : option.label,
              }))}
            />
            <Button
              type="primary"
              size="large"
              icon={<SendOutlined />}
              onClick={async () => {
                if (!selectedProjectId) {
                  message.warning('请先选择项目');
                  return;
                }
                if (!baseBranch) {
                  message.warning('请先选择基线分支');
                  return;
                }
                if (onNewConversation) {
                  setSending(true);
                  try {
                    await onNewConversation(prompt, mode, selectedProjectId, baseBranch, selectedModel);
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
                background: 'linear-gradient(135deg, #7c5cff 0%, #6b4ce0 100%)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(124, 92, 255, 0.3)'
              }}
            >
              {sending ? '正在思考...' : '发送'}
            </Button>
          </div>
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
    </div >
  );

  const renderChatContent = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      {/* Messages */}
      <div 
        ref={chatContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 0'
        }}
      >
        {loadingMessages ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" tip="加载消息..." />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            暂无消息
          </div>
        ) : (
          <div className="message-list-inner">
            {/* 状态栏 */}
            <MessageList messages={messages} onMessageClick={handleMessageClick} />
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="chat-input-panel">
        <div className="chat-input-shell">
          <MessageInput
            sessionId={sessionId}
            disabled={sending || isArchived}
            onSend={handleSendMessage}
            value={draftMessage}
            onChange={setDraftMessage}
            placeholder={isArchived ? '已归档的对话不能发送消息' : undefined}
            actions={
              <>
                {isStreaming && (
                  <Button
                    type="text"
                    className="chat-more-button"
                    icon={<StopOutlined />}
                    onClick={handleInterrupt}
                  />
                )}
                <Dropdown
                  trigger={['click']}
                  placement="topRight"
                  disabled={isArchived}
                  dropdownRender={() => (
                    <div className="chat-more-panel">
                      <div className="chat-more-title">模型</div>
                      <Select
                        value={chatModel}
                        size="small"
                        disabled={isArchived}
                        className="chat-model-select"
                        dropdownStyle={{ minWidth: 240 }}
                        onChange={(value) => setChatModel(value)}
                        options={NEOVATE_MODEL_OPTIONS.map(option => ({
                          value: option.value,
                          label: option.recommended ? `${option.label} (recommend)` : option.label,
                        }))}
                      />
                      <Text type="secondary" className="chat-input-hint">
                        Ctrl/Cmd + Enter
                      </Text>
                    </div>
                  )}
                >
                  <Button
                    type="text"
                    className="chat-more-button"
                    icon={<EllipsisOutlined />}
                    disabled={isArchived}
                  />
                </Dropdown>
              </>
            }
          />
        </div>
      </div>
    </div>
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#fff'
    }}>
      {/* Header */}
      {sessionId && session && (
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e5e5e5',
          background: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                fontSize: 14,
                color: '#333',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: 8
              }}>
                {session?.title || session?.context?.taskDescription || initialPrompt || '-'}
              </span>

              {/* 状态徽章 */}
              {isArchived && (
                <Tag icon={<LockOutlined />} color="default" style={{ marginLeft: 8 }}>
                  已归档
                </Tag>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                {/* 项目名称 */}
                {session.context?.projectInfo?.projectName && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    background: '#f8f9fa',
                    borderRadius: 6,
                    fontSize: 12,
                    color: '#666',
                    border: '1px solid #eee'
                  }}>
                    <span>📁</span>
                    <span style={{ fontWeight: 500 }}>
                      {session.context.projectInfo.projectName}
                    </span>
                  </div>
                )}

                {/* 模型展示 */}
                {/* 模型展示已移动到输入区 */}

                {/* 当前分支（仅编辑模式展示） */}
                {session.context?.mode === 'edit' && session.context?.projectInfo?.workDir && (
                  <Tooltip title={`当前分支: ${session.context.projectInfo.workDir.split('/').pop() || session.context.projectInfo.workDir}`}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      background: 'rgba(124, 92, 255, 0.08)',
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#7c5cff',
                      fontWeight: 500,
                      border: '1px solid rgba(124, 92, 255, 0.15)',
                      cursor: 'default'
                    }}>
                      <span>🌿</span>
                      <span style={{ 
                        fontFamily: 'monospace',
                        maxWidth: 150,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        当前: {session.context.projectInfo.workDir.split('/').pop() || session.context.projectInfo.workDir}
                      </span>
                    </div>
                  </Tooltip>
                )}

                {/* 基线分支 */}
                {session.context?.projectInfo?.gitBranch && (
                  <Tooltip title={`基线分支: ${session.context.projectInfo.gitBranch}`}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      background: '#f8f9fa',
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#666',
                      border: '1px solid #eee',
                      cursor: 'default'
                    }}>
                      <span>🎯</span>
                      <span style={{ 
                        fontFamily: 'monospace',
                        maxWidth: 150,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        基线: {session.context.projectInfo.gitBranch}
                      </span>
                    </div>
                  </Tooltip>
                )}

                {/* 开发工具组（仅在编辑模式显示） */}
                {session.context?.mode === 'edit' && (
                  <>
                    {/* MR 链接或创建按钮 */}
                    {session.context.mrUrl ? (
                      <a
                        href={session.context.mrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          background: 'rgba(52, 191, 103, 0.08)',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#34bf67',
                          fontWeight: 500,
                          border: '1px solid rgba(52, 191, 103, 0.15)',
                          textDecoration: 'none'
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
                        disabled={isArchived}
                        style={{
                          fontSize: 12,
                          height: 26,
                          borderRadius: 6,
                          fontWeight: 500,
                          color: '#fc6d26',
                          borderColor: '#fc6d26',
                          background: 'transparent'
                        }}
                      >
                        创建 MR
                      </Button>
                    )}

                    {/* 预览按钮 */}
                    {session.context?.gitBranch && (() => {
                      const buttonProps = getPreviewButtonProps();
                      return (
                        <Button
                          size="small"
                          icon={buttonProps.icon}
                          onClick={buttonProps.onClick || handlePreview}
                          disabled={buttonProps.disabled || isArchived}
                          style={{
                            fontSize: 12,
                            height: 26,
                            borderRadius: 6,
                            fontWeight: 500,
                            ...buttonProps.style,
                          }}
                        >
                          {buttonProps.text}
                        </Button>
                      );
                    })()}

                    {/* 停止预览/详情 */}
                    {session.context?.previewInfo?.status === PreviewStatus.RUNNING && (
                      <div style={{ display: 'flex', gap: 12,}}>
                        <Button
                          size="small"
                          icon={<ClockCircleOutlined />}
                          onClick={() => setShowDeploymentModal(true)}
                          style={{
                            fontSize: 12,
                            height: 26,
                            borderRadius: 6,
                            color: '#7c5cff',
                            borderColor: '#7c5cff'
                          }}
                        >
                          部署详情
                        </Button>
                        <Button
                          size="small"
                          icon={<StopOutlined />}
                          onClick={handleStopPreview}
                          loading={stoppingPreview}
                          danger
                          style={{
                            fontSize: 12,
                            height: 26,
                            borderRadius: 6
                          }}
                        >
                          停止
                        </Button>
                      </div>
                    )}
                  </>
                )}

                 {session?.userId === currentUserId && (
                  <Tooltip title={(session?.visibility || ConversationVisibility.PRIVATE) === ConversationVisibility.PRIVATE ? '开启分享后对话可被所有账户查看' : '设为私密'}>
                    <Button
                      size="small"
                      icon={(session?.visibility || ConversationVisibility.PRIVATE) === ConversationVisibility.PRIVATE ? <LockOutlined /> : <GlobalOutlined />}
                      onClick={handleToggleVisibility}
                      loading={updatingVisibility}
                      style={{
                        fontSize: 12,
                        height: 26,
                        borderRadius: 6,
                        color: (session?.visibility || ConversationVisibility.PRIVATE) === ConversationVisibility.PRIVATE ? '#fa8c16' : '#52c41a',
                        borderColor: (session?.visibility || ConversationVisibility.PRIVATE) === ConversationVisibility.PRIVATE ? '#fa8c16' : '#52c41a',
                        opacity: 0.8
                      }}
                    >
                      {(session?.visibility || ConversationVisibility.PRIVATE) === ConversationVisibility.PRIVATE ? '分享' : '私密'}
                    </Button>
                  </Tooltip>
                )}

                {/* 这个有定时任务根据活跃度自动归档 */}
                {/* {!isArchived && (
                  <Button
                    size="small"
                    icon={<InboxOutlined />}
                    onClick={handleArchive}
                    danger
                    ghost
                    style={{
                      fontSize: 12,
                      height: 26,
                      borderRadius: 6,
                      opacity: 0.8
                    }}
                  >
                    归档
                  </Button>
                )} */}
              </div>
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

            <Descriptions.Item label="实例 ID" span={2}>
              <code style={{
                fontSize: 11,
                background: '#f5f5f5',
                padding: '2px 6px',
                borderRadius: 3,
                wordBreak: 'break-all'
              }}>
                {session?.context?.previewInfo?.containerId}
              </code>
            </Descriptions.Item>

            {(session?.context?.previewInfo?.imageId || session?.context?.previewInfo?.imageName) && (
              <>
                {session?.context?.previewInfo?.imageName && (
                  <Descriptions.Item label="镜像名称" span={2}>
                    <Tag color="geekblue" icon={<CheckOutlined />}>
                      {session.context.previewInfo.imageName}
                    </Tag>
                  </Descriptions.Item>
                )}

                {session?.context?.previewInfo?.imageId && (
                  <Descriptions.Item label="镜像 ID" span={2}>
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
              <Descriptions.Item label="访问端口" span={2}>
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
                        端口: {port.host}
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
