import express from 'express';
import request from 'supertest';
import { performance } from 'perf_hooks';
import { createProjectRoutes } from '../projectRoutes';
import { ProjectService } from '../../services/ProjectService';

jest.mock('../../services/ProjectService', () => ({
  ProjectService: jest.fn().mockImplementation(() => ({
    getProjects: jest.fn(),
  })),
}));

jest.mock('../authMiddleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = 'user-1';
    req.username = 'tester';
    next();
  },
}));

const createApp = () => {
  const app = express();
  app.use(express.json());
  const mockExecutor = {
    isConnected: jest.fn(() => true),
    executeCommand: jest.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    testConnection: jest.fn(async () => true),
  };
  app.use('/api/projects', createProjectRoutes(mockExecutor));
  return app;
};

describe('GET /api/projects performance', () => {
  beforeEach(() => {
    (ProjectService as jest.Mock).mockClear();
  });

  it('项目列表响应时间在阈值内', async () => {
    const responseDelay = 120;
    const maxResponseTime = 300;
    const mockGetProjects = jest.fn();

    (ProjectService as jest.Mock).mockImplementation(() => ({
      getProjects: mockGetProjects,
    }));

    const app = createApp();

    mockGetProjects.mockImplementation(
      () => new Promise((resolve) => setTimeout(
        () => resolve({
          success: true,
          projects: [],
          total: 0,
          message: 'ok',
        }),
        responseDelay
      ))
    );

    const start = performance.now();
    const responsePromise = request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer test.jwt.token');

    const response = await responsePromise;
    const end = performance.now();

    expect(response.status).toBe(200);
    expect(end - start).toBeLessThanOrEqual(maxResponseTime);

    expect(end - start).toBeGreaterThanOrEqual(responseDelay);
  });
});
