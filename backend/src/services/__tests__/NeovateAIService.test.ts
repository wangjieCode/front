import { NeovateAIService } from '../NeovateAIService';
import { SSHExecutor } from '../SSHExecutor';
import { CommandResult, ChangeType } from '../../types';

// Mock SSHExecutor
jest.mock('../SSHExecutor');

describe('NeovateAIService', () => {
  let service: NeovateAIService;
  let mockSSHExecutor: jest.Mocked<SSHExecutor>;

  beforeEach(() => {
    mockSSHExecutor = new SSHExecutor() as jest.Mocked<SSHExecutor>;
    service = new NeovateAIService(mockSSHExecutor, '/test/repo');
  });

  describe('modifyCode', () => {
    it('应该成功执行 AI 代码修改', async () => {
      const mockResult: CommandResult = {
        stdout: 'Modified: src/app.ts\nModified: src/utils.ts',
        stderr: '',
        exitCode: 0,
      };
      const mockDiffResult: CommandResult = {
        stdout: 'diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts',
        stderr: '',
        exitCode: 0,
      };

      mockSSHExecutor.executeCommand = jest.fn()
        .mockResolvedValueOnce(mockResult)
        .mockResolvedValue(mockDiffResult);

      const result = await service.modifyCode('修改登录按钮颜色');

      expect(result.success).toBe(true);
      expect(result.changes.length).toBeGreaterThan(0);
    });

    it('应该在命令执行失败时返回错误', async () => {
      const mockResult: CommandResult = {
        stdout: '',
        stderr: 'Error: qodercli not found',
        exitCode: 127,
      };

      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const result = await service.modifyCode('测试提示词');

      expect(result.success).toBe(false);
      expect(result.message).toContain('执行失败');
      expect(result.changes).toEqual([]);
    });

    it('应该正确转义提示词中的特殊字符', async () => {
      const mockResult: CommandResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      };
      const mockDiffResult: CommandResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      };

      mockSSHExecutor.executeCommand = jest.fn()
        .mockResolvedValueOnce(mockResult)
        .mockResolvedValue(mockDiffResult);

      await service.modifyCode('测试 "引号" 和 $变量 和 `反引号`');

      const call = mockSSHExecutor.executeCommand.mock.calls[0];
      expect(call[0]).toContain('\\"');
      expect(call[0]).toContain('\\$');
      expect(call[0]).toContain('\\`');
    });

    it('应该处理 JSON 格式的输出', async () => {
      const jsonOutput = JSON.stringify([
        {
          filePath: 'src/app.ts',
          changeType: 'modified',
          diff: 'some diff content',
        },
      ]);

      const mockResult: CommandResult = {
        stdout: jsonOutput,
        stderr: '',
        exitCode: 0,
      };

      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const result = await service.modifyCode('测试');

      expect(result.success).toBe(true);
      expect(result.changes.length).toBe(1);
      expect(result.changes[0].filePath).toBe('src/app.ts');
    });

    it('应该解析文件变更标记', async () => {
      const mockResult: CommandResult = {
        stdout: 'Modified: src/app.ts\nCreated: src/new.ts\nDeleted: src/old.ts',
        stderr: '',
        exitCode: 0,
      };
      const mockDiffResult: CommandResult = {
        stdout: 'diff content',
        stderr: '',
        exitCode: 0,
      };

      mockSSHExecutor.executeCommand = jest.fn()
        .mockResolvedValueOnce(mockResult)
        .mockResolvedValue(mockDiffResult);

      const result = await service.modifyCode('测试');

      expect(result.success).toBe(true);
      expect(result.changes.length).toBe(3);
      
      const modifiedFile = result.changes.find(c => c.filePath === 'src/app.ts');
      const createdFile = result.changes.find(c => c.filePath === 'src/new.ts');
      const deletedFile = result.changes.find(c => c.filePath === 'src/old.ts');

      expect(modifiedFile?.changeType).toBe(ChangeType.MODIFIED);
      expect(createdFile?.changeType).toBe(ChangeType.ADDED);
      expect(deletedFile?.changeType).toBe(ChangeType.DELETED);
    });

    it('应该在没有明确标记时通过 git diff 获取变更', async () => {
      const mockResult: CommandResult = {
        stdout: 'Some output without file markers',
        stderr: '',
        exitCode: 0,
      };
      const mockDiffResult: CommandResult = {
        stdout: 'diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,3 +1,3 @@',
        stderr: '',
        exitCode: 0,
      };

      mockSSHExecutor.executeCommand = jest.fn()
        .mockResolvedValueOnce(mockResult)
        .mockResolvedValueOnce(mockDiffResult);

      const result = await service.modifyCode('测试');

      expect(result.success).toBe(true);
      expect(mockSSHExecutor.executeCommand).toHaveBeenCalledWith(
        'git diff HEAD',
        '/test/repo'
      );
    });

    it('应该在解析失败时返回空变更数组', async () => {
      const mockResult: CommandResult = {
        stdout: 'Invalid output that cannot be parsed',
        stderr: '',
        exitCode: 0,
      };
      const mockDiffResult: CommandResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      };

      mockSSHExecutor.executeCommand = jest.fn()
        .mockResolvedValueOnce(mockResult)
        .mockResolvedValueOnce(mockDiffResult);

      const result = await service.modifyCode('测试');

      expect(result.success).toBe(true);
      expect(result.changes).toEqual([]);
    });
  });

  describe('isAvailable', () => {
    it('应该在 qodercli 可用时返回 true', async () => {
      const mockResult: CommandResult = {
        stdout: '/usr/local/bin/neovateai-cli',
        stderr: '',
        exitCode: 0,
      };

      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const available = await service.isAvailable();

      expect(available).toBe(true);
      expect(mockSSHExecutor.executeCommand).toHaveBeenCalledWith(
        'which neovateai-cli',
        '/test/repo'
      );
    });

    it('应该在 neovateai-cli 不可用时返回 false', async () => {
      const mockResult: CommandResult = {
        stdout: '',
        stderr: 'neovateai-cli not found',
        exitCode: 1,
      };

      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const available = await service.isAvailable();

      expect(available).toBe(false);
    });

    it('应该在发生错误时返回 false', async () => {
      mockSSHExecutor.executeCommand = jest.fn().mockRejectedValue(new Error('SSH error'));

      const available = await service.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('getVersion', () => {
    it('应该返回 neovateai-cli 版本', async () => {
      const mockResult: CommandResult = {
        stdout: 'neovateai-cli version 1.2.3',
        stderr: '',
        exitCode: 0,
      };

      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const version = await service.getVersion();

      expect(version).toBe('neovateai-cli version 1.2.3');
    });

    it('应该在获取版本失败时返回 unknown', async () => {
      mockSSHExecutor.executeCommand = jest.fn().mockRejectedValue(new Error('Error'));

      const version = await service.getVersion();

      expect(version).toBe('unknown');
    });
  });
});
