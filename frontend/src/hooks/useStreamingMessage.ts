import { useSSEStream, SSEClientConfig } from './useSSEStream';
import { useTypewriter, TypewriterConfig } from './useTypewriter';

/**
 * 流式消息配置
 */
export interface StreamingMessageConfig {
  sse?: SSEClientConfig;
  typewriter?: TypewriterConfig;
}

/**
 * 流式消息 Hook
 * 结合 SSE 流式接收和打字机效果
 * 
 * @param sessionId - 会话 ID
 * @param messageId - 消息 ID
 * @param config - 配置选项
 * @returns 流式消息状态和控制方法
 */
export function useStreamingMessage(
  sessionId: string | null,
  messageId: string | null,
  config?: StreamingMessageConfig
) {
  // SSE 流式接收
  const {
    content: rawContent,
    isComplete: sseComplete,
    error: sseError,
    isConnected,
    reconnectAttempts,
    reconnect,
    disconnect,
    reset: resetSSE,
  } = useSSEStream(sessionId, messageId, config?.sse);

  // 打字机效果
  const {
    displayedContent,
    isTyping,
    isPaused,
    progress,
    pause,
    resume,
    skip,
    reset: resetTypewriter,
  } = useTypewriter(rawContent, config?.typewriter);

  /**
   * 重置所有状态
   */
  const reset = () => {
    resetSSE();
    resetTypewriter();
  };

  /**
   * 是否完全完成（SSE 完成且打字机完成）
   */
  const isComplete = sseComplete && !isTyping;

  return {
    // 内容
    rawContent, // 原始内容（SSE 接收到的）
    displayedContent, // 显示内容（打字机效果后的）
    
    // 状态
    isComplete, // 是否完全完成
    sseComplete, // SSE 是否完成
    isTyping, // 是否正在打字
    isPaused, // 是否暂停
    isConnected, // SSE 是否连接
    progress, // 打字进度（0-100）
    
    // 错误
    error: sseError,
    
    // 重连
    reconnectAttempts,
    reconnect,
    
    // 控制方法
    pause, // 暂停打字机
    resume, // 恢复打字机
    skip, // 跳过打字机效果
    disconnect, // 断开 SSE 连接
    reset, // 重置所有状态
  };
}
