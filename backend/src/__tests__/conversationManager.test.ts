import { ConversationManager } from '../services/ConversationManager';

jest.mock('../utils/id', () => ({
  newId: () => 'session-1',
}));

const createConversationWorktreeMock = jest.fn();

jest.mock('../services/WorktreeManager', () => ({
  WorktreeManager: jest.fn().mockImplementation(() => ({
    createConversationWorktree: (...args: unknown[]) => createConversationWorktreeMock(...args),
  })),
}));

const createStorage = () => ({
  saveSession: jest.fn().mockResolvedValue(undefined),
  loadSession: jest.fn(),
  listSessions: jest.fn(),
  deleteSession: jest.fn(),
  saveMessage: jest.fn(),
  loadMessages: jest.fn(),
  loadMessage: jest.fn(),
  updateContextVariable: jest.fn(),
  updateContextVariables: jest.fn(),
  updateConversationVisibility: jest.fn(),
});

describe('ConversationManager.createSession', () => {
  beforeEach(() => {
    createConversationWorktreeMock.mockReset();
  });

  it('creates a worktree and stores its path for edit mode', async () => {
    createConversationWorktreeMock.mockResolvedValue({
      branchName: 'feature/session-1',
      worktreePath: '/worktrees/user-1/conversation-session-1',
    });

    const storage = createStorage();
    const projectService = {
      getProject: jest.fn().mockResolvedValue({
        success: true,
        project: {
          id: 'project-1',
          name: 'Demo',
          gitRepositoryUrl: 'git@example.com/demo.git',
          workDirectory: '/repo',
          repoDir: '/repo',
          gitBranch: 'main',
        },
      }),
      executor: {},
    } as any;

    const manager = new ConversationManager(storage as any, projectService, undefined);

    const session = await manager.createSession(
      'prompt',
      {
        projectId: 'project-1',
        projectName: 'Demo',
        gitRepositoryUrl: 'git@example.com/demo.git',
        workDir: '/repo',
        gitBranch: 'main',
        relevantFiles: [],
      },
      'user-1'
    );

    expect(createConversationWorktreeMock).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      'main'
    );
    expect(session.context.projectInfo.workDir).toBe('/worktrees/user-1/conversation-session-1');
    expect(storage.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'session-1',
        context: expect.objectContaining({
          projectInfo: expect.objectContaining({
            workDir: '/worktrees/user-1/conversation-session-1',
          }),
        }),
      })
    );
  });

});

describe('ConversationManager.listSessions', () => {
  it('pushes user and environment filters to storage query', async () => {
    const storage = createStorage();
    storage.listSessions.mockResolvedValue([]);
    const projectService = {
      getProject: jest.fn(),
      executor: {},
    } as any;

    const manager = new ConversationManager(storage as any, projectService);
    await manager.listSessions('user-1');

    expect(storage.listSessions).toHaveBeenCalledWith({
      userId: 'user-1',
      environment: process.env.APP_ENV || 'local',
    });
  });
});

describe('ConversationManager.getGitLabBranches', () => {
  it('returns stale branches first and refreshes cache asynchronously after refresh window', async () => {
    process.env.GITLAB_BRANCHES_REFRESH_INTERVAL_MS = '10';

    const storage = createStorage();
    const projectService = {
      getProject: jest.fn().mockResolvedValue({
        success: true,
        project: {
          id: 'project-branch-refresh',
          name: 'Demo',
          gitBranch: 'main',
          gitlabProjectId: 'gitlab-project-1',
        },
      }),
      executor: {},
    } as any;

    const gitlabService = {
      listBranches: jest
        .fn()
        .mockResolvedValueOnce(['main'])
        .mockResolvedValueOnce(['main', 'feature/new-branch'])
        .mockResolvedValue(['main', 'feature/new-branch']),
      getProjectInfo: jest
        .fn()
        .mockResolvedValue({ default_branch: 'main' }),
    } as any;

    const manager = new ConversationManager(storage as any, projectService, gitlabService);

    const first = await manager.getGitLabBranches('project-branch-refresh', 'user-1');
    const second = await manager.getGitLabBranches('project-branch-refresh', 'user-1');

    expect(first.branches).toEqual(['main']);
    expect(second.branches).toEqual(['main']);
    expect(gitlabService.listBranches).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const third = await manager.getGitLabBranches('project-branch-refresh', 'user-1');

    expect(third.branches).toEqual(['main']);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const fourth = await manager.getGitLabBranches('project-branch-refresh', 'user-1');

    expect(gitlabService.listBranches.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fourth.branches).toEqual(['main', 'feature/new-branch']);
  });
});
