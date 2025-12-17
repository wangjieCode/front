import { Router, Request, Response } from 'express';
import { ProjectService } from '../services/ProjectService';
import { authMiddleware } from './middleware/authMiddleware';

const router: Router = Router();
const projectService = new ProjectService();

/**
 * GET /api/projects
 * 获取可用项目列表
 */
router.get('/', async (req: Request, res: Response) => {
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
router.get('/:projectId', async (req: Request, res: Response) => {
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

/**
 * POST /api/projects
 * 创建新项目
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      projectKey,
      projectName,
      description,
      repoDir,
      worktreeBaseDir,
      gitDefaultBranch,
      dockerHost,
    } = req.body;

    if (!projectKey || !projectName || !repoDir || !worktreeBaseDir) {
      return res.status(400).json({
        success: false,
        error: '缺少必需字段: projectKey, projectName, repoDir, worktreeBaseDir',
      });
    }

    if (!/^[A-Z0-9_]+$/.test(projectKey)) {
      return res.status(400).json({
        success: false,
        error: 'projectKey 只能包含大写字母、数字和下划线',
      });
    }

    const existingProject = await projectService.getProjectByKey(projectKey);
    if (existingProject) {
      return res.status(409).json({
        success: false,
        error: '项目标识键已存在',
      });
    }

    const userId = (req as any).user?.userId;
    const project = await projectService.createProject({
      projectKey,
      projectName,
      description: description || null,
      repoDir,
      worktreeBaseDir,
      gitDefaultBranch: gitDefaultBranch || 'main',
      dockerHost: dockerHost || null,
      createdBy: userId || null,
    });

    res.status(201).json({
      success: true,
      data: project,
      message: '项目创建成功',
    });
  } catch (error) {
    console.error('[ProjectRoutes] 创建项目失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '创建项目失败',
    });
  }
});

/**
 * PUT /api/projects/:projectId
 * 更新项目信息
 */
router.put('/:projectId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const {
      projectName,
      description,
      repoDir,
      worktreeBaseDir,
      gitDefaultBranch,
      dockerHost,
      isActive,
    } = req.body;

    const existingProject = await projectService.getProjectById(projectId);
    if (!existingProject) {
      return res.status(404).json({
        success: false,
        error: '项目不存在',
      });
    }

    const updateData: any = {};
    if (projectName !== undefined) updateData.projectName = projectName;
    if (description !== undefined) updateData.description = description;
    if (repoDir !== undefined) updateData.repoDir = repoDir;
    if (worktreeBaseDir !== undefined) updateData.worktreeBaseDir = worktreeBaseDir;
    if (gitDefaultBranch !== undefined) updateData.gitDefaultBranch = gitDefaultBranch;
    if (dockerHost !== undefined) updateData.dockerHost = dockerHost;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有提供要更新的字段',
      });
    }

    const updatedProject = await projectService.updateProject(projectId, updateData);

    res.json({
      success: true,
      data: updatedProject,
      message: '项目更新成功',
    });
  } catch (error) {
    console.error('[ProjectRoutes] 更新项目失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '更新项目失败',
    });
  }
});

/**
 * DELETE /api/projects/:projectId
 * 删除项目（软删除，设置为不活跃状态）
 */
router.delete('/:projectId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { force } = req.query;

    const existingProject = await projectService.getProjectById(projectId);
    if (!existingProject) {
      return res.status(404).json({
        success: false,
        error: '项目不存在',
      });
    }

    if (force === 'true') {
      const deleted = await projectService.deleteProject(projectId);
      if (!deleted) {
        return res.status(500).json({
          success: false,
          error: '删除项目失败',
        });
      }

      res.json({
        success: true,
        message: '项目已永久删除',
      });
    } else {
      const deactivated = await projectService.deactivateProject(projectId);
      if (!deactivated) {
        return res.status(500).json({
          success: false,
          error: '停用项目失败',
        });
      }

      res.json({
        success: true,
        message: '项目已停用',
      });
    }
  } catch (error) {
    console.error('[ProjectRoutes] 删除项目失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '删除项目失败',
    });
  }
});

/**
 * POST /api/projects/:projectId/activate
 * 激活项目
 */
router.post('/:projectId/activate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const existingProject = await projectService.getProjectById(projectId);
    if (!existingProject) {
      return res.status(404).json({
        success: false,
        error: '项目不存在',
      });
    }

    const activated = await projectService.activateProject(projectId);
    if (!activated) {
      return res.status(500).json({
        success: false,
        error: '激活项目失败',
      });
    }

    res.json({
      success: true,
      message: '项目已激活',
    });
  } catch (error) {
    console.error('[ProjectRoutes] 激活项目失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '激活项目失败',
    });
  }
});

export default router;
