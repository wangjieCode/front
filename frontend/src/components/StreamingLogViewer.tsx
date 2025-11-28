import React, { useState, useEffect, useRef } from 'react';
import { Card, Switch, Space, Typography, Badge } from 'antd';
import { DownloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { LogEntry, LogLevel } from '../types';

const { Text } = Typography;

interface StreamingLogViewerProps {
  logs: LogEntry[];
  autoScroll?: boolean;
  isStreaming?: boolean;
}

/**
 * 流式日志查看器组件
 * 专门用于展示实时流式输出，优化了性能和视觉效果
 */
const StreamingLogViewer: React.FC<StreamingLogViewerProps> = ({ 
  logs, 
  autoScroll = true,
  isStreaming = false 
}) => {
  const [isAutoScroll, setIsAutoScroll] = useState(autoScroll);
  const logEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (isAutoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [logs, isAutoScroll]);

  // 格式化时间
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${timeStr}.${ms}`;
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
    a.download = `streaming-logs-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 判断是否是流式输出日志
  const isStreamLog = (log: LogEntry) => {
    return log.source === 'codetool' && log.level === LogLevel.INFO;
  };

  // 解析对话消息
  const parseConversationMessage = (message: string) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'conversation' && parsed.message) {
        return parsed.message;
      }
    } catch (e) {
      // 不是对话消息格式
    }
    return null;
  };

  // 渲染对话消息
  const renderConversationMessage = (msg: any) => {
    // 只展示 result 类型的消息
    if (msg.type === 'result') {
      const isSuccess = msg.subtype === 'success' || !msg.isError;
      return (
        <div style={{
          padding: '8px 12px',
          marginBottom: 8,
          borderRadius: 6,
          background: isSuccess ? '#f6ffed' : '#fffbe6',
          border: `1px solid ${isSuccess ? '#b7eb8f' : '#ffe58f'}`,
        }}>
          <Text style={{ 
            color: isSuccess ? '#52c41a' : '#faad14',
            fontWeight: 500,
            display: 'block',
            marginBottom: 4
          }}>
            {isSuccess ? '✓ 执行成功' : 'ℹ 查询结果'}
          </Text>
          <Text style={{ color: '#262626' }}>
            {msg.content}
          </Text>
        </div>
      );
    }
    
    // 其他类型的消息暂不展示（assistant、tool 等）
    return null;
  };

  // 渲染日志行
  const renderLogLine = (log: LogEntry, index: number) => {
    const isStream = isStreamLog(log);
    
    // 尝试解析为对话消息
    const conversationMsg = parseConversationMessage(log.message);
    if (conversationMsg) {
      const rendered = renderConversationMessage(conversationMsg);
      if (rendered) {
        return <div key={index}>{rendered}</div>;
      }
      // 如果不需要展示这个消息类型，返回 null
      return null;
    }
    
    return (
      <div 
        key={index}
        style={{ 
          marginBottom: isStream ? 0 : 4,
          padding: isStream ? '2px 8px' : '6px 12px',
          backgroundColor: log.level === LogLevel.ERROR ? '#fff2f0' : 'transparent',
          borderLeft: log.level === LogLevel.ERROR ? '3px solid #ff4d4f' : 'none',
          fontFamily: 'Monaco, Menlo, "Courier New", monospace',
          fontSize: '13px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: log.level === LogLevel.ERROR ? '#ff4d4f' : '#d4d4d4',
          animation: isStreaming && index === logs.length - 1 ? 'fadeIn 0.2s ease-in' : 'none',
        }}
      >
        {!isStream && (
          <Text type="secondary" style={{ fontSize: 11, marginRight: 8, color: '#888' }}>
            [{formatTime(log.timestamp)}]
          </Text>
        )}
        {log.message}
      </div>
    );
  };

  return (
    <Card 
      title={
        <Space>
          <span>实时输出</span>
          {isStreaming && (
            <Badge 
              status="processing" 
              text={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <ThunderboltOutlined /> 流式传输中...
                </Text>
              }
            />
          )}
        </Space>
      }
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
      style={{ marginTop: 16 }}
    >
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(-5px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}
      </style>
      <div 
        ref={containerRef}
        style={{ 
          maxHeight: 500, 
          overflowY: 'auto',
          backgroundColor: '#1e1e1e',
          padding: '16px',
          borderRadius: '4px',
          color: '#d4d4d4',
          position: 'relative',
        }}
      >
        {logs.length === 0 ? (
          <Text type="secondary" style={{ color: '#888' }}>
            等待输出...
          </Text>
        ) : (
          <>
            {logs.map((log, index) => renderLogLine(log, index))}
            {isStreaming && (
              <span 
                style={{ 
                  display: 'inline-block',
                  width: 8,
                  height: 16,
                  backgroundColor: '#52c41a',
                  marginLeft: 4,
                  animation: 'blink 1s infinite',
                }}
              />
            )}
          </>
        )}
        <div ref={logEndRef} />
      </div>
    </Card>
  );
};

export default StreamingLogViewer;
