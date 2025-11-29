import React from 'react';
import { useStreamingMessage } from '../hooks/useStreamingMessage';

/**
 * 流式消息组件属性
 */
export interface StreamingMessageProps {
  sessionId: string;
  messageId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
  className?: string;
  showControls?: boolean;
  enableTypewriter?: boolean;
}

/**
 * 流式消息组件
 * 显示带有打字机效果的流式消息
 */
export const StreamingMessage: React.FC<StreamingMessageProps> = ({
  sessionId,
  messageId,
  onComplete,
  onError,
  className = '',
  showControls = false,
  enableTypewriter = true,
}) => {
  const {
    displayedContent,
    isComplete,
    isTyping,
    isPaused,
    isConnected,
    progress,
    error,
    reconnectAttempts,
    pause,
    resume,
    skip,
    reconnect,
  } = useStreamingMessage(sessionId, messageId, {
    sse: {
      onComplete,
      onError,
    },
    typewriter: {
      enabled: enableTypewriter,
      speed: 30,
      autoScroll: true,
    },
  });

  // 错误显示
  if (error) {
    return (
      <div className={`streaming-message error ${className}`}>
        <div className="error-content">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
          {reconnectAttempts > 0 && (
            <button onClick={reconnect} className="reconnect-btn">
              重试
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`streaming-message ${className}`}>
      {/* 消息内容 */}
      <div className="message-content">
        {displayedContent}
        {isTyping && <span className="typing-cursor">▋</span>}
      </div>

      {/* 状态指示器 */}
      {!isComplete && (
        <div className="status-indicator">
          {isConnected ? (
            <span className="status-dot connected" title="已连接" />
          ) : (
            <span className="status-dot connecting" title="连接中..." />
          )}
        </div>
      )}

      {/* 控制按钮（可选） */}
      {showControls && !isComplete && (
        <div className="controls">
          {isTyping && (
            <>
              {isPaused ? (
                <button onClick={resume} className="control-btn" title="继续">
                  ▶️
                </button>
              ) : (
                <button onClick={pause} className="control-btn" title="暂停">
                  ⏸️
                </button>
              )}
              <button onClick={skip} className="control-btn" title="跳过动画">
                ⏭️
              </button>
            </>
          )}
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default StreamingMessage;
