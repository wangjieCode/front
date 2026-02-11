import React from 'react';
import { Button, List, Popconfirm, Spin } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  LockOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { ConversationMode, ConversationVisibility } from '../types/conversation';

type ConversationListProps = {
  conversations: any[];
  isLoading: boolean;
  activeSessionId: string | null;
  onConversationClick: (conversation: any) => void;
  onDeleteConversation: (conversationId: string) => void;
};

const MobileConversationList: React.FC<ConversationListProps> = ({
  conversations,
  isLoading,
  activeSessionId,
  onConversationClick,
  onDeleteConversation,
}) => {
  if (isLoading) {
    return (
      <div className="mobile-conversation-list-loading">
        <Spin />
      </div>
    );
  }

  if (!conversations.length) {
    return <div className="mobile-conversation-list-empty">暂无对话</div>;
  }

  return (
    <List
      className="mobile-conversation-list"
      dataSource={conversations}
      renderItem={(conv: any) => {
        const mode = conv?.mode || ConversationMode.EDIT;
        const projectName = conv.projectInfo?.projectName
          || conv.context?.projectInfo?.projectName
          || conv.context?.projectInfo?.name
          || conv.context?.projectInfo?.workDir?.split('/').pop();
        const isActive = activeSessionId === conv.id;

        const date = new Date(conv.createdAt);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

        return (
          <List.Item
            key={conv.id}
            className={`mobile-conversation-item ${isActive ? 'active' : ''}`}
            onClick={() => onConversationClick(conv)}
            style={{ cursor: 'pointer' }}
          >
            <div className="mobile-conversation-main">
              <div className="mobile-conversation-title-row">
                <div className="mobile-conversation-title" title={conv.title || conv.overview || conv.context?.taskDescription || '新对话'}>
                  {conv.title || conv.overview || conv.context?.taskDescription || '新对话'}
                </div>
                <span className={`mobile-visibility-pill ${conv.visibility === ConversationVisibility.PUBLIC ? 'public' : 'private'}`}>
                  {conv.visibility === ConversationVisibility.PUBLIC ? <GlobalOutlined /> : <LockOutlined />}
                  {conv.visibility === ConversationVisibility.PUBLIC ? '公开' : '私密'}
                </span>
              </div>

              <div className="mobile-conversation-meta-row">
                <div className="mobile-project-pill" title={projectName || '-'}>
                  <FolderOpenOutlined />
                  <span>{projectName || '-'}</span>
                </div>
                <span className="mobile-date-text">{dateStr}</span>
              </div>
            </div>

            <div className="mobile-conversation-actions" onClick={(e) => e.stopPropagation()}>
              <div className={`mobile-mode-pill ${mode === ConversationMode.EDIT ? 'edit' : ''}`}>
                {mode === ConversationMode.EDIT ? <EditOutlined /> : <ReadOutlined />}
                <span>{mode === ConversationMode.EDIT ? '编辑' : '只读'}</span>
              </div>
              <Popconfirm
                title="确认删除"
                description="确定要删除这个对话吗？"
                onConfirm={(e) => {
                  e?.stopPropagation();
                  onDeleteConversation(conv.id);
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
                  className="mobile-delete-btn"
                />
              </Popconfirm>
            </div>
          </List.Item>
        );
      }}
    />
  );
};

export default MobileConversationList;
