import { Router, Request, Response } from 'express';
import { ProjectManagementService } from '../services/ProjectManagementService';
import { UserAuthService } from '../services/UserAuthService';
import { createAuthMiddleware } from './authMiddleware';

/**
 * 创建项目管理路由
 */
export function createProjectRoutes(
  projectService: ProjectManagementService,
  authService: UserAuthService
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(authService);

  // 所有路由都需要认证
  router.use(authMiddleware);

  /**
   * GET /api/projects
   * 获取用户的项目列表
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: '未登录',
        });
      }

      const { status, page, pageSize } = req.query;

      const result = await projectService.listUserProjects({
        userId: req.userId,
        status: status as string,
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 20,
      });

      res.json({
        success: true,
        data: {
          projects: result.projects,
          total: result.total,
          page: page ? parseInt(page as string) : 1,
          pageSize: pageSize ? parseInt(pageSize as string) : 20,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取项目列表失败';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * GET /api/projects/:projectId
   * 获取项目详情
   */
  router.get('/:projectId', async (req: Request, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: '未登录',
        });
      }

      const { projectId } = req.params;

      const project = await projectService.getProject(projectId, req.userId);

      if (!project) {
        return res.status(404).json({
          success: false,
          error: '项目不存在',
        });
      }

      res.json({
        success: true,
        data: project,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取项目详情失败';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * POST /api/projects
   * 创建新项目
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: '未登录',
        });
      }

      const {
        name,
        description,
        gitlabUrl,
        gitlabToken,
        gitlabProjectId,
        baseWorkDir,
        defaultBranch,
        sshConfig,
        dockerComposeConfig,
      } = req.body;

      // 验证必填字段
      if (!name || !gitlabUrl || !gitlabToken || !gitlabProjectId || !baseWorkDir) {
        return res.status(400).json({
          success: false,
          error: '缺少必填字段',
        });
      }

      const project = await projectService.createProject({
        name,
        description,
        gitlabUrl,
        gitlabToken,
        gitlabProjectId,
        baseWorkDir,
        defaultBranch,
        sshConfig,
        dockerComposeConfig,
        createdBy: req.userId,
      });

      res.json({
        success: true,
        data: project,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '创建项目失败';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * PUT /api/projects/:projectId
   * 更新项目配置
   */
  router.put('/:projectId', async (req: Request, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: '未登录',
        });
      }

      const { projectId } = req.params;
      const updateData = req.body;

      const project = await projectService.updateProject(
        projectId,
        req.userId,
        updateData
      );

      res.json({
        success: true,
        data: project,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '更新项目失败';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * DELETE /api/projects/:projectId
   * 删除项目（归档）
   */
  router.delete('/:projectId', async (req: Request, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: '未登录',
        });
      }

      const { projectId } = req.params;

      await projectService.deleteProject(projectId, req.userId);

      res.json({
        success: true,
        message: '项目已删除',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '删除项目失败';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * POST /api/projects/:projectId/users
   * 添加用户到项目
   */
  router.post('/:projectId/users', async (req: Request, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: '未登录',
        });
      }

      const { projectId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: '用户ID不能为空',
        });
      }

      // 验证当前用户是否有权访问该项目
      const hasAccess = await projectService.checkUserProjectAccess(req.userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: '无权操作该项目',
        });
      }

      const userProject = await projectService.addUserToProject(projectId, userId);

      res.json({
        success: true,
        data: userProject,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '添加用户失败';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * DELETE /api/projects/:projectId/users/:userId
   * 移除用户与项目的关联
   */
  router.delete('/:projectId/users/:userId', async (req: Request, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: '未登录',
        });
      }

      const { projectId, userId } = req.params;

      // 验证当前用户是否有权访问该项目
      const hasAccess = await projectService.checkUserProjectAccess(req.userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: '无权操作该项目',
        });
      }

      await projectService.removeUserFromProject(projectId, userId);

      res.json({
        success: true,
        message: '用户已移除',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '移除用户失败';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * GET /api/projects/:projectId/users
   * 获取项目的所有关联用户
   */
  router.get('/:projectId/users', async (req: Request, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          error: '未登录',
        });
      }

      const { projectId } = req.params;

      // 验证当前用户是否有权访问该项目
      const hasAccess = await projectService.checkUserProjectAccess(req.userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: '无权访问该项目',
        });
      }

      const userIds = await projectService.getProjectUsers(projectId);

      res.json({
        success: true,
        data: userIds,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取项目用户失败';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  });

  return router;
}
