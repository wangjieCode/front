import { WebSocketServer } from '../WebSocketServer';
import { Server } from 'http';
import { TaskStatus, LogLevel } from '../../types';
import { createLogEntry } from '../../models/LogEntry';
import { createCodeChange, ChangeType } from '../../models/CodeChange';

// Mock http.Server
const mockServer = {
  on: jest.fn(),
} as unknown as Server;

// Mock ws
jest.mock('ws', () => {
  return {
    WebSocketServer: jest.fn().mockImplementation(() => ({
      on: jest.fn((event, handler) => {
        if (event === 'connection') {
          // 可以在这里模拟连接
        }
      }),
      close: jest.fn(),
    })),
    WebSocket: {
      OPEN: 1,
    },
  };
});

describe('WebSocketServer', () => {
  let wsServer: WebSocketServer;

  beforeEach(() => {
    wsServer = new WebSocketServer(mockServer);
  });

  describe('初始化', () => {
    it('应该成功创建 WebSocket 服务器', () => {
      expect(wsServer).toBeDefined();
    });

    it('应该初始化时没有客户端连接', () => {
      expect(wsServer.getClientCount()).toBe(0);
    });
  });

  describe('消息发送', () => {
    it('应该能够发送任务状态更新', () => {
      // 这个测试需要模拟 WebSocket 客户端
      expect(() => {
        wsServer.sendTaskStatus('task-123', TaskStatus.RUNNING);
      }).not.toThrow();
    });

    it('应该能够发送任务日志', () => {
      const log = createLogEntry(LogLevel.INFO, 'test', '测试日志');
      
      expect(() => {
        wsServer.sendTaskLog('task-123', log);
      }).not.toThrow();
    });

    it('应该能够发送代码变更通知', () => {
      const changes = [
        createCodeChange('src/app.ts', ChangeType.MODIFIED, 'diff content'),
      ];

      expect(() => {
        wsServer.sendCodeChange('task-123', changes);
      }).not.toThrow();
    });

    it('应该能够发送任务完成通知', () => {
      expect(() => {
        wsServer.sendTaskCompleted('task-123', 'https://gitlab.com/mr/1');
      }).not.toThrow();
    });

    it('应该能够发送任务错误通知', () => {
      expect(() => {
        wsServer.sendTaskError('task-123', 'SSH 连接失败');
      }).not.toThrow();
    });
  });

  describe('广播', () => {
    it('应该能够广播消息', () => {
      const message = {
        type: 'task:status' as const,
        payload: { taskId: 'task-123', status: TaskStatus.RUNNING },
      };

      expect(() => {
        wsServer.broadcast(message);
      }).not.toThrow();
    });
  });

  describe('关闭', () => {
    it('应该能够关闭服务器', () => {
      expect(() => {
        wsServer.close();
      }).not.toThrow();
    });
  });
});
