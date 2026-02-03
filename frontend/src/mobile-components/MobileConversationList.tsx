import React from 'react';
import { Button, List, Popconfirm, Spin } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  LockOutlined,
  MessageOutlined,
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
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <Spin />
      </div>
    );
  }

  return (
    <List
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
            className={`conversation-item ${isActive ? 'active' : ''}`}
            onClick={() => onConversationClick(conv)}
            style={{
              cursor: 'pointer',
              padding: '12px',
              display: 'flex',
              alignItems: 'flex-start',
            }}
          >
            <div className="conversation-main">
              <div className="conversation-icon">
                <MessageOutlined />
              </div>

              <div className="conversation-content">
                <div className="conversation-title" title={conv.title || conv.overview || conv.context?.taskDescription || '新对话'}>
                  {conv.visibility === ConversationVisibility.PUBLIC ? (
                    <GlobalOutlined style={{ marginRight: 6, color: '#52c41a' }} />
                  ) : (
                    <LockOutlined style={{ marginRight: 6, color: '#999' }} />
                  )}
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
            </div>

            <div className="conversation-actions" onClick={(e) => e.stopPropagation()}>
              <div className={`mode-pill ${mode === ConversationMode.EDIT ? 'edit' : ''}`}>
                {mode === ConversationMode.EDIT ? <EditOutlined style={{ fontSize: 10 }} /> : <ReadOutlined style={{ fontSize: 10 }} />}
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
                  className="delete-btn"
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
