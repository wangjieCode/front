import { Response } from 'express';
import { SSEEvent, SSEEventType, StreamingMessageState, SSEConnectionConfig } from './types';

/**
 * 流式响应管理器（基于 SSE）
 * 管理所有活跃的 SSE 连接和流式消息状态
 */
export class StreamingResponseManager {
  private activeStreams: Map<string, StreamingMessageState>;
  private sseConnections: Map<string, Response>;
  private heartbeatIntervals: Map<string, NodeJS.Timeout>;
  private config: Required<SSEConnectionConfig>;

  constructor(config?: SSEConnectionConfig) {
    this.activeStreams = new Map();
    this.sseConnections = new Map();
    this.heartbeatIntervals = new Map();
    this.config = {
      heartbeatInterval: config?.heartbeatInterval ?? 30000,
      connectionTimeout: config?.connectionTimeout ?? 60000,
    };
  }

  /**
   * 开始流式响应，建立 SSE 连接
   */
  async startStream(sessionId: string, messageId: string, res: Response): Promise<void> {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲

    // 保存连接
    this.sseConnections.set(messageId, res);

    // 初始化流式状态
    this.activeStreams.set(messageId, {
      messageId,
      sessionId,
      content: '',
      isComplete: false,
      lastUpdateAt: new Date(),
    });

    // 启动心跳
    this.startHeartbeat(messageId);

    console.log(`SSE stream started for message ${messageId}`);
  }

  /**
   * 追加流式内容，通过 SSE 推送
   */
  async appendContent(messageId: string, chunk: string): Promise<void> {
    const state = this.activeStreams.get(messageId);
    if (!state) {
      throw new Error(`Stream not found for message ${messageId}`);
    }

    // 更新状态
    state.content += chunk;
    state.lastUpdateAt = new Date();

    // 发送内容片段事件
    this.sendSSEEvent(messageId, {
      type: SSEEventType.CHUNK,
      messageId,
      data: chunk,
      timestamp: Date.now(),
    });
  }

  /**
   * 完成流式响应，关闭 SSE 连接
   */
  async completeStream(messageId: string): Promise<void> {
    const state = this.activeStreams.get(messageId);
    if (!state) {
      console.warn(`Stream not found for message ${messageId}`);
      return;
    }

    // 更新状态
    state.isComplete = true;
    state.lastUpdateAt = new Date();

    // 发送完成事件
    this.sendSSEEvent(messageId, {
      type: SSEEventType.COMPLETE,
      messageId,
      timestamp: Date.now(),
    });

    // 清理资源
    this.cleanup(messageId);

    console.log(`SSE stream completed for message ${messageId}`);
  }

  /**
   * 中断流式响应
   */
  async abortStream(messageId: string, reason?: string): Promise<void> {
    const state = this.activeStreams.get(messageId);
    if (!state) {
      return;
    }

    // 发送错误事件
    this.sendSSEEvent(messageId, {
      type: SSEEventType.ERROR,
      messageId,
      data: reason || 'Stream aborted',
      timestamp: Date.now(),
    });

    // 清理资源
    this.cleanup(messageId);

    console.log(`SSE stream aborted for message ${messageId}: ${reason || 'unknown'}`);
  }

  /**
   * 获取流式状态
   */
  getStreamState(messageId: string): StreamingMessageState | null {
    return this.activeStreams.get(messageId) || null;
  }

  /**
   * 获取所有活跃的流
   */
  getActiveStreams(): string[] {
    return Array.from(this.activeStreams.keys());
  }

  /**
   * 发送 SSE 事件
   */
  private sendSSEEvent(messageId: string, event: SSEEvent): void {
    const res = this.sseConnections.get(messageId);
    if (!res) {
      console.warn(`No SSE connection found for message ${messageId}`);
      return;
    }

    try {
      // SSE 格式：event: type\ndata: json\n\n
      const eventData = JSON.stringify(event);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${eventData}\n\n`);
    } catch (error) {
      console.error(`Error sending SSE event for message ${messageId}:`, error);
      this.cleanup(messageId);
    }
  }

  /**
   * 发送心跳保持连接
   */
  private sendHeartbeat(messageId: string): void {
    this.sendSSEEvent(messageId, {
      type: SSEEventType.HEARTBEAT,
      messageId,
      timestamp: Date.now(),
    });
  }

  /**
   * 启动心跳定时器
   */
  private startHeartbeat(messageId: string): void {
    const interval = setInterval(() => {
      const state = this.activeStreams.get(messageId);
      if (!state) {
        this.stopHeartbeat(messageId);
        return;
      }

      // 检查是否超时
      const now = Date.now();
      const lastUpdate = state.lastUpdateAt.getTime();
      if (now - lastUpdate > this.config.connectionTimeout) {
        console.warn(`Stream timeout for message ${messageId}`);
        this.abortStream(messageId, 'Connection timeout');
        return;
      }

      // 发送心跳
      this.sendHeartbeat(messageId);
    }, this.config.heartbeatInterval);

    this.heartbeatIntervals.set(messageId, interval);
  }

  /**
   * 停止心跳定时器
   */
  private stopHeartbeat(messageId: string): void {
    const interval = this.heartbeatIntervals.get(messageId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(messageId);
    }
  }

  /**
   * 清理资源
   */
  private cleanup(messageId: string): void {
    // 停止心跳
    this.stopHeartbeat(messageId);

    // 关闭连接
    const res = this.sseConnections.get(messageId);
    if (res) {
      try {
        res.end();
      } catch (error) {
        console.error(`Error closing SSE connection for message ${messageId}:`, error);
      }
      this.sseConnections.delete(messageId);
    }

    // 清理状态（保留一段时间以便查询）
    setTimeout(() => {
      this.activeStreams.delete(messageId);
    }, 60000); // 1分钟后清理
  }

  /**
   * 清理所有连接
   */
  async closeAll(): Promise<void> {
    const messageIds = Array.from(this.activeStreams.keys());
    for (const messageId of messageIds) {
      await this.abortStream(messageId, 'Server shutdown');
    }
  }
}

// 导出单例实例
export const streamingManager = new StreamingResponseManager();
