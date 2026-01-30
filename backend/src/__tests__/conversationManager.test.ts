import { ConversationManager } from '../services/ConversationManager';
import { ConversationMode } from '../types';

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

    const manager = new ConversationManager(storage as any, projectService, undefined, {} as any);

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
      ConversationMode.EDIT,
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

  it('keeps project workDir and skips worktree creation for readonly mode', async () => {
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

    const manager = new ConversationManager(storage as any, projectService, undefined, {} as any);

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
      ConversationMode.READONLY,
      'user-1'
    );

    expect(createConversationWorktreeMock).not.toHaveBeenCalled();
    expect(session.context.projectInfo.workDir).toBe('/repo');
    expect(session.context.gitBranch).toBe('main');
  });
});
