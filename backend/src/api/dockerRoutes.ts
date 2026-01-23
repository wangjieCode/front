import { Router, Request, Response } from 'express';
import { DockerService } from '../services/DockerService';
import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import * as tar from 'tar-stream';
import dayjs from 'dayjs';

const router = Router();

// 从环境变量获取配置
const getDockerService = (): DockerService => {
  const host = process.env.DOCKER_SSH_HOST || '122.51.50.97';
  const port = parseInt(process.env.DOCKER_PORT || '2375');
  const username = process.env.DOCKER_USERNAME;
  const password = process.env.DOCKER_PASSWORD;

  if (username && password) {
    return DockerService.connectRemote(host, port, username, password);
  }

  return DockerService.connectRemote(host, port);
};

/**
 * GET /api/docker/containers
 * 列出所有容器
 */
router.get('/containers', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    const all = req.query.all === 'true';
    const containers = await docker.listContainers(all);
    res.json({ success: true, data: containers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/docker/containers/:id
 * 获取容器详情
 */
router.get('/containers/:id', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    const container = await docker.inspectContainer(req.params.id);
    res.json({ success: true, data: container });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/docker/containers/:id/start
 * 启动容器
 */
router.post('/containers/:id/start', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    await docker.startContainer(req.params.id);
    res.json({ success: true, message: '容器已启动' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/docker/containers/:id/stop
 * 停止容器
 */
router.post('/containers/:id/stop', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    await docker.stopContainer(req.params.id);
    res.json({ success: true, message: '容器已停止' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/docker/containers/:id/restart
 * 重启容器
 */
router.post('/containers/:id/restart', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    await docker.restartContainer(req.params.id);
    res.json({ success: true, message: '容器已重启' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/docker/containers/:id
 * 删除容器
 */
router.delete('/containers/:id', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    const force = req.query.force === 'true';
    await docker.removeContainer(req.params.id, force);
    res.json({ success: true, message: '容器已删除' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/docker/containers/:id/logs
 * 获取容器日志
 */
router.get('/containers/:id/logs', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    const tail = parseInt(req.query.tail as string) || 100;
    const logs = await docker.getContainerLogs(req.params.id, tail);
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/docker/containers/:id/stats
 * 获取容器统计信息
 */
router.get('/containers/:id/stats', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    const stats = await docker.getContainerStats(req.params.id);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/docker/images
 * 列出所有镜像
 */
router.get('/images', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    const images = await docker.listImages();
    res.json({ success: true, data: images });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/docker/images/:id
 * 获取镜像详情
 */
router.get('/images/:id', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    const image = await docker.inspectImage(req.params.id);
    res.json({ success: true, data: image });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/docker/images/pull
 * 拉取镜像
 */
router.post('/images/pull', async (req: Request, res: Response) => {
  try {
    const { imageName } = req.body;
    if (!imageName) {
      return res.status(400).json({ success: false, error: '缺少 imageName 参数' });
    }

    const docker = getDockerService();
    await docker.pullImage(imageName);
    res.json({ success: true, message: '镜像拉取成功' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/docker/images/:id
 * 删除镜像
 */
router.delete('/images/:id', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    await docker.removeImage(req.params.id);
    res.json({ success: true, message: '镜像已删除' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/docker/images/build
 * 从 Dockerfile 构建镜像
 * Body: { dockerfile: string, imageName: string, context?: string }
 */
router.post('/images/build', async (req: Request, res: Response) => {
  try {
    const { dockerfile, imageName, context } = req.body;

    if (!dockerfile || !imageName) {
      return res.status(400).json({ success: false, error: '缺少 dockerfile 或 imageName 参数' });
    }

    // 通过 SSH 在远程主机构建
    const host = process.env.DOCKER_SSH_HOST || '122.51.50.97';
    const port = parseInt(process.env.DOCKER_SSH_PORT || '22');
    const username = process.env.DOCKER_SSH_USERNAME || 'root';
    const password = process.env.DOCKER_SSH_PASSWORD!;

    const ssh = new Client();

    await new Promise<void>((resolve, reject) => {
      ssh
        .on('ready', () => resolve())
        .on('error', reject)
        .connect({ host, port, username, password });
    });

    // 创建临时目录和 Dockerfile
    const tmpDir = `/tmp/docker-build-${dayjs().valueOf()}`;
    await execSSH(ssh, `mkdir -p ${tmpDir}`);
    await execSSH(ssh, `cat > ${tmpDir}/Dockerfile << 'EOF'\n${dockerfile}\nEOF`);

    // 构建镜像
    const buildOutput = await execSSH(ssh, `cd ${tmpDir} && docker build -t ${imageName} .`);

    // 清理临时文件
    await execSSH(ssh, `rm -rf ${tmpDir}`);

    ssh.end();

    res.json({ success: true, message: '镜像构建成功', output: buildOutput });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/docker/containers/create
 * 从镜像创建并启动容器
 */
router.post('/containers/create', async (req: Request, res: Response) => {
  try {
    const { imageName, containerName, ports, env, volumes } = req.body;

    if (!imageName || !containerName) {
      return res.status(400).json({ success: false, error: '缺少 imageName 或 containerName 参数' });
    }

    const docker = getDockerService();

    const options: any = {
      HostConfig: {},
    };

    // 端口映射
    if (ports) {
      options.ExposedPorts = {};
      options.HostConfig.PortBindings = {};

      Object.entries(ports).forEach(([containerPort, hostPort]) => {
        options.ExposedPorts[`${containerPort}/tcp`] = {};
        options.HostConfig.PortBindings[`${containerPort}/tcp`] = [{ HostPort: String(hostPort) }];
      });
    }

    // 环境变量
    if (env) {
      options.Env = Object.entries(env).map(([key, value]) => `${key}=${value}`);
    }

    // 卷挂载
    if (volumes) {
      options.HostConfig.Binds = Object.entries(volumes).map(
        ([hostPath, containerPath]) => `${hostPath}:${containerPath}`
      );
    }

    const container = await docker.createContainerFromImage(imageName, containerName, options);
    await container.start();

    res.json({
      success: true,
      message: '容器创建并启动成功',
      containerId: container.id,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/docker/info
 * 获取 Docker 系统信息
 */
router.get('/info', async (req: Request, res: Response) => {
  try {
    const docker = getDockerService();
    const info = await docker.getSystemInfo();
    res.json({ success: true, data: info });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// SSH 执行辅助函数
function execSSH(client: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let output = '';
      let errorOutput = '';

      stream
        .on('data', (data: Buffer) => {
          output += data.toString();
        })
        .stderr.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

      stream.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(errorOutput || `命令执行失败，退出码: ${code}`));
        } else {
          resolve(output);
        }
      });
    });
  });
}

export default router;
