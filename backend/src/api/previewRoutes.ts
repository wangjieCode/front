import { Router, Request, Response } from 'express';
import { ProjectPreviewService } from '../services/ProjectPreviewService';

/**
 * 创建预览路由
 */
export function createPreviewRoutes(previewService: ProjectPreviewService): Router {
  const router = Router();

  /**
   * POST /api/conversations/:sessionId/preview
   * 创建预览部署
   */
  router.post('/:sessionId/preview', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { branchId, forceRebuild = false } = req.body;

      console.log(`[PreviewRoutes] 创建预览: sessionId=${sessionId}, forceRebuild=${forceRebuild}`);

      const result = await previewService.createPreview(sessionId, forceRebuild);

      if (result.success) {
        res.status(200).json({
          success: true,
          previewUrl: result.previewUrl,
          containerId: result.containerId,
          deploymentInfo: result.deploymentInfo,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('[PreviewRoutes] 创建预览失败:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '创建预览失败',
      });
    }
  });

  /**
   * GET /api/conversations/:sessionId/preview/status
   * 获取预览状态
   */
  router.get('/:sessionId/preview/status', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      const status = await previewService.getPreviewStatus(sessionId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error('[PreviewRoutes] 获取预览状态失败:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '获取预览状态失败',
      });
    }
  });

  /**
   * DELETE /api/conversations/:sessionId/preview
   * 停止预览
   */
  router.delete('/:sessionId/preview', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      const result = await previewService.stopPreview(sessionId);

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('[PreviewRoutes] 停止预览失败:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '停止预览失败',
      });
    }
  });

  return router;
}
