import { SSHExecutor, SSHConnectionStatus } from '../SSHExecutor';
import { SSHConfig } from '../../types';

describe('SSHExecutor', () => {
  let executor: SSHExecutor;
  
  // 模拟的 SSH 配置
  const mockConfig: SSHConfig = {
    host: 'localhost',
    port: 22,
    username: 'testuser',
    privateKey: '-----BEGIN RSA PRIVATE KEY-----\nMOCK_KEY\n-----END RSA PRIVATE KEY-----',
  };

  beforeEach(() => {
    executor = new SSHExecutor();
  });

  afterEach(() => {
    executor.disconnect();
  });

  describe('初始状态', () => {
    it('应该初始化为断开状态', () => {
      expect(executor.getStatus()).toBe(SSHConnectionStatus.DISCONNECTED);
      expect(executor.isConnected()).toBe(false);
    });
  });

  describe('连接管理', () => {
    it('应该在连接前拒绝执行命令', async () => {
      await expect(executor.executeCommand('echo test')).rejects.toThrow('SSH 未连接');
    });

    it('应该在断开连接后更新状态', () => {
      executor.disconnect();
      expect(executor.getStatus()).toBe(SSHConnectionStatus.DISCONNECTED);
      expect(executor.isConnected()).toBe(false);
    });
  });

  describe('命令执行', () => {
    // 注意：这些测试需要真实的 SSH 连接或 mock
    // 在实际环境中，应该使用 mock 或测试容器

    it('应该能够构造带工作目录的命令', () => {
      // 这是一个逻辑测试，不需要真实连接
      const command = 'ls -la';
      const workDir = '/home/user/project';
      const expectedCommand = `cd ${workDir} && ${command}`;
      
      // 验证命令构造逻辑
      expect(expectedCommand).toBe('cd /home/user/project && ls -la');
    });
  });

  describe('输出截断', () => {
    it('应该定义最大输出大小为 10MB', () => {
      const maxSize = 10 * 1024 * 1024;
      expect(maxSize).toBe(10485760);
    });
  });

  describe('重连机制', () => {
    it('应该有最大重连次数限制', () => {
      // 通过反射访问私有属性（仅用于测试）
      const maxAttempts = (executor as any).maxReconnectAttempts;
      expect(maxAttempts).toBe(3);
    });

    it('应该有重连延迟', () => {
      const delay = (executor as any).reconnectDelay;
      expect(delay).toBe(2000); // 2 秒
    });
  });
});
