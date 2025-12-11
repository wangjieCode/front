import { Router, Request, Response } from 'express';
import { DockerComposeService } from '../services/DockerComposeService';

export function createDockerComposeRoutes(dockerComposeService: DockerComposeService): Router {
  const router = Router();

  /**
   * POST /api/docker-compose/init
   * 初始化 docker-compose.yml 配置文件
   */
  router.post('/init', async (req: Request, res: Response) => {
    try {
      const { workDir, force = false } = req.body;

      if (!workDir) {
        return res.status(400).json({ error: '缺少 workDir 参数' });
      }

      const result = await dockerComposeService.initConfig(workDir, force);
      
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, message: result.message, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * POST /api/docker-compose/up
   * 启动服务
   */
  router.post('/up', async (req: Request, res: Response) => {
    try {
      const { workDir, detached = true } = req.body;

      if (!workDir) {
        return res.status(400).json({ error: '缺少 workDir 参数' });
      }

      const result = await dockerComposeService.up(workDir, detached);
      
      if (result.success) {
        res.json({ success: true, output: result.output });
      } else {
        res.status(500).json({ success: false, error: result.error, output: result.output });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * POST /api/docker-compose/down
   * 停止服务
   */
  router.post('/down', async (req: Request, res: Response) => {
    try {
      const { workDir } = req.body;

      if (!workDir) {
        return res.status(400).json({ error: '缺少 workDir 参数' });
      }

      const result = await dockerComposeService.down(workDir);
      
      if (result.success) {
        res.json({ success: true, output: result.output });
      } else {
        res.status(500).json({ success: false, error: result.error, output: result.output });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * POST /api/docker-compose/restart
   * 重启服务
   */
  router.post('/restart', async (req: Request, res: Response) => {
    try {
      const { workDir } = req.body;

      if (!workDir) {
        return res.status(400).json({ error: '缺少 workDir 参数' });
      }

      const result = await dockerComposeService.restart(workDir);
      
      if (result.success) {
        res.json({ success: true, output: result.output });
      } else {
        res.status(500).json({ success: false, error: result.error, output: result.output });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * GET /api/docker-compose/ps
   * 查看服务状态
   */
  router.get('/ps', async (req: Request, res: Response) => {
    try {
      const { workDir } = req.query;

      if (!workDir || typeof workDir !== 'string') {
        return res.status(400).json({ error: '缺少 workDir 参数' });
      }

      const result = await dockerComposeService.ps(workDir);
      
      if (result.success) {
        res.json({ success: true, output: result.output });
      } else {
        res.status(500).json({ success: false, error: result.error, output: result.output });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * GET /api/docker-compose/logs
   * 查看服务日志
   */
  router.get('/logs', async (req: Request, res: Response) => {
    try {
      const { workDir, service, tail } = req.query;

      if (!workDir || typeof workDir !== 'string') {
        return res.status(400).json({ error: '缺少 workDir 参数' });
      }

      const tailNum = tail ? parseInt(tail as string, 10) : 100;
      const result = await dockerComposeService.logs(
        workDir,
        service as string | undefined,
        tailNum
      );
      
      if (result.success) {
        res.json({ success: true, output: result.output });
      } else {
        res.status(500).json({ success: false, error: result.error, output: result.output });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * POST /api/docker-compose/build
   * 构建服务
   */
  router.post('/build', async (req: Request, res: Response) => {
    try {
      const { workDir, noCache = false } = req.body;

      if (!workDir) {
        return res.status(400).json({ error: '缺少 workDir 参数' });
      }

      const result = await dockerComposeService.build(workDir, noCache);
      
      if (result.success) {
        res.json({ success: true, output: result.output });
      } else {
        res.status(500).json({ success: false, error: result.error, output: result.output });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * POST /api/docker-compose/deploy
   * 完整部署流程
   */
  router.post('/deploy', async (req: Request, res: Response) => {
    try {
      const { workDir, rebuild = true } = req.body;

      if (!workDir) {
        return res.status(400).json({ error: '缺少 workDir 参数' });
      }

      const result = await dockerComposeService.deploy(workDir, rebuild);
      
      if (result.success) {
        res.json({ success: true, output: result.output });
      } else {
        res.status(500).json({ success: false, error: result.error, output: result.output });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
