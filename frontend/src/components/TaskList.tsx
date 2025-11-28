import React from 'react';
import { Card, List, Tag, Typography, Empty, Space, Tooltip } from 'antd';
import {
  ClockCircleOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  BranchesOutlined,
  LinkOutlined
} from '@ant-design/icons';
import { Task, TaskStatus } from '../types';

const { Text, Paragraph } = Typography;

interface TaskListProps {
  tasks: Task[];
  onTaskClick?: (taskId: string) => void;
  selectedTaskId?: string;
}

/**
 * 任务列表组件
 * 展示所有任务及其状态
 */
const TaskList: React.FC<TaskListProps> = ({ tasks, onTaskClick, selectedTaskId }) => {
  // 确保 tasks 是数组
  const taskList = Array.isArray(tasks) ? tasks : [];

  // 状态图标映射
  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PENDING:
        return <ClockCircleOutlined style={{ color: '#faad14' }} />;
      case TaskStatus.RUNNING:
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      case TaskStatus.SUCCESS:
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case TaskStatus.FAILED:
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return null;
    }
  };

  // 状态标签映射
  const getStatusTag = (status: TaskStatus) => {
    const statusConfig = {
      [TaskStatus.PENDING]: { color: 'default', text: '等待中' },
      [TaskStatus.RUNNING]: { color: 'processing', text: '执行中' },
      [TaskStatus.SUCCESS]: { color: 'success', text: '已完成' },
      [TaskStatus.FAILED]: { color: 'error', text: '失败' },
    };

    const config = statusConfig[status];
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 格式化时间
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;

    return date.toLocaleDateString('zh-CN');
  };

  if (taskList.length === 0) {
    return (
      <Card title="历史记录">
        <Empty
          description="暂无记录"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  return (
    <Card title={`历史记录 (${taskList.length})`}>
      <List
        dataSource={taskList}
        renderItem={(task) => (
          <List.Item
            key={task.id}
            onClick={() => onTaskClick?.(task.id)}
            style={{
              cursor: onTaskClick ? 'pointer' : 'default',
              backgroundColor: selectedTaskId === task.id ? '#f0f5ff' : 'transparent',
              padding: '16px',
              borderRadius: '4px',
              transition: 'background-color 0.3s',
            }}
            className="task-list-item"
          >
            <List.Item.Meta
              avatar={getStatusIcon(task.status)}
              title={
                <Space>
                  {getStatusTag(task.status)}
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {formatTime(task.createdAt)}
                  </Text>
                </Space>
              }
              description={
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <Paragraph
                    ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
                    style={{ marginBottom: 0 }}
                  >
                    {task.prompt}
                  </Paragraph>

                  {task.branchName && (
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      <BranchesOutlined /> {task.branchName}
                    </Text>
                  )}

                  {task.mrUrl && (
                    <Tooltip title="点击查看 Merge Request">
                      <a
                        href={task.mrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: '12px' }}
                      >
                        <LinkOutlined /> 查看 MR
                      </a>
                    </Tooltip>
                  )}

                  {task.error && (
                    <Text type="danger" style={{ fontSize: '12px' }}>
                      错误: {task.error}
                    </Text>
                  )}
                </Space>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};

export default TaskList;
