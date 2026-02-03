import { ICommandExecutor } from '../types';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Docker Compose 服务
 * 通过命令行管理 Docker Compose 服务
 */
export class DockerComposeService {
  constructor(private executor: ICommandExecutor) {}

  /**
   * 初始化 docker-compose.yml 文件
   * @param workDir 工作目录
   * @param force 是否强制覆盖已存在的文件
   */
  async initConfig(workDir: string, force: boolean = false): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      console.log(`[DockerComposeService] 初始化配置文件: ${workDir}`);
      
      // 检查文件是否已存在
      if (!force) {
        const checkResult = await this.executor.executeCommand('test -f docker-compose.yml && echo "exists"', workDir);
        if (checkResult.stdout.trim() === 'exists') {
          return {
            success: false,
            message: 'docker-compose.yml 已存在，使用 force=true 强制覆盖',
          };
        }
      }
      
      // 读取模板文件
      const templatePath = resolve(__dirname, '../templates/docker-compose.yml');
      const template = readFileSync(templatePath, 'utf8');
      
      // 转义内容用于 shell
      const escapedContent = template.replace(/'/g, "'\\''");
      
      // 写入文件
      const writeCommand = `cat > docker-compose.yml << 'EOF'\n${template}\nEOF`;
      const result = await this.executor.executeCommand(writeCommand, workDir);
      
      if (result.exitCode === 0) {
        console.log(`[DockerComposeService] ✅ 配置文件创建成功`);
        return {
          success: true,
          message: 'docker-compose.yml 创建成功',
        };
      } else {
        console.error(`[DockerComposeService] ❌ 配置文件创建失败`);
        return {
          success: false,
          message: '配置文件创建失败',
          error: result.stderr,
        };
      }
    } catch (error) {
      console.error(`[DockerComposeService] ❌ 初始化异常:`, error);
      return {
        success: false,
        message: '初始化配置文件时发生错误',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 启动服务
   * @param workDir 工作目录（包含 docker-compose.yml）
   * @param detached 是否后台运行
   */
  async up(workDir: string, detached: boolean = true): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      const command = detached ? 'docker-compose up -d' : 'docker-compose up';
      console.log(`[DockerComposeService] 启动服务: ${workDir}`);
      
      const result = await this.executor.executeCommand(command, workDir);
      
      if (result.exitCode === 0) {
        console.log(`[DockerComposeService] ✅ 服务启动成功`);
        return {
          success: true,
          output: result.stdout,
        };
      } else {
        console.error(`[DockerComposeService] ❌ 服务启动失败`);
        return {
          success: false,
          output: result.stdout,
          error: result.stderr,
        };
      }
    } catch (error) {
      console.error(`[DockerComposeService] ❌ 启动异常:`, error);
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 停止服务
   * @param workDir 工作目录
   */
  async down(workDir: string): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      console.log(`[DockerComposeService] 停止服务: ${workDir}`);
      const result = await this.executor.executeCommand('docker-compose down', workDir);
      
      if (result.exitCode === 0) {
        console.log(`[DockerComposeService] ✅ 服务停止成功`);
        return {
          success: true,
          output: result.stdout,
        };
      } else {
        console.error(`[DockerComposeService] ❌ 服务停止失败`);
        return {
          success: false,
          output: result.stdout,
          error: result.stderr,
        };
      }
    } catch (error) {
      console.error(`[DockerComposeService] ❌ 停止异常:`, error);
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 重启服务
   * @param workDir 工作目录
   */
  async restart(workDir: string): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      console.log(`[DockerComposeService] 重启服务: ${workDir}`);
      const result = await this.executor.executeCommand('docker-compose restart', workDir);
      
      if (result.exitCode === 0) {
        console.log(`[DockerComposeService] ✅ 服务重启成功`);
        return {
          success: true,
          output: result.stdout,
        };
      } else {
        console.error(`[DockerComposeService] ❌ 服务重启失败`);
        return {
          success: false,
          output: result.stdout,
          error: result.stderr,
        };
      }
    } catch (error) {
      console.error(`[DockerComposeService] ❌ 重启异常:`, error);
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 查看服务状态
   * @param workDir 工作目录
   */
  async ps(workDir: string): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      const result = await this.executor.executeCommand('docker-compose ps', workDir);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.exitCode !== 0 ? result.stderr : undefined,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 查看服务日志
   * @param workDir 工作目录
   * @param service 服务名称（可选）
   * @param tail 显示最后 N 行
   */
  async logs(workDir: string, service?: string, tail: number = 100): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      const serviceArg = service ? ` ${service}` : '';
      const command = `docker-compose logs --tail=${tail}${serviceArg}`;
      const result = await this.executor.executeCommand(command, workDir);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.exitCode !== 0 ? result.stderr : undefined,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 构建服务
   * @param workDir 工作目录
   * @param noCache 是否不使用缓存
   */
  async build(workDir: string, noCache: boolean = false): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      const command = noCache ? 'docker-compose build --no-cache' : 'docker-compose build';
      console.log(`[DockerComposeService] 构建服务: ${workDir}`);
      
      const result = await this.executor.executeCommand(command, workDir);
      
      if (result.exitCode === 0) {
        console.log(`[DockerComposeService] ✅ 服务构建成功`);
        return {
          success: true,
          output: result.stdout,
        };
      } else {
        console.error(`[DockerComposeService] ❌ 服务构建失败`);
        return {
          success: false,
          output: result.stdout,
          error: result.stderr,
        };
      }
    } catch (error) {
      console.error(`[DockerComposeService] ❌ 构建异常:`, error);
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 拉取镜像
   * @param workDir 工作目录
   */
  async pull(workDir: string): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      console.log(`[DockerComposeService] 拉取镜像: ${workDir}`);
      const result = await this.executor.executeCommand('docker-compose pull', workDir);
      
      if (result.exitCode === 0) {
        console.log(`[DockerComposeService] ✅ 镜像拉取成功`);
        return {
          success: true,
          output: result.stdout,
        };
      } else {
        console.error(`[DockerComposeService] ❌ 镜像拉取失败`);
        return {
          success: false,
          output: result.stdout,
          error: result.stderr,
        };
      }
    } catch (error) {
      console.error(`[DockerComposeService] ❌ 拉取异常:`, error);
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 执行完整的部署流程：构建 -> 停止 -> 启动
   * @param workDir 工作目录
   * @param rebuild 是否重新构建
   */
  async deploy(workDir: string, rebuild: boolean = true): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      console.log(`[DockerComposeService] 开始部署: ${workDir}`);
      const outputs: string[] = [];

      // 1. 构建（如果需要）
      if (rebuild) {
        console.log(`[DockerComposeService] 步骤 1/3: 构建镜像`);
        const buildResult = await this.build(workDir);
        outputs.push('=== 构建输出 ===');
        outputs.push(buildResult.output);
        if (!buildResult.success) {
          return {
            success: false,
            output: outputs.join('\n'),
            error: buildResult.error,
          };
        }
      }

      // 2. 停止现有服务
      console.log(`[DockerComposeService] 步骤 2/3: 停止现有服务`);
      const downResult = await this.down(workDir);
      outputs.push('=== 停止输出 ===');
      outputs.push(downResult.output);

      // 3. 启动服务
      console.log(`[DockerComposeService] 步骤 3/3: 启动服务`);
      const upResult = await this.up(workDir);
      outputs.push('=== 启动输出 ===');
      outputs.push(upResult.output);

      if (upResult.success) {
        console.log(`[DockerComposeService] ✅ 部署成功`);
        return {
          success: true,
          output: outputs.join('\n'),
        };
      } else {
        console.error(`[DockerComposeService] ❌ 部署失败`);
        return {
          success: false,
          output: outputs.join('\n'),
          error: upResult.error,
        };
      }
    } catch (error) {
      console.error(`[DockerComposeService] ❌ 部署异常:`, error);
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
