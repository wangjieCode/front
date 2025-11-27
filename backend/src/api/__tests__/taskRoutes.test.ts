import request from 'supertest';
import express, { Express } from 'express';
import { TaskManager } from '../../services/TaskManager';
import { createTaskRoutes } from '../taskRoutes';
import { errorHandler } from '../middleware';

describe('Task Routes', () => {
  let app: Express;
  let taskManager: TaskManager;

  beforeEach(() => {
    taskManager = new TaskManager();
    app = express();
    app.use(express.json());
    app.use('/api/tasks', createTaskRoutes(taskManager));
    app.use(errorHandler);
  });

  describe('POST /api/tasks', () => {
    it('应该创建新任务', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({ prompt: '修改登录按钮颜色' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.prompt).toBe('修改登录按钮颜色');
      expect(response.body.data.status).toBe('pending');
    });

    it('应该拒绝空提示词', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({ prompt: '' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('应该拒绝缺少提示词的请求', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('提示词不能为空');
    });
  });

  describe('GET /api/tasks', () => {
    it('应该返回所有任务', async () => {
      // 创建几个任务
      taskManager.createTask('任务 1');
      taskManager.createTask('任务 2');
      taskManager.createTask('任务 3');

      const response = await request(app)
        .get('/api/tasks')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.total).toBe(3);
    });

    it('应该在没有任务时返回空数组', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('应该返回指定任务', async () => {
      const task = taskManager.createTask('测试任务');

      const response = await request(app)
        .get(`/api/tasks/${task.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(task.id);
      expect(response.body.data.prompt).toBe('测试任务');
    });

    it('应该在任务不存在时返回 404', async () => {
      const response = await request(app)
        .get('/api/tasks/non-existent-id')
        .expect(404);

      expect(response.body.error).toContain('任务不存在');
    });
  });

  describe('GET /api/tasks/:id/logs', () => {
    it('应该返回任务日志', async () => {
      const task = taskManager.createTask('测试任务');

      const response = await request(app)
        .get(`/api/tasks/${task.id}/logs`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.total).toBeGreaterThan(0);
    });

    it('应该在任务不存在时返回 404', async () => {
      const response = await request(app)
        .get('/api/tasks/non-existent-id/logs')
        .expect(404);

      expect(response.body.error).toContain('任务不存在');
    });
  });
});
