import React, { useState } from 'react';
import {
  Card,
  List,
  Button,
  Tag,
  Space,
  Modal,
  Input,
  message,
  Tooltip,
} from 'antd';
import {
  BranchesOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { ConversationBranch } from '../types/conversation';

interface BranchNavigatorProps {
  sessionId?: string;
  branches: ConversationBranch[];
  currentBranchId: string;
  onBranchSwitch: (branchId: string) => Promise<void>;
  onBranchCreate: (name: string, parentMessageId: string) => Promise<void>;
}

/**
 * 分支导航器组件
 * 管理对话分支的创建、切换和可视化
 */
const BranchNavigator: React.FC<BranchNavigatorProps> = ({
  branches,
  currentBranchId,
  onBranchSwitch,
  onBranchCreate,
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [selectedParentMessageId, setSelectedParentMessageId] = useState('');
  const [switching, setSwitching] = useState(false);
  const [creating, setCreating] = useState(false);

  /**
   * 处理分支切换
   */
  const handleBranchSwitch = async (branchId: string) => {
    if (branchId === currentBranchId) {
      return;
    }

    setSwitching(true);
    try {
      await onBranchSwitch(branchId);
      message.success('分支切换成功');
    } catch (error) {
      console.error('切换分支失败:', error);
      message.error('切换分支失败');
    } finally {
      setSwitching(false);
    }
  };

  /**
   * 显示创建分支对话框
   */
  const showCreateModal = () => {
    setIsModalVisible(true);
    setNewBranchName('');
    // 默认从当前分支的最后一条消息创建
    const currentBranch = branches.find((b) => b.id === currentBranchId);
    if (currentBranch && currentBranch.messageIds.length > 0) {
      setSelectedParentMessageId(
        currentBranch.messageIds[currentBranch.messageIds.length - 1]
      );
    }
  };

  /**
   * 处理创建分支
   */
  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) {
      message.warning('请输入分支名称');
      return;
    }

    if (!selectedParentMessageId) {
      message.warning('请选择父消息');
      return;
    }

    setCreating(true);
    try {
      await onBranchCreate(newBranchName.trim(), selectedParentMessageId);
      message.success('分支创建成功');
      setIsModalVisible(false);
      setNewBranchName('');
    } catch (error) {
      console.error('创建分支失败:', error);
      message.error('创建分支失败');
    } finally {
      setCreating(false);
    }
  };

  /**
   * 格式化时间
   */
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * 渲染分支关系可视化
   */
  const renderBranchTree = () => {
    // 简单的树形结构展示
    // 可以根据 parentMessageId 构建更复杂的树形结构
    return (
      <div style={{ marginTop: 16 }}>
        <div
          style={{
            fontSize: 12,
            color: '#999',
            marginBottom: 8,
          }}
        >
          分支关系图
        </div>
        <div
          style={{
            padding: 12,
            background: '#fafafa',
            borderRadius: 4,
            border: '1px dashed #d9d9d9',
          }}
        >
          {branches.map((branch, index) => (
            <div
              key={branch.id}
              style={{
                marginBottom: 8,
                paddingLeft: index > 0 ? 20 : 0,
              }}
            >
              <Space>
                <BranchesOutlined
                  style={{
                    color: branch.isActive ? '#1890ff' : '#999',
                  }}
                />
                <span
                  style={{
                    fontWeight: branch.isActive ? 600 : 400,
                    color: branch.isActive ? '#1890ff' : '#000',
                  }}
                >
                  {branch.name}
                </span>
                <Tag>{branch.messageIds.length} 条消息</Tag>
              </Space>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <Card
        title={
          <Space>
            <BranchesOutlined />
            <span>对话分支</span>
            <Tag color="blue">{branches.length}</Tag>
          </Space>
        }
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={showCreateModal}
          >
            创建分支
          </Button>
        }
        size="small"
      >
        <List
          dataSource={branches}
          renderItem={(branch) => {
            const isActive = branch.id === currentBranchId;
            return (
              <List.Item
                style={{
                  padding: '12px 0',
                  cursor: 'pointer',
                  background: isActive ? '#e6f7ff' : 'transparent',
                  borderRadius: 4,
                  paddingLeft: 12,
                  paddingRight: 12,
                  marginBottom: 4,
                }}
                onClick={() => handleBranchSwitch(branch.id)}
              >
                <List.Item.Meta
                  avatar={
                    isActive ? (
                      <CheckCircleOutlined
                        style={{ fontSize: 20, color: '#1890ff' }}
                      />
                    ) : (
                      <ClockCircleOutlined
                        style={{ fontSize: 20, color: '#999' }}
                      />
                    )
                  }
                  title={
                    <Space>
                      <span
                        style={{
                          fontWeight: isActive ? 600 : 400,
                          color: isActive ? '#1890ff' : '#000',
                        }}
                      >
                        {branch.name}
                      </span>
                      {isActive && <Tag color="blue">当前</Tag>}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      <span style={{ fontSize: 12 }}>
                        {branch.messageIds.length} 条消息
                      </span>
                      <span style={{ fontSize: 11, color: '#999' }}>
                        创建于 {formatTime(branch.createdAt)}
                      </span>
                    </Space>
                  }
                />
                {!isActive && (
                  <Tooltip title="切换到此分支">
                    <Button
                      type="link"
                      size="small"
                      loading={switching}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBranchSwitch(branch.id);
                      }}
                    >
                      切换
                    </Button>
                  </Tooltip>
                )}
              </List.Item>
            );
          }}
        />

        {/* 分支关系可视化 */}
        {branches.length > 1 && renderBranchTree()}
      </Card>

      {/* 创建分支对话框 */}
      <Modal
        title="创建新分支"
        open={isModalVisible}
        onOk={handleCreateBranch}
        onCancel={() => setIsModalVisible(false)}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <div style={{ marginBottom: 8 }}>分支名称</div>
            <Input
              placeholder="输入分支名称，例如：尝试方案B"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onPressEnter={handleCreateBranch}
            />
          </div>
          <div>
            <div style={{ marginBottom: 8, color: '#999', fontSize: 12 }}>
              新分支将从当前分支的最后一条消息开始
            </div>
          </div>
        </Space>
      </Modal>
    </>
  );
};

export default BranchNavigator;
