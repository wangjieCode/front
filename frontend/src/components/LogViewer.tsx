import React, { useState, useEffect, useRef } from 'react';
import { Card, List, Tag, Typography, Empty, Switch, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { LogEntry, LogLevel } from '../types';

const { Text } = Typography;

interface LogViewerProps {
  logs: LogEntry[];
  autoScroll?: boolean;
}

/**
 * 日志查看器组件
 * 展示任务执行日志，支持语法高亮和自动滚动
 */
const LogViewer: React.FC<LogViewerProps> = ({ logs, autoScroll = true }) => {
  const [isAutoScroll, setIsAutoScroll] = useState(autoScroll);
  const logEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (isAutoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isAutoScroll]);

  // 格式化时间
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // 获取日志级别标签
  const getLevelTag = (level: LogLevel) => {
    const levelConfig = {
      [LogLevel.INFO]: { color: 'blue', text: 'INFO' },
      [LogLevel.ERROR]: { color: 'red', text: 'ERROR' },
    };

    const config = levelConfig[level];
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 获取来源标签颜色
  const getSourceColor = (source: string) => {
    const colorMap: Record<string, string> = {
      ssh: 'cyan',
      neovateai: 'purple',
      gitlab: 'orange',
      git: 'green',
      system: 'default',
    };
    return colorMap[source] || 'default';
  };

  // 下载日志
  const handleDownloadLogs = () => {
    const logText = logs
      .map(log => `[${formatTime(log.timestamp)}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`)
      .join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-logs-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (logs.length === 0) {
    return (
      <Card title="执行日志">
        <Empty 
          description="暂无日志"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  return (
    <Card 
      title="执行日志"
      extra={
        <Space>
          <span style={{ fontSize: 12, color: '#666' }}>自动滚动</span>
          <Switch 
            checked={isAutoScroll} 
            onChange={setIsAutoScroll}
            size="small"
          />
          <DownloadOutlined 
            onClick={handleDownloadLogs}
            style={{ cursor: 'pointer', fontSize: 16 }}
            title="下载日志"
          />
        </Space>
      }
    >
      <div 
        style={{ 
          maxHeight: 400, 
          overflowY: 'auto',
          backgroundColor: '#f5f5f5',
          padding: '12px',
          borderRadius: '4px',
          fontFamily: 'Monaco, Menlo, "Courier New", monospace',
          fontSize: '13px',
        }}
      >
        <List
          dataSource={logs}
          split={false}
          renderItem={(log, index) => (
            <div 
              key={index}
              style={{ 
                marginBottom: 8,
                padding: '8px 12px',
                backgroundColor: log.level === LogLevel.ERROR ? '#fff2f0' : '#fff',
                borderLeft: `3px solid ${log.level === LogLevel.ERROR ? '#ff4d4f' : '#1890ff'}`,
                borderRadius: '2px',
              }}
            >
              <Space size="small" wrap>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatTime(log.timestamp)}
                </Text>
                {getLevelTag(log.level)}
                <Tag color={getSourceColor(log.source)} style={{ fontSize: 11 }}>
                  {log.source}
                </Tag>
              </Space>
              <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                <Text style={{ color: log.level === LogLevel.ERROR ? '#ff4d4f' : '#262626' }}>
                  {log.message}
                </Text>
              </div>
            </div>
          )}
        />
        <div ref={logEndRef} />
      </div>
    </Card>
  );
};

export default LogViewer;
