import { Router, Request, Response } from 'express';
import { ProjectService } from '../services/ProjectService';
import { authMiddleware } from './middleware/authMiddleware';

const router = Router();
const projectService = new ProjectService();

/**
 * GET /api/projects
 * 获取可用项目列表
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projects = await projectService.getAvailableProjects();

    res.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error('[ProjectRoutes] 获取项目列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取项目列表失败',
    });
  }
});

/**
 * GET /api/projects/:projectId
 * 获取项目详情
 */
router.get('/:projectId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const project = await projectService.getProjectById(projectId);

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
    console.error('[ProjectRoutes] 获取项目详情失败:', error);
    res.status(500).json({
      success: false,
      error: '获取项目详情失败',
    });
  }
});

export default router;
