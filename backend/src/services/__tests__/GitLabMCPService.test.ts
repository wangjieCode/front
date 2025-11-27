import { GitLabMCPService, GitLabConfig } from '../GitLabMCPService';
import { MRParams } from '../../types';

// Mock fetch
global.fetch = jest.fn();

describe('GitLabMCPService', () => {
  let service: GitLabMCPService;
  let mockConfig: GitLabConfig;

  beforeEach(() => {
    mockConfig = {
      url: 'https://gitlab.com',
      token: 'test-token',
      projectId: '12345',
    };
    service = new GitLabMCPService(mockConfig);
    jest.clearAllMocks();
  });

  describe('createMergeRequest', () => {
    it('应该成功创建 MR', async () => {
      const mockMRResponse = {
        id: 1,
        iid: 100,
        web_url: 'https://gitlab.com/project/merge_requests/100',
        source_branch: 'feature-test',
        target_branch: 'main',
        title: 'Test MR',
        state: 'opened',
      };

      // Mock findExistingMR 返回 null
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        // Mock createMergeRequest 成功
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockMRResponse,
        });

      const params: MRParams = {
        projectId: '12345',
        sourceBranch: 'feature-test',
        targetBranch: 'main',
        title: 'Test MR',
        description: 'Test description',
      };

      const result = await service.createMergeRequest(params);

      expect(result.mrId).toBe(100);
      expect(result.webUrl).toBe('https://gitlab.com/project/merge_requests/100');
      expect(result.sourceBranch).toBe('feature-test');
      expect(result.targetBranch).toBe('main');
    });

    it('应该在 MR 已存在时返回现有 MR', async () => {
      const existingMR = {
        id: 1,
        iid: 99,
        web_url: 'https://gitlab.com/project/merge_requests/99',
        source_branch: 'feature-test',
        target_branch: 'main',
        title: 'Existing MR',
        state: 'opened',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [existingMR],
      });

      const params: MRParams = {
        projectId: '12345',
        sourceBranch: 'feature-test',
        targetBranch: 'main',
        title: 'Test MR',
        description: 'Test description',
      };

      const result = await service.createMergeRequest(params);

      expect(result.mrId).toBe(99);
      expect(result.webUrl).toBe('https://gitlab.com/project/merge_requests/99');
    });

    it('应该在创建失败时抛出错误', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({ message: 'Invalid branch' }),
        });

      const params: MRParams = {
        projectId: '12345',
        sourceBranch: 'invalid-branch',
        targetBranch: 'main',
        title: 'Test MR',
        description: 'Test description',
      };

      await expect(service.createMergeRequest(params)).rejects.toThrow('创建 MR 失败');
    });

    it('应该验证 MR 参数', async () => {
      const invalidParams: MRParams = {
        projectId: '',
        sourceBranch: 'feature',
        targetBranch: 'main',
        title: 'Test',
        description: 'Test',
      };

      await expect(service.createMergeRequest(invalidParams)).rejects.toThrow('项目 ID 不能为空');
    });
  });

  describe('findExistingMR', () => {
    it('应该找到已存在的 MR', async () => {
      const mockMR = {
        id: 1,
        iid: 100,
        web_url: 'https://gitlab.com/project/merge_requests/100',
        source_branch: 'feature-test',
        target_branch: 'main',
        title: 'Test MR',
        state: 'opened',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockMR],
      });

      const result = await service.findExistingMR('feature-test', 'main');

      expect(result).not.toBeNull();
      expect(result?.mrId).toBe(100);
    });

    it('应该在没有找到 MR 时返回 null', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await service.findExistingMR('non-existent-branch');

      expect(result).toBeNull();
    });

    it('应该在查询失败时返回 null', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await service.findExistingMR('feature-test');

      expect(result).toBeNull();
    });
  });

  describe('getMergeRequest', () => {
    it('应该获取 MR 详情', async () => {
      const mockMR = {
        id: 1,
        iid: 100,
        web_url: 'https://gitlab.com/project/merge_requests/100',
        source_branch: 'feature-test',
        target_branch: 'main',
        title: 'Test MR',
        state: 'opened',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMR,
      });

      const result = await service.getMergeRequest(100);

      expect(result).not.toBeNull();
      expect(result?.mrId).toBe(100);
    });

    it('应该在 MR 不存在时返回 null', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await service.getMergeRequest(999);

      expect(result).toBeNull();
    });
  });

  describe('createMRForTask', () => {
    it('应该为任务创建 MR', async () => {
      const mockMRResponse = {
        id: 1,
        iid: 100,
        web_url: 'https://gitlab.com/project/merge_requests/100',
        source_branch: 'feature-task-123',
        target_branch: 'main',
        title: 'feat: 修改登录按钮颜色',
        state: 'opened',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockMRResponse,
        });

      const result = await service.createMRForTask(
        'task-123',
        '修改登录按钮颜色为蓝色',
        'feature-task-123',
        'main'
      );

      expect(result.mrId).toBe(100);
      expect(result.sourceBranch).toBe('feature-task-123');
    });
  });

  describe('testConnection', () => {
    it('应该在连接成功时返回 true', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await service.testConnection();

      expect(result).toBe(true);
    });

    it('应该在连接失败时返回 false', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await service.testConnection();

      expect(result).toBe(false);
    });

    it('应该在发生错误时返回 false', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await service.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('getProjectInfo', () => {
    it('应该获取项目信息', async () => {
      const mockProject = {
        id: 12345,
        name: 'test-project',
        web_url: 'https://gitlab.com/user/test-project',
        default_branch: 'main',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockProject,
      });

      const result = await service.getProjectInfo();

      expect(result).not.toBeNull();
      expect(result?.name).toBe('test-project');
      expect(result?.default_branch).toBe('main');
    });

    it('应该在获取失败时返回 null', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await service.getProjectInfo();

      expect(result).toBeNull();
    });
  });
});
