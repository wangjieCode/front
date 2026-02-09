import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ConversationView from '../ConversationView';
import { ConversationMode, ConversationStatus } from '../../types/conversation';
import { conversationService } from '../../services/conversationService';
import { authUtils } from '../../utils/auth';

jest.mock('../../services/conversationService', () => ({
  conversationService: {
    getSession: jest.fn(),
    getMessages: jest.fn(),
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
  const encoder = new TextEncoder();
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
    mode: ConversationMode.EDIT,
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
    authUtils.setUserInfo('user-1', 'tester');
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

    global.fetch = jest.fn().mockResolvedValue(buildStreamResponse(sseChunks)) as jest.Mock;

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

    (global.fetch as jest.Mock) = jest
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
});
