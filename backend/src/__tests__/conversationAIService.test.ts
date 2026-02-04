import { ConversationAIService } from '../services/ConversationAIService';
import { ConversationMode } from '../types';

jest.mock('../services/NeovateSessionManagerDB', () => ({
  NeovateSessionManagerDB: jest.fn().mockImplementation(() => ({
    getSessionId: jest.fn().mockResolvedValue(null),
  })),
}));

describe('ConversationAIService.generateResponseStream', () => {
  it('calls AI service with the conversation workDir for streaming', async () => {
    const modifyCodeStream = jest.fn().mockResolvedValue({
      success: true,
      changes: [],
      message: 'ok',
      rawOutput: 'ok',
    });

    const neovateService = {
      modifyCodeStream,
    } as any;

    const gitService = {
      addAll: jest.fn(),
      commit: jest.fn(),
      push: jest.fn(),
    } as any;

    const gitlabService = {} as any;

    const conversationManager = {
      getMessageHistory: jest.fn().mockResolvedValue([]),
    } as any;

    const service = new ConversationAIService(
      neovateService,
      'postgres://user:pass@localhost:5432/db',
      gitService,
      gitlabService,
      conversationManager
    );

    const context = {
      projectInfo: {
        workDir: '/worktrees/user-1/conversation-session-1',
      },
      mode: ConversationMode.EDIT,
    } as any;

    const onChunk = jest.fn();

    await service.generateResponseStream(context, 'hello', 'session-1', onChunk);

    expect(modifyCodeStream).toHaveBeenCalledWith(
      'hello',
      'session-1',
      undefined,
      '/worktrees/user-1/conversation-session-1',
      onChunk
    );
  });
});
