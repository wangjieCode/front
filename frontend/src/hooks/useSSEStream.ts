import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * SSE 事件类型
 */
export enum SSEEventType {
  CHUNK = 'chunk',
  COMPLETE = 'complete',
  ERROR = 'error',
  HEARTBEAT = 'heartbeat',
}

/**
 * SSE 事件数据
 */
export interface SSEEvent {
  type: SSEEventType;
  messageId: string;
  data?: string;
  timestamp: number;
}

/**
 * SSE 客户端配置
 */
export interface SSEClientConfig {
  reconnect?: boolean; // 是否自动重连
  reconnectInterval?: number; // 重连间隔（毫秒）
  maxReconnectAttempts?: number; // 最大重连次数
  onChunk?: (chunk: string) => void; // 接收到内容片段时的回调
  onComplete?: () => void; // 完成时的回调
  onError?: (error: string) => void; // 错误时的回调
  onHeartbeat?: () => void; // 心跳时的回调
}

/**
 * SSE 流式消息 Hook
 * 
 * @param sessionId - 会话 ID
 * @param messageId - 消息 ID
 * @param config - 配置选项
 * @returns 流式消息状态和控制方法
 */
export function useSSEStream(
  sessionId: string | null,
  messageId: string | null,
  config?: SSEClientConfig
) {
  const [content, setContent] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const defaultConfig: Required<SSEClientConfig> = {
    reconnect: config?.reconnect ?? true,
    reconnectInterval: config?.reconnectInterval ?? 3000,
    maxReconnectAttempts: config?.maxReconnectAttempts ?? 3,
    onChunk: config?.onChunk ?? (() => {}),
    onComplete: config?.onComplete ?? (() => {}),
    onError: config?.onError ?? (() => {}),
    onHeartbeat: config?.onHeartbeat ?? (() => {}),
  };

  /**
   * 断开连接
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  /**
   * 建立连接
   */
  const connect = useCallback(() => {
    if (!sessionId || !messageId) {
      return;
    }

    // 关闭现有连接
    disconnect();

    try {
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/conversations/${sessionId}/messages/${messageId}/stream`;
      const eventSource = new EventSource(url);

      eventSourceRef.current = eventSource;
      setIsConnected(true);
      setError(null);

      // 监听内容片段
      eventSource.addEventListener(SSEEventType.CHUNK, (event) => {
        try {
          const data: SSEEvent = JSON.parse(event.data);
          if (data.data) {
            setContent((prev) => prev + data.data);
            defaultConfig.onChunk(data.data);
          }
        } catch (err) {
          console.error('Error parsing chunk event:', err);
        }
      });

      // 监听完成事件
      eventSource.addEventListener(SSEEventType.COMPLETE, () => {
        setIsComplete(true);
        setIsConnected(false);
        defaultConfig.onComplete();
        disconnect();
      });

      // 监听错误事件
      eventSource.addEventListener(SSEEventType.ERROR, (event: Event) => {
        try {
          const messageEvent = event as MessageEvent;
          const data: SSEEvent = JSON.parse(messageEvent.data);
          const errorMsg = data.data || 'Unknown error';
          setError(errorMsg);
          defaultConfig.onError(errorMsg);
        } catch (err) {
          setError('Stream error');
          defaultConfig.onError('Stream error');
        }
        disconnect();
      });

      // 监听心跳
      eventSource.addEventListener(SSEEventType.HEARTBEAT, () => {
        defaultConfig.onHeartbeat();
      });

      // 处理连接错误
      eventSource.onerror = (err) => {
        console.error('EventSource error:', err);
        setIsConnected(false);

        if (eventSource.readyState === EventSource.CLOSED) {
          // 尝试重连
          if (
            defaultConfig.reconnect &&
            reconnectAttempts < defaultConfig.maxReconnectAttempts
          ) {
            console.log(`Reconnecting... (attempt ${reconnectAttempts + 1})`);
            setReconnectAttempts((prev) => prev + 1);

            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, defaultConfig.reconnectInterval);
          } else {
            setError('Connection closed');
            defaultConfig.onError('Connection closed');
          }
        }
      };
    } catch (err) {
      console.error('Error creating EventSource:', err);
      setError('Failed to connect');
      defaultConfig.onError('Failed to connect');
    }
  }, [sessionId, messageId, reconnectAttempts, disconnect, defaultConfig]);

  /**
   * 手动重连
   */
  const reconnect = useCallback(() => {
    setReconnectAttempts(0);
    setContent('');
    setIsComplete(false);
    setError(null);
    connect();
  }, [connect]);

  /**
   * 重置状态
   */
  const reset = useCallback(() => {
    disconnect();
    setContent('');
    setIsComplete(false);
    setError(null);
    setReconnectAttempts(0);
  }, [disconnect]);

  // 自动连接
  useEffect(() => {
    if (sessionId && messageId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [sessionId, messageId]); // 注意：这里不包含 connect 和 disconnect，避免无限循环

  return {
    content,
    isComplete,
    error,
    isConnected,
    reconnectAttempts,
    reconnect,
    disconnect,
    reset,
  };
}
