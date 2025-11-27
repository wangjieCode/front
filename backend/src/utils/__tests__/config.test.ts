import { validateSSHConfig, getGitDefaultBranch } from '../config';
import { SSHConfig } from '../../types';

describe('Config Utils', () => {
  describe('validateSSHConfig', () => {
    const validConfig: SSHConfig = {
      host: 'example.com',
      port: 22,
      username: 'testuser',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nKEY_CONTENT\n-----END RSA PRIVATE KEY-----',
    };

    it('应该接受有效的配置', () => {
      expect(() => validateSSHConfig(validConfig)).not.toThrow();
    });

    it('应该拒绝空主机地址', () => {
      const config = { ...validConfig, host: '' };
      expect(() => validateSSHConfig(config)).toThrow('SSH 主机地址不能为空');
    });

    it('应该拒绝仅包含空白的主机地址', () => {
      const config = { ...validConfig, host: '   ' };
      expect(() => validateSSHConfig(config)).toThrow('SSH 主机地址不能为空');
    });

    it('应该拒绝无效的端口号（0）', () => {
      const config = { ...validConfig, port: 0 };
      expect(() => validateSSHConfig(config)).toThrow('SSH 端口号无效');
    });

    it('应该拒绝无效的端口号（负数）', () => {
      const config = { ...validConfig, port: -1 };
      expect(() => validateSSHConfig(config)).toThrow('SSH 端口号无效');
    });

    it('应该拒绝无效的端口号（超过 65535）', () => {
      const config = { ...validConfig, port: 65536 };
      expect(() => validateSSHConfig(config)).toThrow('SSH 端口号无效');
    });

    it('应该接受有效的端口号范围', () => {
      expect(() => validateSSHConfig({ ...validConfig, port: 1 })).not.toThrow();
      expect(() => validateSSHConfig({ ...validConfig, port: 22 })).not.toThrow();
      expect(() => validateSSHConfig({ ...validConfig, port: 65535 })).not.toThrow();
    });

    it('应该拒绝空用户名', () => {
      const config = { ...validConfig, username: '' };
      expect(() => validateSSHConfig(config)).toThrow('SSH 用户名不能为空');
    });

    it('应该拒绝仅包含空白的用户名', () => {
      const config = { ...validConfig, username: '   ' };
      expect(() => validateSSHConfig(config)).toThrow('SSH 用户名不能为空');
    });

    it('应该拒绝空私钥', () => {
      const config = { ...validConfig, privateKey: '' };
      expect(() => validateSSHConfig(config)).toThrow('SSH 私钥不能为空');
    });

    it('应该拒绝仅包含空白的私钥', () => {
      const config = { ...validConfig, privateKey: '   ' };
      expect(() => validateSSHConfig(config)).toThrow('SSH 私钥不能为空');
    });
  });

  describe('getGitDefaultBranch', () => {
    const originalEnv = process.env.GIT_DEFAULT_BRANCH;

    afterEach(() => {
      // 恢复原始环境变量
      if (originalEnv !== undefined) {
        process.env.GIT_DEFAULT_BRANCH = originalEnv;
      } else {
        delete process.env.GIT_DEFAULT_BRANCH;
      }
    });

    it('应该返回环境变量中设置的分支', () => {
      process.env.GIT_DEFAULT_BRANCH = 'develop';
      expect(getGitDefaultBranch()).toBe('develop');
    });

    it('应该在未设置时返回默认值 main', () => {
      delete process.env.GIT_DEFAULT_BRANCH;
      expect(getGitDefaultBranch()).toBe('main');
    });

    it('应该在设置为空字符串时返回默认值 main', () => {
      process.env.GIT_DEFAULT_BRANCH = '';
      expect(getGitDefaultBranch()).toBe('main');
    });
  });
});
