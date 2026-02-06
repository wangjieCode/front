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
import { getGitWorkDir } from '../utils/config';

/**
 * 项目预览服务
 * 负责统筹预览部署流程（基于 PM2）
 */
export class ProjectPreviewService {
  private conversationManager: ConversationManager;
  private executor: ICommandExecutor;
  private sshHost: string;
  private infrastructureDir: string;
  private mainProjectDir: string;

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

    this.mainProjectDir = getGitWorkDir();
    
    console.log(`[ProjectPreviewService] Infrastructure 目录: ${this.infrastructureDir}`);
    console.log(`[ProjectPreviewService] 主项目目录 (用于 node_modules): ${this.mainProjectDir}`);
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

      // 2. 准备项目名称（用于预览进程隔离）
      const projectName = `preview-${sessionId.substring(0, 8)}`;
      
      // 如果强制重建，先尝试清理
      if (forceRebuild) {
        console.log(`[ProjectPreviewService] 强制重建，正在停止旧实例...`);
        await this.stopPreviewByProjectName(projectName);
      }

      // 3. 分配端口
      const hostPort = await this.findAvailablePort();
      console.log(`[ProjectPreviewService] 分配端口: ${hostPort}`);

      // 4. 建立 node_modules 软连接
      console.log(`[ProjectPreviewService] 正在处理 node_modules 软连接...`);
      
      // 始终从数据库实时获取最新的项目配置，确保路径准确
      let sourceDir = context.projectInfo.workDir; // 默认使用上下文中的路径
      const projectResult = await this.conversationManager.projectService.getProject(context.projectInfo.projectId, session.userId!);
      
      if (projectResult.success && projectResult.project) {
        sourceDir = projectResult.project.workDirectory || projectResult.project.repoDir;
      }

      await this.ensureNodeModulesLinked(workDir, sourceDir);

      // 5. 创建 .env.local 文件覆盖端口配置
      // UmiJS 会优先读取 .env.local，这样可以覆盖主项目的 .env 中的 PORT=8001
      console.log(`[ProjectPreviewService] 创建 .env.local 文件，设置端口为 ${hostPort}...`);
      const envLocalPath = path.join(workDir, '.env.local');
      const envLocalContent = `PORT=${hostPort}\nHOST=0.0.0.0\n`;
      await this.executor.executeCommand(`echo "${envLocalContent}" > "${envLocalPath}"`);

      // 6. 启动 PM2 进程
      console.log(`[ProjectPreviewService] 启动 PM2 预览进程...`);
      
      // 更新状态: 构建中 (PM2 启动也视为构建/启动过程)
      await this.updatePreviewStatus(sessionId, {
        url: '',
        containerId: projectName, // 在 PM2 模式下，我们将 projectName 作为标识符
        branchName: gitBranch,
        deployedAt: dayjs().toDate(),
        status: PreviewStatus.BUILDING,
        ports: [{ host: hostPort, container: hostPort, service: 'web' }]
      });

      // PM2 启动命令
      // 使用 JSON 配置方式启动，避免命令行参数解析问题
      const finalApiTarget = apiTarget || process.env.API_TARGET || '';
      
      // 构建 PM2 ecosystem 配置
      const ecosystem = {
        name: projectName,
        cwd: workDir,
        script: 'pnpm',
        args: `exec max dev --port ${hostPort} --host 0.0.0.0`,
        env: {
          PORT: hostPort,
          HOST: '0.0.0.0',
          ...(finalApiTarget ? { API_TARGET: finalApiTarget } : {})
        }
      };
      
      // 使用 echo + pm2 start 的方式
      const ecosystemJson = JSON.stringify(ecosystem).replace(/"/g, '\\"');
      const startCommand = `echo '${JSON.stringify(ecosystem)}' | pm2 start -`;
      
      console.log(`[ProjectPreviewService] 执行 PM2 命令: ${startCommand}`);
      const result = await this.executor.executeCommand(startCommand, workDir);

      if (result.exitCode !== 0) {
        const errorMsg = `PM2 启动失败: ${result.stderr || result.stdout}`;
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

      console.log(`[ProjectPreviewService] PM2 启动成功`);

      // 6. 生成访问 URL
      const localIp = await this.getLocalIpAddress();
      console.log(`[ProjectPreviewService] 使用 IP: ${localIp}`);
      const previewUrl = `http://${localIp}:${hostPort}`;

      // 8. 最终更新状态
      await this.updatePreviewStatus(sessionId, {
        url: previewUrl,
        containerId: projectName, // PM2 模式下使用进程名
        branchName: gitBranch,
        deployedAt: dayjs().toDate(),
        status: PreviewStatus.RUNNING,
        isRunning: true,
        accessUrl: previewUrl,
        ports: [{ host: hostPort, container: hostPort, service: 'web' }]
      });

      const totalTime = Math.round((dayjs().valueOf() - startTime) / 1000);
      return {
        success: true,
        previewUrl,
        containerId: projectName,
        deploymentInfo: {
          buildTime: 0,
          startTime: 0,
          totalTime,
          ports: [{ host: hostPort, container: hostPort, service: 'web' }]
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
      
      // 检查 PM2 进程是否存活
      let isRunning = false;
      const projectName = `preview-${sessionId.substring(0, 8)}`;
      const { workDir, projectId } = session.context.projectInfo;

      // 实时查询数据库获取最新的项目工作目录
      let sourceDir = workDir;
      if (session.userId) {
        const projectResult = await this.conversationManager.projectService.getProject(projectId, session.userId);
        if (projectResult.success && projectResult.project) {
          sourceDir = projectResult.project.workDirectory || projectResult.project.repoDir;
        }
      }

      const symlinkHealth = this.checkSymlinkStatus(workDir, sourceDir);
      if (!symlinkHealth.valid) {
        console.warn(`[ProjectPreviewService] 会话 ${sessionId} 软连接异常: ${symlinkHealth.error}`);
      }

      if (previewInfo.containerId || projectName) {
        try {
          // 使用 pm2 jlist 获取进程列表并检查状态
          const listResult = await this.executor.executeCommand(`pm2 jlist`);
          const processes = JSON.parse(listResult.stdout);
          const proc = processes.find((p: any) => p.name === (previewInfo.containerId || projectName));
          isRunning = proc && (proc.pm2_env.status === 'online' || proc.pm2_env.status === 'launching');
          
          // 如果软连接失效，即使进程在线也可能无法正常工作
          if (isRunning && !symlinkHealth.valid) {
             console.warn(`[ProjectPreviewService] 进程运行中但软连接失效，预览可能不可用`);
          }
        } catch (e) {
          console.error(`[ProjectPreviewService] 检查 PM2 状态失败:`, e);
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
        containerId: previewInfo.containerId,
        healthCheck: {
          healthy: isRunning && symlinkHealth.valid,
          lastCheck: new Date(),
          details: symlinkHealth.valid ? 'Active' : symlinkHealth.error
        }
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
      console.log(`[ProjectPreviewService] 停止 PM2 进程: ${projectName}`);
      
      // 使用 pm2 delete 停止并删除进程
      // 先检查是否存在以避免错误输出
      const checkCmd = `pm2 describe ${projectName} > /dev/null 2>&1 && pm2 delete ${projectName} || echo "not running"`;
      await this.executor.executeCommand(checkCmd);

      // 清理 .env.local 文件
      if (sessionId) {
        const session = await this.conversationManager.getSession(sessionId);
        if (session?.context?.projectInfo?.workDir) {
          const envLocalPath = path.join(session.context.projectInfo.workDir, '.env.local');
          await this.executor.executeCommand(`rm -f "${envLocalPath}"`).catch(() => {
            console.log(`[ProjectPreviewService] .env.local 文件不存在或已删除`);
          });
        }

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
   * 检查软连接状态
   */
  private checkSymlinkStatus(workDir: string, sourceDir: string): { valid: boolean; error?: string } {
    const targetNodeModules = path.join(workDir, 'node_modules');
    const sourceNodeModules = path.join(sourceDir, 'node_modules');

    try {
      // 检查目标是否存在
      if (!fs.existsSync(targetNodeModules)) {
        return { valid: false, error: 'node_modules 软连接不存在' };
      }

      // 检查是否为软连接
      const stats = fs.lstatSync(targetNodeModules);
      if (!stats.isSymbolicLink()) {
        return { valid: false, error: 'node_modules 是普通目录而非软连接' };
      }

      // 检查指向路径
      const linkTarget = fs.readlinkSync(targetNodeModules);
      if (path.resolve(linkTarget) !== path.resolve(sourceNodeModules)) {
        return { valid: false, error: `软连接指向错误: 预期 ${sourceNodeModules}, 实际 ${linkTarget}` };
      }

      // 检查源路径是否真实存在
      if (!fs.existsSync(sourceNodeModules)) {
        return { valid: false, error: `软连接源路径不存在: ${sourceNodeModules}` };
      }

      return { valid: true };
    } catch (e) {
      return { valid: false, error: `检查异常: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /**
   * 确保 node_modules 软连接存在
   */
  private async ensureNodeModulesLinked(workDir: string, sourceDir: string): Promise<void> {
    const targetNodeModules = path.join(workDir, 'node_modules');
    const sourceNodeModules = path.join(sourceDir, 'node_modules');

    console.log(`[ProjectPreviewService] 准备建立软连接: ${sourceNodeModules} -> ${targetNodeModules}`);

    if (!fs.existsSync(sourceNodeModules)) {
       const errorMsg = `主项目 node_modules 不存在: ${sourceNodeModules}。请先在项目目录执行 pnpm install`;
       console.error(`[ProjectPreviewService] ❌ ${errorMsg}`);
       throw new Error(errorMsg);
    }

    const health = this.checkSymlinkStatus(workDir, sourceDir);

    if (health.valid) {
      console.log(`[ProjectPreviewService] ✅ 软连接检查通过`);
      return;
    }

    console.log(`[ProjectPreviewService] 软连接无效 (${health.error})，准备重建...`);

    try {
      // 如果存在但无效（或者是普通目录），先删除
      if (fs.existsSync(targetNodeModules)) {
        console.log(`[ProjectPreviewService] 清理无效的目标: ${targetNodeModules}`);
        await this.executor.executeCommand(`rm -rf "${targetNodeModules}"`);
      }

      // 创建软连接前，确保 worktree 目录存在
      if (!fs.existsSync(workDir)) {
        console.log(`[ProjectPreviewService] ⚠️  Worktree 目录不存在: ${workDir}`);
        console.log(`[ProjectPreviewService] 这可能是路径解析问题，请检查数据库中的路径`);
        throw new Error(`Worktree 目录不存在: ${workDir}`);
      }

      // 创建软连接
      console.log(`[ProjectPreviewService] 执行 ln -s 创建软连接...`);
      await this.executor.executeCommand(`ln -s "${sourceNodeModules}" "${targetNodeModules}"`);
      
      // 再次验证
      const finalCheck = this.checkSymlinkStatus(workDir, sourceDir);
      if (!finalCheck.valid) {
        throw new Error(`创建软连接后校验失败: ${finalCheck.error}`);
      }
      console.log(`[ProjectPreviewService] ✅ 软连接创建成功`);
    } catch (e) {
      console.error(`[ProjectPreviewService] ❌ 创建软连接失败:`, e);
      throw e;
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
