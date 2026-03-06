import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ConversationView from '../ConversationView';
import { ConversationStatus } from '../../types/conversation';
import { conversationService } from '../../services/conversationService';
import { authUtils } from '../../utils/auth';

jest.mock('../../services/conversationService', () => ({
  conversationService: {
    getSession: jest.fn(),
    getMessages: jest.fn(),
    getModelConfig: jest.fn(),
    getReviewFiles: jest.fn(),
    getReviewFileDiff: jest.fn(),
    createPreview: jest.fn(),
    stopPreview: jest.fn(),
    createMergeRequest: jest.fn(),
    archiveConversation: jest.fn(),
    updateVisibility: jest.fn(),
  },
}));

jest.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: { children: React.ReactNode }) => <pre>{children}</pre>,
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {},
}));

jest.mock('../TypewriterText', () => ({
  TypewriterText: ({ text }: { text: string }) => <span>{text}</span>,
}));

jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    message: {
      error: jest.fn(),
      success: jest.fn(),
      loading: jest.fn(),
    },
  };
});

const buildStreamResponse = (chunks: string[]) => {
  let index = 0;
  const encoder = new globalThis.TextEncoder();
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const value = encoder.encode(chunks[index]);
          index += 1;
          return { done: false, value };
        },
      }),
    },
  } as Response;
};

const makeSession = () => ({
  id: 'session-1',
  status: ConversationStatus.ACTIVE,
  visibility: 'private',
  context: {
    gitBranch: 'main',
    taskDescription: 'test',
    messageHistory: [],
    variables: {},
    projectInfo: {
      projectId: 'project-1',
      projectName: 'Demo',
      gitRepositoryUrl: 'git@example.com/demo.git',
      workDir: '/repo',
      gitBranch: 'main',
    },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('ConversationView streaming messages', () => {
  beforeEach(() => {
    (conversationService.getSession as jest.Mock).mockResolvedValue(makeSession());
    (conversationService.getMessages as jest.Mock).mockResolvedValue([]);
    (conversationService.getModelConfig as jest.Mock).mockResolvedValue({
      defaultModel: 'gpt-4.1',
      options: [{ value: 'gpt-4.1', label: 'GPT-4.1', enabled: true }],
    });
    (conversationService.getReviewFiles as jest.Mock).mockResolvedValue([]);
    (conversationService.getReviewFileDiff as jest.Mock).mockResolvedValue(null);
    authUtils.setUserInfo('user-1', 'tester', true, 'test.jwt.token');
  });

  it('renders streamed response for the first message', async () => {
    const chunk1 = JSON.stringify({
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello ' }],
    });
    const chunk2 = JSON.stringify({
      role: 'assistant',
      content: [{ type: 'text', text: 'world' }],
    });

    const sseChunks = [
      `data: ${JSON.stringify({ type: 'user_message', content: 'Hi' })}\n\n`,
      `data: ${JSON.stringify({ type: 'thinking', message: 'AI 正在思考中...' })}\n\n`,
      `data: ${JSON.stringify({ type: 'chunk', content: chunk1 })}\n\n`,
      `data: ${JSON.stringify({ type: 'chunk', content: chunk2 })}\n\n`,
      `data: ${JSON.stringify({ type: 'complete' })}\n\n`,
    ];

    globalThis.fetch = jest.fn().mockResolvedValue(buildStreamResponse(sseChunks)) as jest.Mock;

    render(
      <MemoryRouter initialEntries={['/chat/session-1']}>
        <ConversationView sessionId="session-1" initialSession={makeSession()} />
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('输入消息... (Ctrl+Enter 发送)'), 'Hi');
    await user.click(screen.getByTitle('发送消息 (Ctrl+Enter)'));

    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });
  });

  it('appends streamed responses for consecutive messages', async () => {
    const firstChunk = JSON.stringify({
      role: 'assistant',
      content: [{ type: 'text', text: 'First reply' }],
    });
    const secondChunk = JSON.stringify({
      role: 'assistant',
      content: [{ type: 'text', text: 'Second reply' }],
    });

    const firstResponse = buildStreamResponse([
      `data: ${JSON.stringify({ type: 'chunk', content: firstChunk })}\n\n`,
      `data: ${JSON.stringify({ type: 'complete' })}\n\n`,
    ]);
    const secondResponse = buildStreamResponse([
      `data: ${JSON.stringify({ type: 'chunk', content: secondChunk })}\n\n`,
      `data: ${JSON.stringify({ type: 'complete' })}\n\n`,
    ]);

    (globalThis.fetch as jest.Mock) = jest
      .fn()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);

    render(
      <MemoryRouter initialEntries={['/chat/session-1']}>
        <ConversationView sessionId="session-1" initialSession={makeSession()} />
      </MemoryRouter>
    );

    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('输入消息... (Ctrl+Enter 发送)'), 'First');
    await user.click(screen.getByTitle('发送消息 (Ctrl+Enter)'));

    await waitFor(() => {
      expect(screen.getByText('First reply')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('输入消息... (Ctrl+Enter 发送)'), 'Second');
    await user.click(screen.getByTitle('发送消息 (Ctrl+Enter)'));

    await waitFor(() => {
      expect(screen.getByText('Second reply')).toBeInTheDocument();
    });
  });

  it.skip('shows only changed file names in message card', async () => {
    (conversationService.getMessages as jest.Mock).mockResolvedValue([
      {
        id: 'assistant-with-changes',
        sessionId: 'session-1',
        role: 'assistant',
        content: '已完成改动',
        timestamp: new Date().toISOString(),
        metadata: {
          codeChanges: [
            {
              filePath: 'src/a.ts',
              changeType: 'modified',
              diff: ['@@ -1,2 +1,3 @@', '-const a = 1;', '+const a = 2;', '+const b = 3;'].join('\n'),
            },
            {
              filePath: 'src/huge.ts',
              changeType: 'modified',
              diff: new Array(260).fill('+const heavy = true;').join('\n'),
            },
          ],
        },
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/chat/session-1']}>
        <ConversationView sessionId="session-1" initialSession={makeSession()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/代码变更/)).toBeInTheDocument();
      expect(screen.getByText(/2 文件/)).toBeInTheDocument();
      expect(screen.getByText('src/a.ts')).toBeInTheDocument();
      expect(screen.getByText('src/huge.ts')).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.queryByText('展开详情')).not.toBeInTheDocument();
  });
});
