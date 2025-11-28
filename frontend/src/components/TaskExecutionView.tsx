import React, { useMemo, useState } from 'react';
import { Card, Tag, Space, Empty, Spin, Alert, Typography, Button, Drawer, Badge, Steps } from 'antd';
import {
  ToolOutlined,
  CodeOutlined,
  FileTextOutlined,
  EditOutlined,
  EyeOutlined,
  BranchesOutlined,
  CloudUploadOutlined,
  MergeCellsOutlined
} from '@ant-design/icons';
import { Task, TaskStatus, LogEntry, CodeChange } from '../types';
import LogViewer from './LogViewer';
import StreamingLogViewer from './StreamingLogViewer';
import CodeDiffViewer from './CodeDiffViewer';

const { Text } = Typography;

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
  const [showLogs, setShowLogs] = useState(false);

  // 状态标签映射
  const getStatusTag = (status: TaskStatus) => {
    const statusConfig = {
      [TaskStatus.PENDING]: { color: 'processing', text: '思考中...' },
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

  // 判断是否正在流式传输
  const isStreaming = task?.status === TaskStatus.RUNNING || task?.status === TaskStatus.PENDING;

  // 获取任务类型标签
  const getTypeTag = (type: string) => {
    if (type === 'code_change') {
      return (
        <Tag color="green" icon={<EditOutlined />}>
          编辑模式
        </Tag>
      );
    } else {
      return (
        <Tag color="blue" icon={<EyeOutlined />}>
          只读模式
        </Tag>
      );
    }
  };

  // 获取进度步骤（仅编辑模式）
  const getProgressSteps = (task: Task) => {
    if (task.type !== 'code_change') {
      return null;
    }

    const steps = [
      { title: '代码修改', icon: <CodeOutlined /> },
      { title: '创建分支', icon: <BranchesOutlined /> },
      { title: '提交代码', icon: <CloudUploadOutlined /> },
      { title: '创建 MR', icon: <MergeCellsOutlined /> },
    ];

    let current = 0;
    let status: 'wait' | 'process' | 'finish' | 'error' = 'process';

    if (task.status === TaskStatus.SUCCESS) {
      current = 4;
      status = 'finish';
    } else if (task.status === TaskStatus.FAILED) {
      status = 'error';
      // 根据日志判断失败在哪一步
      const errorLog = logs.find(log => log.level === 'error');
      if (errorLog) {
        if (errorLog.message.includes('创建 MR')) current = 3;
        else if (errorLog.message.includes('推送')) current = 2;
        else if (errorLog.message.includes('提交')) current = 2;
        else if (errorLog.message.includes('分支')) current = 1;
        else current = 0;
      }
    } else if (task.status === TaskStatus.RUNNING) {
      // 根据日志判断当前进度
      const latestLog = logs[logs.length - 1];
      if (latestLog) {
        if (latestLog.message.includes('创建 MR') || latestLog.message.includes('Merge Request')) current = 3;
        else if (latestLog.message.includes('推送')) current = 2;
        else if (latestLog.message.includes('提交')) current = 2;
        else if (latestLog.message.includes('分支')) current = 1;
        else current = 0;
      }
    }

    return (
      <Steps
        current={current}
        status={status}
        items={steps}
        size="small"
        style={{ marginBottom: 24 }}
      />
    );
  };

  // 分离流式日志和普通日志
  const { streamLogs, normalLogs } = useMemo(() => {
    const stream: LogEntry[] = [];
    const normal: LogEntry[] = [];

    logs.forEach(log => {
      if (log.source === 'codetool' && log.level === 'info' && !log.message.includes('🤖') && !log.message.includes('✅')) {
        stream.push(log);
      } else {
        normal.push(log);
      }
    });

    return { streamLogs: stream, normalLogs: normal };
  }, [logs]);

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
      {/* 用户请求 */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 8
        }}>
          <div className="chat-bubble-user" style={{
            padding: '14px 22px',
            maxWidth: '80%',
            fontSize: 16,
            lineHeight: '1.6',
            borderRadius: 16,
            boxShadow: '0 2px 12px rgba(24, 144, 255, 0.15)'
          }}>
            {task.prompt}
          </div>
        </div>
        <div style={{ textAlign: 'right', paddingRight: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatDateTime(task.createdAt)}
          </Text>
        </div>
      </div>

      {/* AI 响应区域 */}
      <Card
        variant="borderless"
        className="chat-bubble-ai"
        style={{
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          border: '1px solid #f0f0f0'
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* 状态指示 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
                color: '#fff',
                fontSize: 18,
                boxShadow: '0 4px 12px rgba(118, 75, 162, 0.3)'
              }}>
                <ToolOutlined />
              </div>
              <Space>
                <Text strong style={{ fontSize: 17 }}>AI 助手</Text>
                {getTypeTag(task.type)}
                {getStatusTag(task.status)}
                {task.completedAt && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    耗时 {getExecutionDuration(task)}
                  </Text>
                )}
              </Space>
            </div>

            {/* 日志开关按钮 */}
            <Button
              icon={<FileTextOutlined />}
              onClick={() => setShowLogs(true)}
              size="small"
              style={{
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              查看执行日志
              {isStreaming && <Badge status="processing" style={{ marginLeft: 4 }} />}
            </Button>
          </div>

          {/* 进度步骤（仅编辑模式） */}
          {getProgressSteps(task)}

          {/* 结果展示 */}
          {task.result && !task.mrUrl && (() => {
            try {
              // 按换行符分割 JSON 对象（neovate stream-json 格式是换行符分隔的）
              const lines = task.result.trim().split('\n').filter(line => line.trim());
              
              // 提取最终的 result 消息
              let finalResult = null;
              for (const line of lines) {
                try {
                  const parsed = JSON.parse(line);
                  if (parsed.type === 'result') {
                    finalResult = parsed;
                    break;
                  }
                } catch (e) {
                  // 跳过无法解析的行
                }
              }

              // 如果找到了 result 消息，展示它
              if (finalResult && finalResult.content) {
                const isSuccess = finalResult.subtype === 'success' || !finalResult.isError;
                return (
                  <div style={{
                    background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
                    padding: '24px',
                    borderRadius: 12,
                    border: `1px solid ${isSuccess ? '#d9f7be' : '#ffe7ba'}`,
                    marginBottom: 16,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      marginBottom: 12
                    }}>
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: isSuccess ? 'linear-gradient(135deg, #52c41a 0%, #73d13d 100%)' : 'linear-gradient(135deg, #faad14 0%, #ffc53d 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 18,
                        flexShrink: 0
                      }}>
                        {isSuccess ? '✓' : 'ℹ'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <Text strong style={{
                          fontSize: 16,
                          color: isSuccess ? '#52c41a' : '#faad14',
                          display: 'block',
                          marginBottom: 12
                        }}>
                          {isSuccess ? '执行成功' : '查询结果'}
                        </Text>
                        <Text style={{
                          whiteSpace: 'pre-wrap',
                          fontSize: 15,
                          lineHeight: '1.8',
                          color: '#262626',
                          display: 'block'
                        }}>
                          {finalResult.content}
                        </Text>
                      </div>
                    </div>
                  </div>
                );
              }

              // 如果没有找到 result 消息，显示原始内容
              return (
                <div style={{
                  background: '#f8f9fa',
                  padding: '16px',
                  borderRadius: 8,
                  marginBottom: 16
                }}>
                  <Text style={{ whiteSpace: 'pre-wrap', fontSize: 15 }}>
                    {task.result}
                  </Text>
                </div>
              );
            } catch (e) {
              // 普通文本
              return (
                <div style={{
                  background: '#f8f9fa',
                  padding: '16px',
                  borderRadius: 8,
                  marginBottom: 16
                }}>
                  <Text style={{ whiteSpace: 'pre-wrap', fontSize: 15 }}>
                    {task.result}
                  </Text>
                </div>
              );
            }
          })()}

          {/* MR 链接 */}
          {task.mrUrl && (
            <Alert
              message="Merge Request 已创建"
              description={
                <div>
                  <div style={{ marginBottom: 8 }}>
                    代码已提交到分支 <Tag>{task.branchName}</Tag>
                  </div>
                  <Button
                    type="primary"
                    href={task.mrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    icon={<MergeCellsOutlined />}
                  >
                    查看 Merge Request
                  </Button>
                </div>
              }
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {/* 错误信息 */}
          {task.error && (
            <Alert
              message="执行出错"
              description={task.error}
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {/* 代码变更 */}
          {codeChanges.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center' }}>
                <CodeOutlined style={{ marginRight: 8 }} />
                <Text strong>代码变更</Text>
              </div>
              <CodeDiffViewer changes={codeChanges} />
            </div>
          )}
        </Space>
      </Card>

      {/* 日志抽屉 */}
      <Drawer
        title={
          <Space>
            <FileTextOutlined />
            <span>执行日志</span>
            {isStreaming && <Tag color="processing">执行中</Tag>}
          </Space>
        }
        placement="right"
        width={600}
        onClose={() => setShowLogs(false)}
        open={showLogs}
      >
        {/* 流式输出日志 */}
        {streamLogs.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <StreamingLogViewer
              logs={streamLogs}
              isStreaming={isStreaming}
            />
          </div>
        )}

        {/* 执行日志 */}
        <LogViewer logs={normalLogs} />
      </Drawer>
    </Space>
  );
};

export default TaskExecutionView;
