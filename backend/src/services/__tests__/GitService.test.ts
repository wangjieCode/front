import { GitService } from '../GitService';
import { SSHExecutor } from '../SSHExecutor';
import { CommandResult } from '../../types';

// Mock SSHExecutor
jest.mock('../SSHExecutor');

describe('GitService', () => {
  let gitService: GitService;
  let mockSSHExecutor: jest.Mocked<SSHExecutor>;

  beforeEach(() => {
    mockSSHExecutor = new SSHExecutor() as jest.Mocked<SSHExecutor>;
    gitService = new GitService(mockSSHExecutor, '/test/repo');
  });

  describe('createBranch', () => {
    it('应该成功创建新分支', async () => {
      const mockResult: CommandResult = {
        stdout: "Switched to a new branch 'feature-test'",
        stderr: '',
        exitCode: 0,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const result = await gitService.createBranch('feature-test');

      expect(result.success).toBe(true);
      expect(result.message).toContain('成功创建分支');
      expect(mockSSHExecutor.executeCommand).toHaveBeenCalledWith(
        'git checkout -b feature-test',
        '/test/repo'
      );
    });

    it('应该在创建失败时返回错误', async () => {
      const mockResult: CommandResult = {
        stdout: '',
        stderr: 'fatal: A branch named feature-test already exists',
        exitCode: 128,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const result = await gitService.createBranch('feature-test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('创建分支失败');
    });

    it('应该支持从指定基础分支创建', async () => {
      const checkoutResult: CommandResult = {
        stdout: "Switched to branch 'main'",
        stderr: '',
        exitCode: 0,
      };
      const createResult: CommandResult = {
        stdout: "Switched to a new branch 'feature-test'",
        stderr: '',
        exitCode: 0,
      };
      
      mockSSHExecutor.executeCommand = jest.fn()
        .mockResolvedValueOnce(checkoutResult)
        .mockResolvedValueOnce(createResult);

      const result = await gitService.createBranch('feature-test', 'main');

      expect(result.success).toBe(true);
      expect(mockSSHExecutor.executeCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkoutBranch', () => {
    it('应该成功切换分支', async () => {
      const mockResult: CommandResult = {
        stdout: "Switched to branch 'main'",
        stderr: '',
        exitCode: 0,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const result = await gitService.checkoutBranch('main');

      expect(result.success).toBe(true);
      expect(result.message).toContain('成功切换到分支');
    });
  });

  describe('getStatus', () => {
    it('应该正确解析 Git 状态', async () => {
      const branchResult: CommandResult = {
        stdout: 'main',
        stderr: '',
        exitCode: 0,
      };
      const statusResult: CommandResult = {
        stdout: ' M file1.ts\n?? file2.ts\nM  file3.ts',
        stderr: '',
        exitCode: 0,
      };

      mockSSHExecutor.executeCommand = jest.fn()
        .mockResolvedValueOnce(branchResult)
        .mockResolvedValueOnce(statusResult);

      const status = await gitService.getStatus();

      expect(status.currentBranch).toBe('main');
      expect(status.modifiedFiles).toContain('file1.ts');
      expect(status.untrackedFiles).toContain('file2.ts');
      expect(status.stagedFiles).toContain('file3.ts');
      expect(status.isClean).toBe(false);
    });

    it('应该识别干净的工作区', async () => {
      const branchResult: CommandResult = {
        stdout: 'main',
        stderr: '',
        exitCode: 0,
      };
      const statusResult: CommandResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      };

      mockSSHExecutor.executeCommand = jest.fn()
        .mockResolvedValueOnce(branchResult)
        .mockResolvedValueOnce(statusResult);

      const status = await gitService.getStatus();

      expect(status.isClean).toBe(true);
      expect(status.modifiedFiles).toEqual([]);
      expect(status.untrackedFiles).toEqual([]);
      expect(status.stagedFiles).toEqual([]);
    });
  });

  describe('addFiles', () => {
    it('应该添加所有文件（默认）', async () => {
      const mockResult: CommandResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const result = await gitService.addFiles();

      expect(result.success).toBe(true);
      expect(mockSSHExecutor.executeCommand).toHaveBeenCalledWith(
        'git add .',
        '/test/repo'
      );
    });

    it('应该添加指定的文件', async () => {
      const mockResult: CommandResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const result = await gitService.addFiles(['file1.ts', 'file2.ts']);

      expect(result.success).toBe(true);
      expect(mockSSHExecutor.executeCommand).toHaveBeenCalledWith(
        'git add file1.ts file2.ts',
        '/test/repo'
      );
    });
  });

  describe('commit', () => {
    it('应该成功提交代码', async () => {
      const mockResult: CommandResult = {
        stdout: '[main abc123] Test commit',
        stderr: '',
        exitCode: 0,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const result = await gitService.commit('Test commit');

      expect(result.success).toBe(true);
      expect(result.message).toContain('成功提交代码');
    });

    it('应该转义提交信息中的引号', async () => {
      const mockResult: CommandResult = {
        stdout: '[main abc123] Test "commit"',
        stderr: '',
        exitCode: 0,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      await gitService.commit('Test "commit"');

      expect(mockSSHExecutor.executeCommand).toHaveBeenCalledWith(
        'git commit -m "Test \\"commit\\""',
        '/test/repo'
      );
    });

    it('应该处理没有变更的情况', async () => {
      const mockResult: CommandResult = {
        stdout: 'nothing to commit, working tree clean',
        stderr: '',
        exitCode: 1,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const result = await gitService.commit('Test commit');

      expect(result.success).toBe(false);
      expect(result.message).toContain('没有需要提交的变更');
    });
  });

  describe('push', () => {
    it('应该成功推送分支', async () => {
      const mockResult: CommandResult = {
        stdout: '',
        stderr: 'To github.com:user/repo.git\n * [new branch]      feature -> feature',
        exitCode: 0,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const result = await gitService.push('feature');

      expect(result.success).toBe(true);
      expect(result.message).toContain('成功推送分支');
      expect(mockSSHExecutor.executeCommand).toHaveBeenCalledWith(
        'git push  origin feature',
        '/test/repo'
      );
    });

    it('应该支持强制推送', async () => {
      const mockResult: CommandResult = {
        stdout: '',
        stderr: 'To github.com:user/repo.git\n + abc123...def456 feature -> feature (forced update)',
        exitCode: 0,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(mockResult);

      const result = await gitService.push('feature', 'origin', true);

      expect(result.success).toBe(true);
      expect(mockSSHExecutor.executeCommand).toHaveBeenCalledWith(
        'git push -f origin feature',
        '/test/repo'
      );
    });
  });

  describe('commitAndPush', () => {
    it('应该完成完整的提交流程', async () => {
      const addResult: CommandResult = { stdout: '', stderr: '', exitCode: 0 };
      const commitResult: CommandResult = { stdout: '[main abc123] Test', stderr: '', exitCode: 0 };
      const pushResult: CommandResult = { stdout: '', stderr: 'Pushed', exitCode: 0 };

      mockSSHExecutor.executeCommand = jest.fn()
        .mockResolvedValueOnce(addResult)
        .mockResolvedValueOnce(commitResult)
        .mockResolvedValueOnce(pushResult);

      const result = await gitService.commitAndPush('feature', 'Test commit');

      expect(result.success).toBe(true);
      expect(mockSSHExecutor.executeCommand).toHaveBeenCalledTimes(3);
    });

    it('应该在 add 失败时停止', async () => {
      const addResult: CommandResult = { stdout: '', stderr: 'Error', exitCode: 1 };

      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValueOnce(addResult);

      const result = await gitService.commitAndPush('feature', 'Test commit');

      expect(result.success).toBe(false);
      expect(mockSSHExecutor.executeCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('branchExists', () => {
    it('应该正确判断分支是否存在', async () => {
      const existsResult: CommandResult = {
        stdout: '  feature-test',
        stderr: '',
        exitCode: 0,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(existsResult);

      const exists = await gitService.branchExists('feature-test');

      expect(exists).toBe(true);
    });

    it('应该在分支不存在时返回 false', async () => {
      const notExistsResult: CommandResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      };
      mockSSHExecutor.executeCommand = jest.fn().mockResolvedValue(notExistsResult);

      const exists = await gitService.branchExists('non-existent');

      expect(exists).toBe(false);
    });
  });
});
