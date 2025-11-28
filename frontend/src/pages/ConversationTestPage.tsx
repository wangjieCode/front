import React, { useState, useEffect } from 'react';
import { Layout, Button, message, Space, Card, List, Modal, Input } from 'antd';
import { PlusOutlined, MessageOutlined } from '@ant-design/icons';
import ConversationView from '../components/ConversationView';

const { Content, Sider } = Layout;

interface ConversationSession {
  id: string;
  taskId: string;
  status: string;
  createdAt: string;
}

/**
 * 对话测试页面
 * 用于测试多轮对话功能
 */
const ConversationTestPage: React.FC = () => {
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [taskDescription, setTaskDescription] = useState('');

  // 加载会话列表
  const loadSessions = async () => {
    try {
      const response = await fetch('/api/conversations');
      const data = await response.json();
      if (data.success) {
        setSessions(data.data);
      }
    } catch (error) {
      console.error('加载会话列表失败:', error);
      message.error('加载会话列表失败');
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // 创建新会话
  const handleCreateSession = async () => {
    if (!taskDescription.trim()) {
      message.warning('请输入任务描述');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: 'test-task-' + Date.now(),
          taskDescription: taskDescription.trim(),
          projectInfo: {
            workDir: '/workspace',
            gitBranch: 'main',
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        message.success('会话创建成功');
        setCurrentSessionId(data.data.id);
        await loadSessions();
        setIsModalVisible(false);
        setTaskDescription('');
      } else {
        message.error(data.error || '创建会话失败');
      }
    } catch (error) {
      console.error('创建会话失败:', error);
      message.error('创建会话失败');
    } finally {
      setLoading(false);
    }
  };

  // 选择会话
  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={300}
        theme="light"
        style={{
          borderRight: '1px solid #f0f0f0',
          overflow: 'auto',
          height: '100vh',
        }}
      >
        <div style={{ padding: 16 }}>
          <Button
            type="primary"
            block
            icon={<PlusOutlined />}
            onClick={() => setIsModalVisible(true)}
            style={{ marginBottom: 16 }}
          >
            新建对话
          </Button>

          <Card title="对话列表" size="small">
            <List
              dataSource={sessions}
              renderItem={(session) => (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    background:
                      currentSessionId === session.id ? '#e6f7ff' : 'transparent',
                    padding: '8px 12px',
                    borderRadius: 4,
                  }}
                  onClick={() => handleSelectSession(session.id)}
                >
                  <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <div style={{ fontWeight: 500 }}>
                      <MessageOutlined /> {session.taskId}
                    </div>
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {new Date(session.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </div>
      </Sider>

      <Layout>
        <Content style={{ padding: 24, background: '#f0f2f5' }}>
          {currentSessionId ? (
            <ConversationView
              sessionId={currentSessionId}
              onClose={() => setCurrentSessionId(null)}
            />
          ) : (
            <Card>
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <MessageOutlined style={{ fontSize: 64, color: '#ccc' }} />
                <div style={{ marginTop: 16, fontSize: 16, color: '#999' }}>
                  选择一个对话或创建新对话开始
                </div>
              </div>
            </Card>
          )}
        </Content>
      </Layout>

      {/* 创建对话对话框 */}
      <Modal
        title="创建新对话"
        open={isModalVisible}
        onOk={handleCreateSession}
        onCancel={() => setIsModalVisible(false)}
        confirmLoading={loading}
        okText="创建"
        cancelText="取消"
      >
        <div>
          <div style={{ marginBottom: 8 }}>任务描述</div>
          <Input.TextArea
            placeholder="输入任务描述，例如：实现用户登录功能"
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            rows={4}
          />
        </div>
      </Modal>
    </Layout>
  );
};

export default ConversationTestPage;
