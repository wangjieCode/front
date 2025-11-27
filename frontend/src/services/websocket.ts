import { WSMessage } from '../types';

type MessageHandler = (message: WSMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  connect(url: string = 'ws://localhost:3001') {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket 已连接');
      return;
    }

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('✅ WebSocket 连接成功');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.messageHandlers.forEach(handler => handler(message));
        } catch (error) {
          console.error('解析 WebSocket 消息失败:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket 错误:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket 连接关闭');
        this.attemptReconnect(url);
      };
    } catch (error) {
      console.error('WebSocket 连接失败:', error);
      this.attemptReconnect(url);
    }
  }

  private attemptReconnect(url: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('WebSocket 重连次数已达上限');
      return;
    }

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`尝试重连 WebSocket (${this.reconnectAttempts}/${this.maxReconnectAttempts})，${delay}ms 后重试...`);
    
    this.reconnectTimer = window.setTimeout(() => {
      this.connect(url);
    }, delay);
  }

  disconnect() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.messageHandlers.clear();
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
