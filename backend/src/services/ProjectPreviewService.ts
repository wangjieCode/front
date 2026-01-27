import { ConversationManager } from './ConversationManager';
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
import * as path from 'path';
import * as fs from 'fs';
import dayjs from 'dayjs';

/**
 * 项目预览服务
 * 负责统筹预览部署流程 (基于 Infrastructure Docker Compose)
 */
export class ProjectPreviewService {
  private conversationManager: ConversationManager;
  private executor: ICommandExecutor;
  private sshHost: string;
  private infrastructureDir: string;

  // 配置常量
  private readonly PORT_RANGE_START = parseInt(process.env.PREVIEW_PORT_RANGE_START || '8080');
  private readonly PORT_RANGE_END = parseInt(process.env.PREVIEW_PORT_RANGE_END || '8280');

  constructor(conversationManager: ConversationManager, executor: ICommandExecutor, sshHost?: string) {
    this.conversationManager = conversationManager;
    this.executor = executor;
    this.sshHost = sshHost || process.env.SSH_HOST || 'localhost';
    
    // 定位 infrastructure 目录
    // 默认尝试: 相对于 backend 的 ../infrastructure
    // backend/src/services/ -> backend/src/ -> backend/ -> root -> infrastructure
    this.infrastructureDir = path.resolve(__dirname, '../../../infrastructure');
    
    // 优先使用环境变量
    if (process.env.INFRASTRUCTURE_DIR) {
      this.infrastructureDir = process.env.INFRASTRUCTURE_DIR;
    }
    
    console.log(`[ProjectPreviewService] Infrastructure 目录: ${this.infrastructureDir}`);
  }

  /**
   * 创建预览部署
   */
  async createPreview(
    sessionId: string,
    forceRebuild: boolean = false,
    apiTarget?: string
  ): Promise<PreviewResult> {
    const startTime = dayjs().valueOf();
    console.log(`[ProjectPreviewService] 开始创建预览: sessionId=${sessionId}`);

    try {
      // 1. 获取会话上下文
      const session = await this.conversationManager.getSession(sessionId);
      
      if (!session) {
        return { success: false, error: '会话不存在' };
      }

      const { context } = session;
      const workDir = context.projectInfo.workDir;
      const gitBranch = context.gitBranch || 'unknown';

      console.log(`[ProjectPreviewService] 工作目录: ${workDir}, Git 分支: ${gitBranch}`);

      // 2. 准备项目名称 (用于 docker-compose isolation)
      const projectName = `preview-${sessionId.substring(0, 8)}`;
      
      // 如果强制重建，先尝试清理
      if (forceRebuild) {
        console.log(`[ProjectPreviewService] 强制重建，正在停止旧实例...`);
        await this.stopPreviewByProjectName(projectName);
      }

      // 3. 分配端口
      // 注意: 在 docker-compose 模式下，我们需要预分配 HOST_PORT
      const hostPort = await this.findAvailablePort();
      console.log(`[ProjectPreviewService] 分配端口: ${hostPort}`);

      // 4. 准备环境变量
      const finalApiTarget = apiTarget || process.env.API_TARGET || '';
      const dockerfilePath = path.join(this.infrastructureDir, 'Dockerfile');
      const envVars = [
        `PROJECT_DIR=${workDir}`,
        `HOST_PORT=${hostPort}`,
        `IS_PREVIEW=true`,
        `COMPOSE_PROJECT_NAME=${projectName}`,
        `DOCKERFILE=${dockerfilePath}`
      ];
      
      envVars.push(`API_TARGET=${finalApiTarget}`);

      // 5. 构建并启动
      // 使用 -p 指定项目名，实现多租户隔离
      // -d 后台运行
      // --build 确保重新构建镜像 (如果 Dockerfile 变了)
      const command = `${envVars.join(' ')} docker-compose up -d`;
      
      console.log(`[ProjectPreviewService] 正在启动预览模式...`);
      console.log(`[ProjectPreviewService] 工作目录 (CWD): ${this.infrastructureDir}`);
      console.log(`[ProjectPreviewService] 执行命令: ${command}`);

      // 验证目录是否存在
      if (!fs.existsSync(this.infrastructureDir)) {
        const errorMsg = `Infrastructure 目录不存在: ${this.infrastructureDir}`;
        console.error(`[ProjectPreviewService] ❌ ${errorMsg}`);
        await this.updatePreviewStatus(sessionId, {
          url: '',
          containerId: '',
          branchName: gitBranch,
          deployedAt: dayjs().toDate(),
          status: PreviewStatus.ERROR
        });
        return { success: false, error: errorMsg };
      }
      
      // 更新状态: 构建中
      await this.updatePreviewStatus(sessionId, {
        url: '',
        containerId: '',
        branchName: gitBranch,
        deployedAt: dayjs().toDate(),
        status: PreviewStatus.BUILDING,
        ports: [{ host: hostPort, container: 8001, service: 'web' }]
      });

      const result = await this.executor.executeCommand(command, this.infrastructureDir);
      console.log(`[ProjectPreviewService] 命令输出 (stdout): ${result.stdout}`);
      console.log(`[ProjectPreviewService] 命令错误 (stderr): ${result.stderr}`);

      if (result.exitCode !== 0) {
        const errorMsg = `启动失败: ${result.stderr || result.stdout}`;
        console.error(`[ProjectPreviewService] ${errorMsg}`);
        await this.updatePreviewStatus(sessionId, {
          url: '',
          containerId: '',
          branchName: gitBranch,
          deployedAt: dayjs().toDate(),
          status: PreviewStatus.ERROR
        });
        return { success: false, error: errorMsg };
      }

      console.log(`[ProjectPreviewService] Docker Compose 启动成功`);

      // 6. 获取容器 ID
      // docker-compose ps -q [service] 可以获取容器 ID
      const psCmd = `COMPOSE_PROJECT_NAME=${projectName} docker-compose ps -q web`;
      const psResult = await this.executor.executeCommand(psCmd, this.infrastructureDir);
      const containerId = psResult.stdout.trim();
      
      console.log(`[ProjectPreviewService] 获取到容器 ID: ${containerId}`);

      // 调试: 检查容器端口映射
      if (containerId) {
        const portCmd = `docker port ${containerId}`;
        const portResult = await this.executor.executeCommand(portCmd);
        console.log(`[ProjectPreviewService] 容器端口映射: ${portResult.stdout}`);
      }

      // 7. 生成访问 URL
      const localIp = await this.getLocalIpAddress();
      console.log(`[ProjectPreviewService] 使用 IP: ${localIp}`);
      const previewUrl = `http://${localIp}:${hostPort}`;

      // 8. 最终更新状态
      await this.updatePreviewStatus(sessionId, {
        url: previewUrl,
        containerId,
        branchName: gitBranch,
        deployedAt: dayjs().toDate(),
        status: PreviewStatus.RUNNING,
        isRunning: true,
        accessUrl: previewUrl,
        ports: [{ host: hostPort, container: 8001, service: 'web' }]
      });

      const totalTime = Math.round((dayjs().valueOf() - startTime) / 1000);
      return {
        success: true,
        previewUrl,
        containerId,
        deploymentInfo: {
          buildTime: 0,
          startTime: 0,
          totalTime,
          ports: [{ host: hostPort, container: 8001, service: 'web' }]
        }
      };

    } catch (error) {
      console.error(`[ProjectPreviewService] 预览创建异常:`, error);
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
        return { status: PreviewStatus.STOPPED };
      }

      const { previewInfo } = session.context;
      
      // 检查容器是否存活
      let isRunning = false;
      if (previewInfo.containerId) {
        try {
          const inspect = await this.executor.executeCommand(`docker inspect -f '{{.State.Running}}' ${previewInfo.containerId}`);
          isRunning = inspect.stdout.trim() === 'true';
        } catch {
          isRunning = false; 
        }
      }

      const newStatus = isRunning ? PreviewStatus.RUNNING : PreviewStatus.STOPPED;

      // 如果状态变化，更新 DB
      if (previewInfo.status !== newStatus || previewInfo.isRunning !== isRunning) {
        await this.updatePreviewStatus(sessionId, {
           ...previewInfo,
           status: newStatus,
           isRunning
        });
      }

      return {
        status: newStatus,
        url: previewInfo.url,
        isRunning,
        accessUrl: previewInfo.accessUrl,
        containerId: previewInfo.containerId
      };

    } catch (error) {
      console.error(`[ProjectPreviewService] 获取状态失败:`, error);
      return { status: PreviewStatus.ERROR };
    }
  }

  /**
   * 停止预览
   */
  async stopPreview(sessionId: string): Promise<OperationResult> {
    const projectName = `preview-${sessionId.substring(0, 8)}`;
    return this.stopPreviewByProjectName(projectName, sessionId);
  }

  /**
   * 按项目名停止 (Internal)
   */
  private async stopPreviewByProjectName(projectName: string, sessionId?: string): Promise<OperationResult> {
    try {
      console.log(`[ProjectPreviewService] 停止项目: ${projectName}`);
      
      const command = `COMPOSE_PROJECT_NAME=${projectName} docker-compose down`;
      await this.executor.executeCommand(command, this.infrastructureDir);

      if (sessionId) {
        await this.updatePreviewStatus(sessionId, {
          url: '',
          containerId: '',
          branchName: '',
          deployedAt: dayjs().toDate(),
          status: PreviewStatus.STOPPED,
          isRunning: false
        });
      }

      return { success: true, message: '预览已停止' };
    } catch (error) {
      return { success: false, message: '停止预览失败', error: String(error) };
    }
  }

  /**
   * 查找可用端口
   */
  private async findAvailablePort(): Promise<number> {
    const startPort = this.PORT_RANGE_START;
    const endPort = this.PORT_RANGE_END;

    for (let port = startPort; port <= endPort; port++) {
      if (await this.checkPortAvailable(port)) return port;
    }
    throw new Error(`无可用端口 (${startPort}-${endPort})`);
  }

  private async checkPortAvailable(port: number): Promise<boolean> {
    try {
      const result = await this.executor.executeCommand(`lsof -i :${port} || echo "available"`);
      return result.stdout.includes('available');
    } catch {
      return true;
    }
  }

  /**
   * 获取本机 IP
   */
  private async getLocalIpAddress(): Promise<string> {
    try {
      // 尝试获取 en0
      const cmd = `ifconfig en0 | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1`;
      const res = await this.executor.executeCommand(cmd);
      const ip = res.stdout.trim();
      if (ip) return ip;
      
      // Fallback
      const cmdKb = `ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1`;
      const resKb = await this.executor.executeCommand(cmdKb);
      return resKb.stdout.trim() || this.sshHost;
    } catch {
      return this.sshHost;
    }
  }

  private async updatePreviewStatus(sessionId: string, status: any) {
    const session = await this.conversationManager.getSession(sessionId);
    if (session) {
      session.context.previewInfo = status;
      await this.conversationManager.saveContext(sessionId);
    }
  }
}
