import React from 'react';
import { Card, Descriptions, Tag, Space, Empty, Spin, Alert } from 'antd';
import { 
  ClockCircleOutlined, 
  LoadingOutlined, 
  CheckCircleOutlined, 
  CloseCircleOutlined 
} from '@ant-design/icons';
import { Task, TaskStatus, LogEntry, CodeChange } from '../types';
import LogViewer from './LogViewer';
import CodeDiffViewer from './CodeDiffViewer';

interface TaskExecutionViewProps {
  task: Task | null;
  logs: LogEntry[];
  codeChanges: CodeChange[];
  isLoading?: boolean;
}

/**
 * 任务执行视图组件
 * 展示任务详情、执行日志和代码变更
 */
const TaskExecutionView: React.FC<TaskExecutionViewProps> = ({ 
  task, 
  logs, 
  codeChanges,
  isLoading = false 
}) => {
  // 状态图标映射
  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PENDING:
        return <ClockCircleOutlined style={{ color: '#faad14', fontSize: 24 }} />;
      case TaskStatus.RUNNING:
        return <LoadingOutlined style={{ color: '#1890ff', fontSize: 24 }} />;
      case TaskStatus.SUCCESS:
        return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 24 }} />;
      case TaskStatus.FAILED:
        return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 24 }} />;
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
    return <Tag color={config.color} style={{ fontSize: 14 }}>{config.text}</Tag>;
  };

  // 格式化时间
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 计算执行时长
  const getExecutionDuration = (task: Task) => {
    if (!task.completedAt) {
      return '执行中...';
    }
    const start = new Date(task.createdAt).getTime();
    const end = new Date(task.completedAt).getTime();
    const duration = Math.floor((end - start) / 1000);
    
    if (duration < 60) return `${duration} 秒`;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes} 分 ${seconds} 秒`;
  };

  if (!task) {
    return (
      <Card>
        <Empty 
          description="请选择一个任务查看详情"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" tip="加载任务详情..." />
        </div>
      </Card>
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* 任务基本信息 */}
      <Card 
        title={
          <Space>
            {getStatusIcon(task.status)}
            <span>任务详情</span>
          </Space>
        }
      >
        <Descriptions column={1} bordered>
          <Descriptions.Item label="任务 ID">
            <code>{task.id}</code>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            {getStatusTag(task.status)}
          </Descriptions.Item>
          <Descriptions.Item label="任务描述">
            {task.prompt}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {formatDateTime(task.createdAt)}
          </Descriptions.Item>
          {task.completedAt && (
            <Descriptions.Item label="完成时间">
              {formatDateTime(task.completedAt)}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="执行时长">
            {getExecutionDuration(task)}
          </Descriptions.Item>
          {task.branchName && (
            <Descriptions.Item label="分支名称">
              <code>{task.branchName}</code>
            </Descriptions.Item>
          )}
          {task.mrUrl && (
            <Descriptions.Item label="Merge Request">
              <a href={task.mrUrl} target="_blank" rel="noopener noreferrer">
                {task.mrUrl}
              </a>
            </Descriptions.Item>
          )}
          {task.result && !task.mrUrl && (
            <Descriptions.Item label="查询结果">
              <pre style={{ 
                background: '#f5f5f5', 
                padding: '12px', 
                borderRadius: '4px',
                maxHeight: '300px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {task.result}
              </pre>
            </Descriptions.Item>
          )}
        </Descriptions>

        {task.error && (
          <Alert
            message="任务执行失败"
            description={task.error}
            type="error"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
        
        {task.result && !task.mrUrl && (
          <Alert
            message="查询类任务"
            description="此任务为查询类任务，无需创建代码变更和 Merge Request"
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      {/* 执行日志 */}
      <LogViewer logs={logs} />

      {/* 代码变更 */}
      {codeChanges.length > 0 && (
        <CodeDiffViewer changes={codeChanges} />
      )}
    </Space>
  );
};

export default TaskExecutionView;
