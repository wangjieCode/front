import express, { Request, Response } from 'express';
import { WorkspaceManagementService } from '../services/WorkspaceManagementService';
import { UserAuthService } from '../services/UserAuthService';
import { createAuthMiddleware } from './authMiddleware';

/**
 * 创建工作空间管理路由
 * @param workspaceService 工作空间管理服务
 * @param authService 用户认证服务
 * @returns Express Router
 */
export function createWorkspaceRoutes(
  workspaceService: WorkspaceManagementService,
  authService: UserAuthService
): express.Router {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware(authService);

  /**
   * GET /api/workspaces
   * 查询用户工作空间列表
   */
  router.get('/', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { projectId } = req.query;

      const workspaces = await workspaceService.getUserWorkspaces(
        userId,
        projectId as string | undefined
      );

      res.json({
        success: true,
        data: workspaces,
      });
    } catch (error) {
      console.error('获取工作空间列表失败：', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取工作空间列表失败',
      });
    }
  });

  /**
   * POST /api/workspaces
   * 获取或创建用户工作空间
   */
  router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { projectId } = req.body;

      if (!projectId) {
        return res.status(400).json({
          success: false,
          error: '缺少 projectId 参数',
        });
      }

      const workspace = await workspaceService.getOrCreateWorkspace(userId, projectId);

      res.json({
        success: true,
        data: {
          id: workspace.id,
          projectId: workspace.projectId,
          worktreePath: workspace.worktreePath,
          worktreeBranch: workspace.worktreeBranch,
          status: workspace.status,
          lastUsedAt: workspace.lastUsedAt,
          createdAt: workspace.createdAt,
        },
      });
    } catch (error) {
      console.error('获取或创建工作空间失败：', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取或创建工作空间失败',
      });
    }
  });

  /**
   * DELETE /api/workspaces/:workspaceId
   * 清理工作空间
   */
  router.delete('/:workspaceId', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { workspaceId } = req.params;

      if (!workspaceId) {
        return res.status(400).json({
          success: false,
          error: '缺少 workspaceId 参数',
        });
      }

      await workspaceService.cleanupWorkspace(workspaceId, userId);

      res.json({
        success: true,
        message: '工作空间已清理',
      });
    } catch (error) {
      console.error('清理工作空间失败：', error);
      const statusCode = error instanceof Error && error.message.includes('无权限') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : '清理工作空间失败',
      });
    }
  });

  /**
   * POST /api/workspaces/cleanup-expired
   * 手动触发清理过期工作空间（管理员接口）
   */
  router.post('/cleanup-expired', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { daysThreshold } = req.body;
      const threshold = daysThreshold || 7;

      const result = await workspaceService.cleanupExpiredWorkspaces(threshold);

      res.json({
        success: true,
        data: result,
        message: `清理完成：成功 ${result.cleaned} 个，失败 ${result.failed} 个`,
      });
    } catch (error) {
      console.error('清理过期工作空间失败：', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '清理过期工作空间失败',
      });
    }
  });

  return router;
}
