import { Router, Response } from 'express';
import { ProjectService } from '../services/ProjectService';
import { requireAuth, AuthRequest } from './authMiddleware';
import { CreateProjectRequest, UpdateProjectRequest, ProjectFilters, ICommandExecutor } from '../types';

// 移除复杂的权限中间件，只需要登录态即可

// 移除权限相关的接口扩展

/**
 * 创建项目路由
 */
export function createProjectRoutes(executor?: ICommandExecutor): Router {
  const router = Router();
  const projectService = new ProjectService(executor);

  /**
   * POST /api/projects
   * 创建新项目
   */
  router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const data: CreateProjectRequest = req.body;

      // 验证必需字段
      if (!data.name || !data.gitRepositoryUrl) {
        return res.status(400).json({
          success: false,
          error: '项目名称和Git仓库URL为必填字段',
        });
      }

      const result = await projectService.createProject(data, req.userId!);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.status(201).json({
        success: true,
        data: result.project,
        message: result.message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '创建项目失败',
      });
    }
  });

  /**
   * GET /api/projects
   * 获取用户项目列表
   */
  router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const filters: ProjectFilters = {
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        search: req.query.search as string | undefined,
      };

      const result = await projectService.getProjects(req.userId!, filters);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        data: result.projects || [],
        total: result.total || 0,
        message: result.message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取项目列表失败',
      });
    }
  });

  /**
   * GET /api/projects/:id
   * 获取项目详情
   */
  router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const result = await projectService.getProject(id, req.userId!);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        data: result.project,
        message: result.message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取项目详情失败',
      });
    }
  });

  /**
   * PUT /api/projects/:id
   * 更新项目信息
   */
  router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const data: UpdateProjectRequest = req.body;

      const result = await projectService.updateProject(id, req.userId!, data);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        data: result.project,
        message: result.message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '更新项目失败',
      });
    }
  });

  /**
   * DELETE /api/projects/:id
   * 删除项目
   */
  router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const result = await projectService.deleteProject(id, req.userId!);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '删除项目失败',
      });
    }
  });

  // 移除所有成员管理路由

  return router;
}