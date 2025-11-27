import { Router, Request, Response } from 'express';
import { TaskManager } from '../services/TaskManager';
import { TaskOrchestrator } from '../services/TaskOrchestrator';

/**
 * 创建任务路由
 * @param taskManager 任务管理器实例
 * @param orchestrator 任务编排器实例（可选）
 * @returns Express 路由
 */
export function createTaskRoutes(
  taskManager: TaskManager,
  orchestrator?: TaskOrchestrator
): Router {
  const router = Router();

  /**
   * POST /api/tasks
   * 创建并执行新任务
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;

      if (!prompt) {
        return res.status(400).json({
          error: '提示词不能为空',
        });
      }

      // 创建任务
      const task = taskManager.createTask(prompt);

      // 立即返回任务信息
      res.status(201).json({
        success: true,
        data: task,
      });

      // 异步执行任务（如果提供了编排器）
      if (orchestrator) {
        orchestrator.executeTask(task.id).catch((error) => {
          console.error(`任务 ${task.id} 执行失败:`, error);
        });
      }
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : '创建任务失败',
      });
    }
  });

  /**
   * GET /api/tasks
   * 获取所有任务列表
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const tasks = taskManager.getTasks();

      res.json({
        success: true,
        data: tasks,
        total: tasks.length,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '获取任务列表失败',
      });
    }
  });

  /**
   * GET /api/tasks/:id
   * 获取单个任务详情
   */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const task = taskManager.getTask(id);

      if (!task) {
        return res.status(404).json({
          error: '任务不存在',
        });
      }

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '获取任务详情失败',
      });
    }
  });

  /**
   * GET /api/tasks/:id/logs
   * 获取任务日志
   */
  router.get('/:id/logs', (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // 检查任务是否存在
      if (!taskManager.hasTask(id)) {
        return res.status(404).json({
          error: '任务不存在',
        });
      }

      const logs = taskManager.getLogs(id);

      res.json({
        success: true,
        data: logs,
        total: logs.length,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '获取任务日志失败',
      });
    }
  });

  /**
   * GET /api/tasks/stats
   * 获取任务统计信息
   */
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const stats = taskManager.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : '获取统计信息失败',
      });
    }
  });

  return router;
}
