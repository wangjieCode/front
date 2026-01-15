import { ConversationManager } from './ConversationManager';
import { GitService } from './GitService';
import { DockerComposeService } from './DockerComposeService';
import { SSHExecutor } from './SSHExecutor';
import {
  PreviewResult,
  PreviewStatus,
  PreviewStatusResponse,
  OperationResult,
  HealthCheckResult,
  PortMapping,
  DeploymentInfo,
  ICommandExecutor,
} from '../types';

/**
 * 项目预览服务
 * 负责统筹预览部署流程
 */
export class ProjectPreviewService {
  private conversationManager: ConversationManager;
  private executor: ICommandExecutor;
  private sshHost: string;

  // 配置常量
  private readonly PORT_RANGE_START = parseInt(process.env.PREVIEW_PORT_RANGE_START || '8080');
  private readonly PORT_RANGE_END = parseInt(process.env.PREVIEW_PORT_RANGE_END || '8280');

  constructor(conversationManager: ConversationManager, executor: ICommandExecutor, sshHost?: string) {
    this.conversationManager = conversationManager;
    this.executor = executor;
    this.sshHost = sshHost || process.env.SSH_HOST || 'localhost';
  }

  /**
   * 创建预览部署
   */
  async createPreview(
    sessionId: string,
    forceRebuild: boolean = false
  ): Promise<PreviewResult> {
    const startTime = Date.now();
    console.log(`[ProjectPreviewService] 开始创建预览: sessionId=${sessionId}`);

    try {
      // 1. 获取会话上下文
      const session = await this.conversationManager.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: '会话不存在',
        };
      }

      const { context } = session;
      const workDir = context.projectInfo.workDir;
      const gitBranch = context.gitBranch;

      if (!gitBranch) {
        return {
          success: false,
          error: '当前会话没有关联的 Git 分支',
        };
      }

      console.log(`[ProjectPreviewService] 工作目录: ${workDir}, Git 分支: ${gitBranch}`);

      // 2. 停止旧的预览（如果存在）
      if (context.previewInfo?.containerId) {
        console.log(`[ProjectPreviewService] 停止旧的预览容器: ${context.previewInfo.containerId}`);
        await this.stopPreviewInternal(workDir);
      }

      // 3. 创建 DockerComposeService
      const dockerComposeService = new DockerComposeService(this.executor);

      // 4. Worktree 已经在对话分支上，不需要切换分支
      console.log(`[ProjectPreviewService] Worktree 当前分支: ${gitBranch}，无需切换`);

      // 5. 检查 docker-compose.yml 是否存在
      console.log(`[ProjectPreviewService] 检查 docker-compose.yml`);
      const checkFileResult = await this.executor.executeCommand(
        'test -f docker-compose.yml && echo "exists"',
        workDir
      );

      if (checkFileResult.stdout.trim() !== 'exists') {
        console.log(`[ProjectPreviewService] docker-compose.yml 不存在，使用模板创建`);
        const initResult = await dockerComposeService.initConfig(workDir, false);
        if (!initResult.success) {
          return {
            success: false,
            error: `创建 docker-compose.yml 失败: ${initResult.error}`,
          };
        }
      }

      // 6. 分配端口
      const ports = await this.allocatePorts(sessionId);
      console.log(`[ProjectPreviewService] 分配端口:`, ports);

      // 7. 使用 Docker API 创建容器（不修改 docker-compose.yml）
      const containerResult = await this.createContainerWithDynamicPorts(workDir, ports);
      if (!containerResult.success) {
        await this.updatePreviewStatus(sessionId, {
          url: '',
          containerId: '',
          branchName: gitBranch,
          deployedAt: new Date(),
          status: PreviewStatus.ERROR,
        });
        return {
          success: false,
          error: `创建容器失败: ${containerResult.error}`,
        };
      }

      const containerId = containerResult.containerId!;
      console.log(`[ProjectPreviewService] 容器创建成功: ${containerId}`);

      // 10.5 获取镜像信息
      let imageId = '';
      let imageName = '';
      try {
        const imageInfoResult = await this.executor.executeCommand(
          `docker inspect --format='{{.Image}}' ${containerId}`
        );
        imageId = imageInfoResult.stdout.trim();
        
        const imageNameResult = await this.executor.executeCommand(
          `docker inspect --format='{{.Config.Image}}' ${containerId}`
        );
        imageName = imageNameResult.stdout.trim();
        
        console.log(`[ProjectPreviewService] 镜像 ID: ${imageId}`);
        console.log(`[ProjectPreviewService] 镜像名称: ${imageName}`);
      } catch (error) {
        console.warn(`[ProjectPreviewService] 获取镜像信息失败:`, error);
      }

      // 11. 等待健康检查
      console.log(`[ProjectPreviewService] 进行健康检查...`);
      const healthCheck = await this.checkContainerHealth(containerId, ports);
      
      if (!healthCheck.healthy) {
        console.warn(`[ProjectPreviewService] 健康检查未通过: ${healthCheck.details}`);
      }

      // 12. 获取本机 IP 并生成预览 URL
      const localIp = await this.getLocalIpAddress();
      const previewUrl = this.generatePreviewUrl(localIp, ports);
      console.log(`[ProjectPreviewService] 预览 URL: ${previewUrl}`);

      // 13. 保存预览信息到会话上下文
      const totalTime = Math.round((Date.now() - startTime) / 1000);
      const deploymentInfo: DeploymentInfo = {
        buildTime: 0, // Docker API 方式不单独计算构建时间
        startTime: 0,
        totalTime,
        ports,
      };

      await this.updatePreviewStatus(sessionId, {
        url: previewUrl,
        containerId,
        imageId,
        imageName,
        branchName: gitBranch,
        deployedAt: new Date(),
        status: PreviewStatus.RUNNING,
        isRunning: healthCheck.healthy,
        accessUrl: previewUrl,
        ports,
      });

      console.log(`[ProjectPreviewService] 预览创建成功，总耗时: ${totalTime}s`);

      return {
        success: true,
        previewUrl,
        containerId,
        deploymentInfo,
      };
    } catch (error) {
      console.error(`[ProjectPreviewService] 预览创建失败:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取预览状态
   */
  async getPreviewStatus(sessionId: string): Promise<PreviewStatusResponse> {
    try {
      const session = await this.conversationManager.getSession(sessionId);
      if (!session || !session.context.previewInfo) {
        return {
          status: PreviewStatus.STOPPED,
        };
      }

      const { previewInfo } = session.context;

      // 检查容器是否仍在运行
      if (previewInfo.containerId) {
        const healthCheck = await this.checkContainerHealth(
          previewInfo.containerId,
          previewInfo.ports || []
        );

        // 更新运行状态
        const isRunning = healthCheck.healthy;
        const currentStatus = isRunning ? PreviewStatus.RUNNING : PreviewStatus.STOPPED;
        
        // 如果状态发生变化，更新到 context
        if (previewInfo.status !== currentStatus || previewInfo.isRunning !== isRunning) {
          await this.updatePreviewStatus(sessionId, {
            ...previewInfo,
            status: currentStatus,
            isRunning,
          });
        }

        return {
          status: currentStatus,
          url: previewInfo.url,
          containerId: previewInfo.containerId,
          imageId: previewInfo.imageId,
          imageName: previewInfo.imageName,
          branchName: previewInfo.branchName,
          deployedAt: previewInfo.deployedAt,
          isRunning,
          accessUrl: previewInfo.accessUrl || previewInfo.url,
          healthCheck,
        };
      }

      return {
        status: previewInfo.status,
        url: previewInfo.url,
        imageId: previewInfo.imageId,
        imageName: previewInfo.imageName,
        branchName: previewInfo.branchName,
        deployedAt: previewInfo.deployedAt,
        isRunning: previewInfo.isRunning,
        accessUrl: previewInfo.accessUrl,
      };
    } catch (error) {
      console.error(`[ProjectPreviewService] 获取预览状态失败:`, error);
      return {
        status: PreviewStatus.ERROR,
      };
    }
  }

  /**
   * 停止预览
   */
  async stopPreview(sessionId: string): Promise<OperationResult> {
    try {
      const session = await this.conversationManager.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          message: '会话不存在',
        };
      }

      const workDir = session.context.projectInfo.workDir;
      await this.stopPreviewInternal(workDir);

      // 更新会话上下文
      await this.updatePreviewStatus(sessionId, {
        url: '',
        containerId: '',
        branchName: session.context.gitBranch || '',
        deployedAt: new Date(),
        status: PreviewStatus.STOPPED,
      });

      return {
        success: true,
        message: '预览已停止',
      };
    } catch (error) {
      console.error(`[ProjectPreviewService] 停止预览失败:`, error);
      return {
        success: false,
        message: '停止预览失败',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 检查容器健康状态
   */
  async checkContainerHealth(
    containerId: string,
    ports: PortMapping[]
  ): Promise<HealthCheckResult> {
    try {
      if (!containerId) {
        return {
          healthy: false,
          lastCheck: new Date(),
          details: '容器 ID 为空',
        };
      }

      // 检查容器是否运行
      const inspectResult = await this.executor.executeCommand(
        `docker inspect -f '{{.State.Running}}' ${containerId}`
      );

      const isRunning = inspectResult.stdout.trim() === 'true';
      
      return {
        healthy: isRunning,
        lastCheck: new Date(),
        details: isRunning ? '容器运行正常' : '容器未运行',
      };
    } catch (error) {
      return {
        healthy: false,
        lastCheck: new Date(),
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 生成预览 URL
   */
  generatePreviewUrl(hostIp: string, ports: PortMapping[]): string {
    // 使用 basement 服务的端口作为主入口
    const basementPort = ports.find(p => p.service === 'basement');
    if (basementPort) {
      return `http://${hostIp}:${basementPort.host}`;
    }

    // 如果没有 basement，使用第一个端口
    if (ports.length > 0) {
      return `http://${hostIp}:${ports[0].host}`;
    }

    return `http://${hostIp}:8080`;
  }

  /**
   * 获取本机局域网 IP 地址
   */
  private async getLocalIpAddress(): Promise<string> {
    try {
      // macOS/Linux: 使用 ifconfig 获取 en0 的 IP
      const result = await this.executor.executeCommand(
        `ifconfig en0 | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1`
      );

      if (result.exitCode === 0 && result.stdout.trim()) {
        const ip = result.stdout.trim();
        console.log(`[ProjectPreviewService] 检测到本机 IP: ${ip}`);
        return ip;
      }

      // 如果 en0 没有 IP，尝试其他网卡
      const fallbackResult = await this.executor.executeCommand(
        `ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1`
      );

      if (fallbackResult.exitCode === 0 && fallbackResult.stdout.trim()) {
        const ip = fallbackResult.stdout.trim();
        console.log(`[ProjectPreviewService] 检测到本机 IP (fallback): ${ip}`);
        return ip;
      }

      // 都失败了，使用配置的 SSH_HOST 或 localhost
      console.warn(`[ProjectPreviewService] 无法获取本机 IP，使用配置值: ${this.sshHost}`);
      return this.sshHost;
    } catch (error) {
      console.error(`[ProjectPreviewService] 获取本机 IP 失败:`, error);
      return this.sshHost;
    }
  }

  /**
   * 分配端口
   */
  private async allocatePorts(sessionId: string): Promise<PortMapping[]> {
    // 从 docker-compose.yml 解析需要的容器端口
    const session = await this.conversationManager.getSession(sessionId);
    if (!session) {
      throw new Error('会话不存在');
    }

    const workDir = session.context.projectInfo.workDir;

    // 读取 docker-compose.yml
    const composeFileResult = await this.executor.executeCommand(
      'cat docker-compose.yml',
      workDir
    );

    if (composeFileResult.exitCode !== 0) {
      // 如果没有 docker-compose.yml，使用默认端口
      return [
        { host: await this.findAvailablePort(), container: 8001, service: 'web' },
      ];
    }

    const content = composeFileResult.stdout;

    // 解析服务和端口配置
    // 匹配服务名称和其下的 ports 配置
    const serviceRegex = /^\s*(\w+):\s*$/gm;
    const portsRegex = /ports:\s*\n(\s*-\s*['"]?\d+:\d+['"]?\s*\n?)+/g;

    const portMappings: PortMapping[] = [];
    let currentService = 'web'; // 默认服务名

    // 按行解析，找到服务名和对应的端口
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 检查是否是服务定义行（顶层缩进）
      const serviceMatch = line.match(/^  (\w+):\s*$/);
      if (serviceMatch) {
        currentService = serviceMatch[1];
        continue;
      }

      // 检查是否是 ports 配置行
      if (line.trim() === 'ports:') {
        // 读取后续的端口配置
        for (let j = i + 1; j < lines.length; j++) {
          const portLine = lines[j];
          const portMatch = portLine.match(/^\s*-\s*['"]?(\d+):(\d+)['"]?\s*$/);
          
          if (portMatch) {
            const containerPort = parseInt(portMatch[2]);
            const hostPort = await this.findAvailablePort();
            portMappings.push({
              host: hostPort,
              container: containerPort,
              service: currentService,
            });
          } else if (portLine.trim() && !portLine.match(/^\s*-/)) {
            // 遇到非端口配置行，退出
            break;
          }
        }
      }
    }

    if (portMappings.length === 0) {
      // 没有找到端口配置，使用默认
      return [
        { host: await this.findAvailablePort(), container: 8001, service: 'web' },
      ];
    }

    return portMappings;
  }

  /**
   * 查找可用端口
   */
  private async findAvailablePort(): Promise<number> {
    const startPort = this.PORT_RANGE_START;
    const endPort = this.PORT_RANGE_END;

    for (let port = startPort; port <= endPort; port++) {
      const isAvailable = await this.checkPortAvailable(port);
      if (isAvailable) {
        return port;
      }
    }

    throw new Error(`端口范围 ${startPort}-${endPort} 内没有可用端口`);
  }

  /**
   * 检查端口是否可用
   */
  private async checkPortAvailable(port: number): Promise<boolean> {
    try {
      // 使用 lsof 检查端口是否被占用（macOS/Linux）
      const result = await this.executor.executeCommand(
        `lsof -i :${port} || echo "available"`
      );

      // 如果输出包含 "available"，说明端口可用
      return result.stdout.includes('available');
    } catch (error) {
      // 如果命令失败，假设端口可用
      return true;
    }
  }

  /**
   * 使用 Docker HTTP API 动态创建容器（替代 docker-compose）
   */
  private async createContainerWithDynamicPorts(
    workDir: string,
    ports: PortMapping[]
  ): Promise<{ success: boolean; containerId?: string; error?: string }> {
    try {
      console.log(`[ProjectPreviewService] 使用 Docker API 创建容器，动态端口:`, ports);

      // 1. 构建镜像（如果需要）
      const imageName = `preview-${Date.now()}`;
      const buildResult = await this.executor.executeCommand(
        `docker build -t ${imageName} .`,
        workDir
      );

      if (buildResult.exitCode !== 0) {
        return {
          success: false,
          error: `构建镜像失败: ${buildResult.stderr}`
        };
      }

      // 2. 准备端口映射参数
      const portMappings = ports.map(p => `-p ${p.host}:${p.container}`).join(' ');

      // 3. 创建并启动容器
      const runResult = await this.executor.executeCommand(
        `docker run -d ${portMappings} -v "${workDir}:/app" -v /app/node_modules -e PORT=${ports[0].container} -e BROWSER=none --name preview-${Date.now()} ${imageName} pnpm exec max dev --host 0.0.0.0 --port ${ports[0].container}`,
        workDir
      );

      if (runResult.exitCode !== 0) {
        return {
          success: false,
          error: `启动容器失败: ${runResult.stderr}`
        };
      }

      const containerId = runResult.stdout.trim();
      console.log(`[ProjectPreviewService] ✅ 容器创建成功: ${containerId}`);

      return {
        success: true,
        containerId
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 停止并删除容器
   */
  private async removeContainer(containerId: string): Promise<void> {
    try {
      // 停止容器
      await this.executor.executeCommand(`docker stop ${containerId}`);
      // 删除容器
      await this.executor.executeCommand(`docker rm ${containerId}`);
      console.log(`[ProjectPreviewService] ✅ 容器已清理: ${containerId}`);
    } catch (error) {
      console.warn(`[ProjectPreviewService] ⚠️ 清理容器失败: ${containerId}`, error);
    }
  }

  /**
   * 停止预览（内部方法）
   */
  private async stopPreviewInternal(workDir: string, containerId?: string): Promise<void> {
    try {
      if (containerId) {
        // 使用 Docker API 方式停止容器
        await this.removeContainer(containerId);
      } else {
        // 回退到 docker-compose 方式
        const dockerComposeService = new DockerComposeService(this.executor);
        const downResult = await dockerComposeService.down(workDir);
        if (!downResult.success) {
          console.warn(`[ProjectPreviewService] 停止容器失败: ${downResult.error}`);
        }
      }
    } catch (error) {
      console.error(`[ProjectPreviewService] 停止容器异常:`, error);
    }
  }

  /**
   * 更新预览状态到会话上下文
   */
  private async updatePreviewStatus(
    sessionId: string,
    previewInfo: {
      url: string;
      containerId: string;
      imageId?: string;
      imageName?: string;
      branchName: string;
      deployedAt: Date;
      status: PreviewStatus;
      isRunning?: boolean;
      accessUrl?: string;
      ports?: PortMapping[];
    }
  ): Promise<void> {
    try {
      const session = await this.conversationManager.getSession(sessionId);
      if (session) {
        session.context.previewInfo = previewInfo;
        await this.conversationManager['storage'].saveContext(sessionId, session.context);
      }
    } catch (error) {
      console.error(`[ProjectPreviewService] 更新预览状态失败:`, error);
    }
  }
}
