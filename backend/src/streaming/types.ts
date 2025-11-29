/**
 * SSE 流式响应相关类型定义
 */

/**
 * SSE 事件类型
 */
export enum SSEEventType {
  CHUNK = 'chunk', // 内容片段
  COMPLETE = 'complete', // 完成
  ERROR = 'error', // 错误
  HEARTBEAT = 'heartbeat', // 心跳
}

/**
 * SSE 事件数据
 */
export interface SSEEvent {
  type: SSEEventType;
  messageId: string;
  data?: string; // 内容片段或错误信息
  timestamp: number;
}

/**
 * 流式消息状态
 */
export interface StreamingMessageState {
  messageId: string;
  sessionId: string;
  content: string; // 当前累积的内容
  isComplete: boolean; // 是否完成
  lastUpdateAt: Date; // 最后更新时间
}

/**
 * SSE 连接配置
 */
export interface SSEConnectionConfig {
  heartbeatInterval?: number; // 心跳间隔（毫秒），默认 30000
  connectionTimeout?: number; // 连接超时（毫秒），默认 60000
}
