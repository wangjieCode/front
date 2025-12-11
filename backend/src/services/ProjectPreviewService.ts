import { ConversationManager } from './ConversationManager';
import { GitService } from './GitService';
import { DockerComposeService } from './DockerComposeService';
import { SSHExecutor } from './SSHExecutor';
import { LocalExecutor } from './LocalExecutor';
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
  private readonly BUILD_TIMEOUT = parseInt(process.env.PREVIEW_BUILD_TIMEOUT || '300');
  private readonly STARTUP_TIMEOUT = parseInt(process.env.PREVIEW_STARTUP_TIMEOUT || '120');
  private readonly HEALTH_CHECK_TIMEOUT = parseInt(process.env.PREVIEW_HEALTH_CHECK_TIMEOUT || '30');

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
    branchId?: string,
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

      // 3. 创建 GitService 和 DockerComposeService
      const gitService = new GitService(this.executor as SSHExecutor, workDir);
      const dockerComposeService = new DockerComposeService(this.executor);

      // 4. 确认分支存在并切换
      console.log(`[ProjectPreviewService] 检查分支: ${gitBranch}`);
      
      // 先检查本地分支
      let branchExists = await gitService.branchExists(gitBranch);
      
      if (!branchExists) {
        // 本地不存在，检查远程分支
        console.log(`[ProjectPreviewService] 本地分支不存在，检查远程分支`);
        const remoteExists = await gitService.branchExists(gitBranch, true);
        
        if (!remoteExists) {
          return {
            success: false,
            error: `Git 分支不存在: ${gitBranch}，请确保分支已推送到远程`,
          };
        }
        
        // 远程存在，尝试拉取
        console.log(`[ProjectPreviewService] 远程分支存在，尝试拉取`);
        const fetchResult = await this.executor.executeCommand(
          `git fetch origin ${gitBranch}:${gitBranch}`,
          workDir
        );
        
        if (fetchResult.exitCode !== 0) {
          return {
            success: false,
            error: `拉取远程分支失败: ${fetchResult.stderr}`,
          };
        }
      }
      
      console.log(`[ProjectPreviewService] 切换到分支: ${gitBranch}`);
      const checkoutResult = await gitService.checkoutBranch(gitBranch);
      if (!checkoutResult.success) {
        return {
          success: false,
          error: `切换分支失败: ${checkoutResult.error}`,
        };
      }

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

      // 7. 更新 docker-compose.yml 的端口映射
      await this.updateDockerComposePorts(workDir, ports);

      // 8. 构建镜像
      const buildStartTime = Date.now();
      console.log(`[ProjectPreviewService] 开始构建镜像...`);
      
      // 更新会话上下文：设置为 building 状态
      await this.updatePreviewStatus(sessionId, {
        url: '',
        containerId: '',
        branchName: gitBranch,
        deployedAt: new Date(),
        status: PreviewStatus.BUILDING,
        ports,
      });

      const buildResult = forceRebuild
        ? await dockerComposeService.build(workDir, true)
        : await dockerComposeService.build(workDir, false);

      if (!buildResult.success) {
        await this.updatePreviewStatus(sessionId, {
          url: '',
          containerId: '',
          branchName: gitBranch,
          deployedAt: new Date(),
          status: PreviewStatus.ERROR,
        });
        return {
          success: false,
          error: `构建失败: ${buildResult.error}`,
        };
      }

      const buildTime = Math.round((Date.now() - buildStartTime) / 1000);
      console.log(`[ProjectPreviewService] 构建完成，耗时: ${buildTime}s`);

      // 9. 启动容器
      const startStartTime = Date.now();
      console.log(`[ProjectPreviewService] 启动容器...`);

      const upResult = await dockerComposeService.up(workDir, true);
      if (!upResult.success) {
        await this.updatePreviewStatus(sessionId, {
          url: '',
          containerId: '',
          branchName: gitBranch,
          deployedAt: new Date(),
          status: PreviewStatus.ERROR,
        });
        return {
          success: false,
          error: `启动容器失败: ${upResult.error}`,
        };
      }

      const startTimeSeconds = Math.round((Date.now() - startStartTime) / 1000);
      console.log(`[ProjectPreviewService] 容器启动完成，耗时: ${startTimeSeconds}s`);

      // 10. 获取容器 ID
      const containerIdResult = await this.executor.executeCommand(
        'docker-compose ps -q | head -n 1',
        workDir
      );
      const containerId = containerIdResult.stdout.trim();

      // 11. 等待健康检查
      console.log(`[ProjectPreviewService] 进行健康检查...`);
      const healthCheck = await this.checkContainerHealth(containerId, ports);
      
      if (!healthCheck.healthy) {
        console.warn(`[ProjectPreviewService] 健康检查未通过: ${healthCheck.details}`);
      }

      // 12. 生成预览 URL
      const previewUrl = this.generatePreviewUrl(this.sshHost, ports);
      console.log(`[ProjectPreviewService] 预览 URL: ${previewUrl}`);

      // 13. 保存预览信息到会话上下文
      const totalTime = Math.round((Date.now() - startTime) / 1000);
      const deploymentInfo: DeploymentInfo = {
        buildTime,
        startTime: startTimeSeconds,
        totalTime,
        ports,
      };

      await this.updatePreviewStatus(sessionId, {
        url: previewUrl,
        containerId,
        branchName: gitBranch,
        deployedAt: new Date(),
        status: PreviewStatus.RUNNING,
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

        return {
          status: healthCheck.healthy ? PreviewStatus.RUNNING : PreviewStatus.STOPPED,
          url: previewInfo.url,
          containerId: previewInfo.containerId,
          branchName: previewInfo.branchName,
          deployedAt: previewInfo.deployedAt,
          healthCheck,
        };
      }

      return {
        status: previewInfo.status,
        url: previewInfo.url,
        branchName: previewInfo.branchName,
        deployedAt: previewInfo.deployedAt,
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
   * 分配端口
   */
  private async allocatePorts(sessionId: string): Promise<PortMapping[]> {
    // 简化实现：使用固定端口映射
    // TODO: 实现动态端口分配（第二阶段）
    return [
      { host: 8080, container: 80, service: 'basement' },
      { host: 8083, container: 8083, service: 'sub-app' },
    ];
  }

  /**
   * 更新 docker-compose.yml 的端口映射
   */
  private async updateDockerComposePorts(
    workDir: string,
    ports: PortMapping[]
  ): Promise<void> {
    // 简化实现：暂不修改端口
    // docker-compose.yml 模板中已经定义了固定端口
    // TODO: 动态修改端口配置（第二阶段）
    console.log(`[ProjectPreviewService] 使用固定端口配置`);
  }

  /**
   * 停止预览（内部方法）
   */
  private async stopPreviewInternal(workDir: string): Promise<void> {
    try {
      const dockerComposeService = new DockerComposeService(this.executor);
      const downResult = await dockerComposeService.down(workDir);
      if (!downResult.success) {
        console.warn(`[ProjectPreviewService] 停止容器失败: ${downResult.error}`);
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
      branchName: string;
      deployedAt: Date;
      status: PreviewStatus;
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
