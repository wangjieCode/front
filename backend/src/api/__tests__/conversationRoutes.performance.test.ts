import express from 'express';
import request from 'supertest';
import { performance } from 'perf_hooks';
import { createConversationRoutes } from '../conversationRoutes';

jest.mock('../authMiddleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = 'user-1';
    req.username = 'tester';
    next();
  },
}));

const buildSession = () => ({
  id: 'session-1',
  userId: 'user-1',
  status: 'active',
  visibility: 'private',
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-01T00:00:00.000Z'),
  context: {
    mode: 'edit',
    taskDescription: 'demo',
    projectInfo: {
      projectId: 'project-1',
      projectName: 'Demo',
      gitRepositoryUrl: 'git@example.com/demo.git',
      workDir: '/repo/demo',
      gitBranch: 'main',
    },
  },
});

const createApp = (listSessions: jest.Mock) => {
  const app = express();
  app.use(express.json());
  const conversationManager = { listSessions } as any;
  const messageRouter = {} as any;
  const aiService = {} as any;
  app.use('/api/conversations', createConversationRoutes(conversationManager, messageRouter, aiService));
  return app;
};

const createReviewApp = (managerOverrides: Record<string, any> = {}) => {
  const app = express();
  app.use(express.json());
  const conversationManager = {
    getSessionAccessInfo: jest.fn().mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      visibility: 'private',
    }),
    getReviewSidebar: jest.fn().mockResolvedValue({
      sessionId: 'session-1',
      totalRounds: 0,
      rounds: [],
    }),
    getReviewFiles: jest.fn().mockResolvedValue({
      sessionId: 'session-1',
      files: [],
    }),
    getReviewDiff: jest.fn().mockResolvedValue({
      sessionId: 'session-1',
      filePath: 'src/demo.ts',
      roundId: null,
      items: [],
    }),
    getReviewUpdates: jest.fn().mockResolvedValue({
      sessionId: 'session-1',
      since: '2026-03-01T00:00:00.000Z',
      items: [],
    }),
    ...managerOverrides,
  } as any;
  const messageRouter = {} as any;
  const aiService = {} as any;
  app.use('/api/conversations', createConversationRoutes(conversationManager, messageRouter, aiService));
  return app;
};

describe('GET /api/conversations performance', () => {
  it('对话列表响应时间在阈值内', async () => {
    const responseDelay = 120;
    const maxResponseTime = 300;
    const listSessions = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(
        () => resolve([buildSession()]),
        responseDelay
      ))
    );

    const app = createApp(listSessions);

    const start = performance.now();
    const response = await request(app)
      .get('/api/conversations')
      .set('Authorization', 'Bearer test.jwt.token');
    const end = performance.now();

    expect(response.status).toBe(200);
    expect(end - start).toBeLessThanOrEqual(maxResponseTime);
    expect(end - start).toBeGreaterThanOrEqual(responseDelay);
  });
});

describe('GET /api/conversations/:sessionId/review/*', () => {
  it('sidebar 接口返回 200', async () => {
    const app = createReviewApp();
    const response = await request(app)
      .get('/api/conversations/session-1/review/sidebar')
      .set('Authorization', 'Bearer test.jwt.token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.sessionId).toBe('session-1');
  });

  it('diff 接口缺少 filePath 返回 400', async () => {
    const app = createReviewApp();
    const response = await request(app)
      .get('/api/conversations/session-1/review/diff')
      .set('Authorization', 'Bearer test.jwt.token');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('files 接口返回 200', async () => {
    const app = createReviewApp();
    const response = await request(app)
      .get('/api/conversations/session-1/review/files')
      .set('Authorization', 'Bearer test.jwt.token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.sessionId).toBe('session-1');
    expect(Array.isArray(response.body.data.files)).toBe(true);
  });

  it('updates 接口透传 since 并返回 200', async () => {
    const getReviewUpdates = jest.fn().mockResolvedValue({
      sessionId: 'session-1',
      since: '2026-03-02T00:00:00.000Z',
      items: [],
    });
    const app = createReviewApp({ getReviewUpdates });
    const response = await request(app)
      .get('/api/conversations/session-1/review/updates?since=2026-03-02T00:00:00.000Z')
      .set('Authorization', 'Bearer test.jwt.token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(getReviewUpdates).toHaveBeenCalledTimes(1);
    expect(getReviewUpdates).toHaveBeenCalledWith('session-1', '2026-03-02T00:00:00.000Z');
  });
});
