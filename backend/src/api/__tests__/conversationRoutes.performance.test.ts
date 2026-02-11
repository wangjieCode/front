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
