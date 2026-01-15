import { ConversationManager } from './ConversationManager';
import { DockerComposeService } from './DockerComposeService';
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
      const step1Start = Date.now();
      const session = await this.conversationManager.getSession(sessionId);
      console.log(`[ProjectPreviewService] ⏱️ 步骤1-获取会话: ${Date.now() - step1Start}ms`);
      
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
      const step2Start = Date.now();
      if (context.previewInfo?.containerId) {
        console.log(`[ProjectPreviewService] 停止旧的预览容器: ${context.previewInfo.containerId}`);
        await this.stopPreviewInternal(workDir, context.previewInfo.containerId);
      }
      console.log(`[ProjectPreviewService] ⏱️ 步骤2-停止旧预览: ${Date.now() - step2Start}ms`);

      // 3. 分配端口
      const step3Start = Date.now();
      const ports = await this.allocatePorts(sessionId);
      console.log(`[ProjectPreviewService] 分配端口:`, ports);
      console.log(`[ProjectPreviewService] ⏱️ 步骤3-分配端口: ${Date.now() - step3Start}ms`);

      // 7. 使用 Docker API 创建容器（不修改 docker-compose.yml）
      const step7Start = Date.now();
      const containerResult = await this.createContainerWithDynamicPorts(workDir, ports, sessionId, forceRebuild);
      console.log(`[ProjectPreviewService] ⏱️ 步骤7-创建容器: ${Date.now() - step7Start}ms`);
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
      const step10Start = Date.now();
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
      console.log(`[ProjectPreviewService] ⏱️ 步骤10-获取镜像信息: ${Date.now() - step10Start}ms`);

      // 11. 等待健康检查
      const step11Start = Date.now();
      console.log(`[ProjectPreviewService] 进行健康检查...`);
      const healthCheck = await this.checkContainerHealth(containerId, ports);
      
      if (!healthCheck.healthy) {
        console.warn(`[ProjectPreviewService] 健康检查未通过: ${healthCheck.details}`);
      }
      console.log(`[ProjectPreviewService] ⏱️ 步骤11-健康检查: ${Date.now() - step11Start}ms`);

      // 12. 获取本机 IP 并生成预览 URL
      const step12Start = Date.now();
      const localIp = await this.getLocalIpAddress();
      const previewUrl = this.generatePreviewUrl(localIp, ports);
      console.log(`[ProjectPreviewService] 预览 URL: ${previewUrl}`);
      console.log(`[ProjectPreviewService] ⏱️ 步骤12-生成URL: ${Date.now() - step12Start}ms`);

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
      await this.stopPreviewInternal(workDir, session.context.previewInfo?.containerId);

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
   * 生成项目镜像缓存 key（基于配置文件内容）
   */
  private async generateProjectImageKey(workDir: string): Promise<string> {
    // 读取关键配置文件内容
    const files = ['package.json', 'Dockerfile', '.npmrc'];
    let combinedContent = '';

    for (const file of files) {
      const result = await this.executor.executeCommand(
        `cat ${file} 2>/dev/null || echo ""`,
        workDir
      );
      if (result.exitCode === 0 && result.stdout.trim()) {
        combinedContent += result.stdout;
      }
    }

    // 如果没有读取到任何文件，抛出错误
    if (!combinedContent) {
      throw new Error('无法读取项目配置文件（package.json、Dockerfile、.npmrc）');
    }

    // 生成 hash
    const hash = require('crypto')
      .createHash('md5')
      .update(combinedContent)
      .digest('hex')
      .substring(0, 8);

    return hash;
  }

  /**
   * 使用 Docker HTTP API 动态创建容器（替代 docker-compose）
   */
  private async createContainerWithDynamicPorts(
    workDir: string,
    ports: PortMapping[],
    sessionId: string,
    forceRebuild: boolean = false
  ): Promise<{ success: boolean; containerId?: string; error?: string }> {
    try {
      console.log(`[ProjectPreviewService] 使用 Docker API 创建容器，动态端口:`, ports);

      // 1. 生成基础镜像名（基于项目配置文件哈希）
      const hashStart = Date.now();
      const projectHash = await this.generateProjectImageKey(workDir);
      const baseImageName = `preview-base-${projectHash}`;
      const sessionImageName = `preview-session-${sessionId.substring(0, 8)}`;

      console.log(`[ProjectPreviewService] 项目镜像 key: ${projectHash}`);
      console.log(`[ProjectPreviewService] ⏱️ 生成镜像key: ${Date.now() - hashStart}ms`);

      // 2. 检查是否存在基础镜像（除非强制重建）
      const checkStart = Date.now();
      let needsBuild = forceRebuild;
      if (!forceRebuild) {
        console.log(`[ProjectPreviewService] 检查基础镜像是否存在: ${baseImageName}`);
        const imageExistsResult = await this.executor.executeCommand(
          `docker images -q ${baseImageName}`
        );
        needsBuild = !imageExistsResult.stdout.trim();
      }
      console.log(`[ProjectPreviewService] ⏱️ 检查镜像: ${Date.now() - checkStart}ms`);

      // 3. 构建基础镜像（如果需要）
      if (needsBuild) {
        console.log(`[ProjectPreviewService] 构建基础镜像: ${baseImageName}`);
        console.log(`[ProjectPreviewService] 构建命令: docker build -t ${baseImageName} .`);
        console.log(`[ProjectPreviewService] 工作目录: ${workDir}`);
        
        // 更新状态为构建中
        await this.updatePreviewStatus(sessionId, {
          url: '',
          containerId: '',
          branchName: '',
          deployedAt: new Date(),
          status: PreviewStatus.BUILDING,
          ports,
        });

        // 使用流式输出显示构建进度，启用 BuildKit 缓存
        console.log(`[ProjectPreviewService] ========== 开始构建 ==========`);
        
        let buildResult;
        if (this.executor.executeCommandStream) {
          buildResult = await this.executor.executeCommandStream(
            `DOCKER_BUILDKIT=1 docker build --progress=plain --build-arg BUILDKIT_INLINE_CACHE=1 -t ${baseImageName} . 2>&1`,
            workDir,
            (data) => {
              // 实时输出构建日志
              process.stdout.write(data);
            },
            (error) => {
              // 实时输出错误日志
              process.stderr.write(error);
            }
          );
        } else {
          // 回退到普通命令执行
          buildResult = await this.executor.executeCommand(
            `DOCKER_BUILDKIT=1 docker build --progress=plain --build-arg BUILDKIT_INLINE_CACHE=1 -t ${baseImageName} . 2>&1`,
            workDir
          );
          console.log(buildResult.stdout);
        }
        
        console.log(`[ProjectPreviewService] ========== 构建结束 ==========`);

        if (buildResult.exitCode !== 0) {
          console.error(`[ProjectPreviewService] 构建失败，退出码: ${buildResult.exitCode}`);
          const errorLines = (buildResult.stderr || buildResult.stdout).split('\n').slice(-10).join('\n');
          return {
            success: false,
            error: `构建基础镜像失败: ${errorLines}`
          };
        }
        console.log(`[ProjectPreviewService] ✅ 基础镜像构建完成`);
      } else {
        console.log(`[ProjectPreviewService] ✅ 复用现有基础镜像: ${baseImageName}`);
      }

      // 4. 创建会话专用镜像（轻量级，只是重新标记）
      console.log(`[ProjectPreviewService] 创建会话镜像: ${sessionImageName}`);
      const tagResult = await this.executor.executeCommand(
        `docker tag ${baseImageName} ${sessionImageName}`
      );

      if (tagResult.exitCode !== 0) {
        return {
          success: false,
          error: `创建会话镜像失败: ${tagResult.stderr}`
        };
      }

      // 5. 准备容器配置（使用固定名称，便于复用）
      const containerName = `preview-${sessionId.substring(0, 8)}`;
      
      // 5.1 检查是否已存在同名容器
      const existingContainerResult = await this.executor.executeCommand(
        `docker ps -a -q -f name=^${containerName}$`
      );
      
      if (existingContainerResult.stdout.trim()) {
        const existingContainerId = existingContainerResult.stdout.trim();
        console.log(`[ProjectPreviewService] 发现已存在容器: ${existingContainerId}`);
        
        // 检查容器状态
        const statusResult = await this.executor.executeCommand(
          `docker inspect -f '{{.State.Status}}' ${existingContainerId}`
        );
        const status = statusResult.stdout.trim();
        
        if (status === 'running') {
          console.log(`[ProjectPreviewService] ✅ 容器已在运行，直接复用`);
          return {
            success: true,
            containerId: existingContainerId
          };
        } else if (status === 'exited') {
          console.log(`[ProjectPreviewService] 重启已停止的容器...`);
          const restartResult = await this.executor.executeCommand(
            `docker start ${existingContainerId}`
          );
          if (restartResult.exitCode === 0) {
            console.log(`[ProjectPreviewService] ✅ 容器重启成功`);
            return {
              success: true,
              containerId: existingContainerId
            };
          } else {
            console.log(`[ProjectPreviewService] 重启失败，删除旧容器并重新创建`);
            await this.executor.executeCommand(`docker rm ${existingContainerId}`);
          }
        }
      }
      
      const portMappings = ports.map(p => `-p 0.0.0.0:${p.host}:${p.container}`).join(' ');

      // 6. 创建并启动容器
      console.log(`[ProjectPreviewService] 启动容器: ${containerName}`);
      
      // 使用流式输出显示容器启动日志
      const runCommand = `docker run -d ${portMappings} ` +
        `-v "${workDir}:/app" ` +
        `-v /app/node_modules ` +
        `-e PORT=${ports[0].container} ` +
        `-e BROWSER=none ` +
        `-e HOST=0.0.0.0 ` +
        `--name ${containerName} ` +
        `${sessionImageName} ` +
        `pnpm exec max dev --host 0.0.0.0 --port ${ports[0].container}`;
      
      console.log(`[ProjectPreviewService] 启动命令: ${runCommand}`);
      console.log(`[ProjectPreviewService] ========== 开始启动容器 ==========`);
      
      const runResult = await this.executor.executeCommand(runCommand, workDir);
      
      if (runResult.exitCode === 0) {
        const containerId = runResult.stdout.trim();
        console.log(`[ProjectPreviewService] ✅ 容器已创建: ${containerId}`);
        
        // 异步输出容器日志（不阻塞返回）
        setTimeout(async () => {
          try {
            console.log(`[ProjectPreviewService] ========== 容器启动日志 ==========`);
            if (this.executor.executeCommandStream) {
              await this.executor.executeCommandStream(
                `docker logs -f ${containerId} 2>&1 | head -n 50`,
                workDir,
                (data) => process.stdout.write(data),
                (error) => process.stderr.write(error)
              );
            } else {
              const logsResult = await this.executor.executeCommand(
                `docker logs ${containerId} 2>&1 | head -n 50`,
                workDir
              );
              console.log(logsResult.stdout);
            }
            console.log(`[ProjectPreviewService] ========== 日志输出结束 ==========`);
          } catch (e) {
            console.warn(`[ProjectPreviewService] 获取容器日志失败:`, e);
          }
        }, 100);
      }
      
      console.log(`[ProjectPreviewService] ========== 容器启动完成 ==========`);

      if (runResult.exitCode !== 0) {
        console.error(`[ProjectPreviewService] 启动容器失败:`);
        console.error(`[ProjectPreviewService] stdout: ${runResult.stdout}`);
        console.error(`[ProjectPreviewService] stderr: ${runResult.stderr}`);
        return {
          success: false,
          error: `启动容器失败: ${runResult.stderr}`
        };
      }

      const containerId = runResult.stdout.trim();

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
      // 只停止容器，不删除（便于快速重启）
      await this.executor.executeCommand(`docker stop ${containerId}`);
      console.log(`[ProjectPreviewService] ✅ 容器已停止: ${containerId}`);
      
      // 注释掉删除操作，保留容器以便复用
      // await this.executor.executeCommand(`docker rm ${containerId}`);
    } catch (error) {
      console.warn(`[ProjectPreviewService] ⚠️ 停止容器失败: ${containerId}`, error);
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
