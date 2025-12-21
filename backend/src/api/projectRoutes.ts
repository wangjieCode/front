import { Router, Response } from 'express';
import { ProjectService, MemberRole } from '../services/ProjectService';
import { requireAuth, AuthRequest } from './authMiddleware';
import { CreateProjectRequest, UpdateProjectRequest, ProjectFilters, AddMemberRequest, ICommandExecutor } from '../types';

/**
 * 创建项目权限中间件
 * @param requiredRole 需要的最低角色
 * @returns 中间件函数
 */
const requireProjectPermission = (requiredRole: MemberRole) => {
  return async (req: AuthRequest, res: Response, next: Function) => {
    try {
      const projectId = req.params.id || req.params.projectId;
      const userId = req.userId;

      if (!projectId || !userId) {
        return res.status(400).json({
          success: false,
          error: '缺少项目ID或用户ID',
        });
      }

      const projectService = new ProjectService();
      const permission = await projectService.checkPermission(projectId, userId, requiredRole);

      if (!permission.hasPermission) {
        return res.status(403).json({
          success: false,
          error: '权限不足',
        });
      }

      // 将权限信息附加到请求对象
      req.memberRole = permission.memberRole;
      req.isOwner = permission.isOwner;
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '权限检查失败',
      });
    }
  };
};

/**
 * 扩展 AuthRequest 接口，添加项目权限信息
 */
declare global {
  namespace Express {
    interface Request {
      memberRole?: MemberRole;
      isOwner?: boolean;
    }
  }
}

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
  router.get('/:id', requireAuth, requireProjectPermission(MemberRole.MEMBER), async (req: AuthRequest, res: Response) => {
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
  router.put('/:id', requireAuth, requireProjectPermission(MemberRole.ADMIN), async (req: AuthRequest, res: Response) => {
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
  router.delete('/:id', requireAuth, requireProjectPermission(MemberRole.OWNER), async (req: AuthRequest, res: Response) => {
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

  // ==================== 成员管理路由 ====================

  /**
   * GET /api/projects/:id/members
   * 获取项目成员列表
   */
  router.get('/:id/members', requireAuth, requireProjectPermission(MemberRole.MEMBER), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const result = await projectService.getMembers(id);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        data: result.members || [],
        message: result.message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取成员列表失败',
      });
    }
  });

  /**
   * POST /api/projects/:id/members
   * 添加项目成员
   */
  router.post('/:id/members', requireAuth, requireProjectPermission(MemberRole.ADMIN), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const data: AddMemberRequest = req.body;

      if (!data.userId || !data.role) {
        return res.status(400).json({
          success: false,
          error: '用户ID和角色为必填字段',
        });
      }

      // 验证角色有效性
      if (!Object.values(MemberRole).includes(data.role)) {
        return res.status(400).json({
          success: false,
          error: '无效的角色',
        });
      }

      // 非所有者不能添加其他所有者
      if (data.role === MemberRole.OWNER && !req.isOwner) {
        return res.status(403).json({
          success: false,
          error: '只有项目所有者可以添加其他所有者',
        });
      }

      const result = await projectService.addMember(id, data.userId, data.role);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.status(201).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '添加成员失败',
      });
    }
  });

  /**
   * DELETE /api/projects/:id/members/:userId
   * 移除项目成员
   */
  router.delete('/:id/members/:userId', requireAuth, requireProjectPermission(MemberRole.ADMIN), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: '缺少用户ID',
        });
      }

      const result = await projectService.removeMember(id, req.userId!, userId);

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
        error: error instanceof Error ? error.message : '移除成员失败',
      });
    }
  });

  /**
   * PUT /api/projects/:id/members/:userId
   * 更新成员角色
   */
  router.put('/:id/members/:userId', requireAuth, requireProjectPermission(MemberRole.OWNER), async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { userId } = req.params;
      const { role } = req.body;

      if (!userId || !role) {
        return res.status(400).json({
          success: false,
          error: '用户ID和角色为必填字段',
        });
      }

      // 验证角色有效性
      if (!Object.values(MemberRole).includes(role)) {
        return res.status(400).json({
          success: false,
          error: '无效的角色',
        });
      }

      // 不能修改自己的角色
      if (userId === req.userId) {
        return res.status(400).json({
          success: false,
          error: '不能修改自己的角色',
        });
      }

      // 先移除原成员，再添加新角色
      const removeResult = await projectService.removeMember(id, req.userId!, userId);
      if (!removeResult.success) {
        return res.status(400).json({
          success: false,
          error: removeResult.error,
        });
      }

      const addResult = await projectService.addMember(id, userId, role);
      if (!addResult.success) {
        return res.status(400).json({
          success: false,
          error: addResult.error,
        });
      }

      res.json({
        success: true,
        message: '成员角色更新成功',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '更新成员角色失败',
      });
    }
  });

  // ==================== 权限检查路由 ====================

  /**
   * GET /api/projects/:id/permissions/:requiredRole
   * 检查用户对项目的权限
   */
  router.get('/:id/permissions/:requiredRole', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { requiredRole } = req.params;

      if (!Object.values(MemberRole).includes(requiredRole as MemberRole)) {
        return res.status(400).json({
          success: false,
          error: '无效的角色',
        });
      }

      const permission = await projectService.checkPermission(
        id,
        req.userId!,
        requiredRole as MemberRole
      );

      res.json({
        success: true,
        data: {
          hasPermission: permission.hasPermission,
          memberRole: permission.memberRole,
          isOwner: permission.isOwner,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '权限检查失败',
      });
    }
  });

  return router;
}