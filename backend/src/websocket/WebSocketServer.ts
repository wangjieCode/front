import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { Server } from 'http';
import { TaskStatus, LogEntry, CodeChange } from '../types';

/**
 * WebSocket 消息类型
 */
export type WSMessageType =
  | 'task:status'
  | 'task:log'
  | 'task:codeChange'
  | 'task:completed'
  | 'task:error';

/**
 * WebSocket 消息接口
 */
export interface WSMessage {
  type: WSMessageType;
  payload: any;
}

/**
 * WebSocket 服务器类
 * 负责实时推送任务状态和日志到前端
 */
export class WebSocketServer {
  private wss: WSServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: Server) {
    this.wss = new WSServer({ server });
    this.setupServer();
  }

  /**
   * 设置 WebSocket 服务器
   */
  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket 客户端已连接');
      this.clients.add(ws);

      // 发送欢迎消息
      this.sendToClient(ws, {
        type: 'task:status' as WSMessageType,
        payload: {
          message: '已连接到服务器',
          timestamp: new Date().toISOString(),
        },
      });

      // 处理客户端消息
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('解析客户端消息失败:', error);
        }
      });

      // 处理连接关闭
      ws.on('close', () => {
        console.log('WebSocket 客户端已断开');
        this.clients.delete(ws);
      });

      // 处理错误
      ws.on('error', (error) => {
        console.error('WebSocket 错误:', error);
        this.clients.delete(ws);
      });
    });

    console.log('WebSocket 服务器已启动');
  }

  /**
   * 处理客户端消息
   */
  private handleClientMessage(ws: WebSocket, message: any): void {
    // 可以在这里处理客户端发送的消息
    // 例如：订阅特定任务的更新
    console.log('收到客户端消息:', message);
  }

  /**
   * 发送消息给单个客户端
   */
  private sendToClient(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /**
   * 发送任务状态更新
   */
  sendTaskStatus(taskId: string, status: TaskStatus): void {
    this.broadcast({
      type: 'task:status',
      payload: { taskId, status, timestamp: new Date().toISOString() },
    });
  }

  /**
   * 发送任务日志
   */
  sendTaskLog(taskId: string, log: LogEntry): void {
    this.broadcast({
      type: 'task:log',
      payload: {
        taskId,
        log: {
          ...log,
          timestamp: log.timestamp.toISOString(),
        },
      },
    });
  }

  /**
   * 发送代码变更通知
   */
  sendCodeChange(taskId: string, changes: CodeChange[]): void {
    this.broadcast({
      type: 'task:codeChange',
      payload: { taskId, changes },
    });
  }

  /**
   * 发送任务完成通知
   */
  sendTaskCompleted(taskId: string, mrUrl?: string): void {
    this.broadcast({
      type: 'task:completed',
      payload: { taskId, mrUrl, timestamp: new Date().toISOString() },
    });
  }

  /**
   * 发送任务错误通知
   */
  sendTaskError(taskId: string, error: string): void {
    this.broadcast({
      type: 'task:error',
      payload: { taskId, error, timestamp: new Date().toISOString() },
    });
  }

  /**
   * 获取连接的客户端数量
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 关闭 WebSocket 服务器
   */
  close(): void {
    this.clients.forEach((client) => {
      client.close();
    });
    this.wss.close();
    console.log('WebSocket 服务器已关闭');
  }
}
