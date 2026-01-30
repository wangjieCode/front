import { Client, ClientChannel } from 'ssh2';
import { SSHConfig, CommandResult } from '../types';
import { createErrorLog, createInfoLog } from '../models/LogEntry';

/**
 * SSH 连接状态
 */
export enum SSHConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

/**
 * SSH 执行器类
 * 负责通过 SSH 在远程虚拟机上执行命令
 */
export class SSHExecutor {
  private client: Client | null = null;
  private config: SSHConfig | null = null;
  private status: SSHConnectionStatus = SSHConnectionStatus.DISCONNECTED;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private readonly reconnectDelay = 2000; // 2 秒

  /**
   * 获取当前连接状态
   */
  getStatus(): SSHConnectionStatus {
    return this.status;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.status === SSHConnectionStatus.CONNECTED;
  }

  /**
   * 连接到远程虚拟机
   * @param config SSH 配置
   */
  async connect(config: SSHConfig): Promise<void> {
    this.config = config;
    return this.attemptConnect();
  }

  /**
   * 尝试建立 SSH 连接
   */
  private async attemptConnect(): Promise<void> {
    if (!this.config) {
      throw new Error('SSH 配置未设置');
    }

    this.status = SSHConnectionStatus.CONNECTING;
    this.client = new Client();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.client?.end();
        reject(new Error('SSH 连接超时'));
      }, 10000); // 10 秒超时

      this.client!.on('ready', () => {
        clearTimeout(timeout);
        this.status = SSHConnectionStatus.CONNECTED;
        this.reconnectAttempts = 0;
        console.log('SSH 连接成功');
        resolve();
      });

      this.client!.on('error', (err) => {
        clearTimeout(timeout);
        this.status = SSHConnectionStatus.ERROR;
        console.error('SSH 连接错误:', err.message);
        reject(err);
      });

      this.client!.on('close', () => {
        if (this.status === SSHConnectionStatus.CONNECTED) {
          console.log('SSH 连接断开');
          this.status = SSHConnectionStatus.DISCONNECTED;
          this.handleDisconnect();
        }
      });

      // 建立连接
      const connectConfig: any = {
        host: this.config!.host,
        port: this.config!.port,
        username: this.config!.username,
        readyTimeout: 10000,
      };

      if (this.config!.privateKey) {
        connectConfig.privateKey = this.config!.privateKey;
      }

      if (this.config!.password) {
        connectConfig.password = this.config!.password;
      }

      this.client!.connect(connectConfig);
    });
  }

  /**
   * 处理连接断开，尝试自动重连
   */
  private async handleDisconnect(): Promise<void> {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
      
      try {
        await this.attemptConnect();
      } catch (error) {
        console.error('重连失败:', error);
      }
    } else {
      console.error('达到最大重连次数，放弃重连');
      this.status = SSHConnectionStatus.ERROR;
    }
  }

  /**
   * 执行命令
   * @param command 要执行的命令
   * @param workDir 工作目录（可选）
   * @param timeout 超时时间（毫秒，默认 30 秒）
   * @returns 命令执行结果
   */
  async executeCommand(command: string, workDir?: string, timeout: number = 30000, env?: Record<string, string>): Promise<CommandResult> {
    if (!this.isConnected() || !this.client) {
      throw new Error('SSH 未连接');
    }

    let envPrefix = '';
    if (env) {
      envPrefix = Object.entries(env)
        .map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`)
        .join('; ') + '; ';
    }

    // 使用登录 shell 执行命令，自动加载用户环境
    let fullCommand: string;
    if (workDir) {
      fullCommand = `${envPrefix}cd ${workDir} && ${command}`;
    } else {
      fullCommand = `${envPrefix}${command}`;
    }
    
    // 包装在登录 shell 中执行，显式加载 ~/.zshrc 并初始化 fnm 环境
    const shellCommand = `$SHELL -l -c 'source ~/.zshrc 2>/dev/null || true; eval "$(fnm env --use-on-cd)" 2>/dev/null || true; ${fullCommand.replace(/'/g, "'\\''")}'`;

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        reject(new Error(`命令执行超时 (${timeout}ms): ${command}`));
      }, timeout);

      this.client!.exec(shellCommand, (err: Error | undefined, channel: ClientChannel) => {
        if (err) {
          clearTimeout(timeoutId);
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';
        let exitCode = 0;

        // 捕获标准输出
        channel.on('data', (data: Buffer) => {
          const output = data.toString('utf8');
          stdout += output;
          
          // 检查输出大小，防止内存溢出
          if (stdout.length > 10 * 1024 * 1024) { // 10MB
            stdout = stdout.substring(0, 10 * 1024 * 1024) + '\n[输出已截断: 超过 10MB]';
            channel.close();
          }
        });

        // 捕获标准错误
        channel.stderr.on('data', (data: Buffer) => {
          const output = data.toString('utf8');
          stderr += output;
          
          // 检查输出大小
          if (stderr.length > 10 * 1024 * 1024) { // 10MB
            stderr = stderr.substring(0, 10 * 1024 * 1024) + '\n[输出已截断: 超过 10MB]';
            channel.close();
          }
        });

        // 命令执行完成
        channel.on('close', (code: number) => {
          clearTimeout(timeoutId);
          exitCode = code || 0;
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode,
          });
        });

        // 错误处理
        channel.on('error', (err: Error) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.status = SSHConnectionStatus.DISCONNECTED;
      console.log('SSH 连接已关闭');
    }
  }

  /**
   * 执行命令并流式处理输出
   * @param command 要执行的命令
   * @param workDir 工作目录（可选）
   * @param onData 数据回调函数
   * @param timeout 超时时间（毫秒，默认 300 秒）
   * @returns 命令执行结果
   */
  async executeCommandStream(
    command: string,
    workDir: string | undefined,
    onData: (data: string) => void,
    timeout: number = 300000,
    env?: Record<string, string>
  ): Promise<CommandResult> {
    if (!this.isConnected() || !this.client) {
      throw new Error('SSH 未连接');
    }

    let envPrefix = '';
    if (env) {
      envPrefix = Object.entries(env)
        .map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`)
        .join('; ') + '; ';
    }

    let fullCommand: string;
    if (workDir) {
      fullCommand = `${envPrefix}cd ${workDir} && ${command}`;
    } else {
      fullCommand = `${envPrefix}${command}`;
    }
    
    const shellCommand = `$SHELL -l -c 'source ~/.zshrc 2>/dev/null || true; eval "$(fnm env --use-on-cd)" 2>/dev/null || true; ${fullCommand.replace(/'/g, "'\\''")}'`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`命令执行超时 (${timeout}ms): ${command}`));
      }, timeout);

      this.client!.exec(shellCommand, (err: Error | undefined, channel) => {
        if (err) {
          clearTimeout(timeoutId);
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';
        let exitCode = 0;

        // 实时捕获标准输出并回调
        channel.on('data', (data: Buffer) => {
          const output = data.toString('utf8');
          stdout += output;
          
          // 实时回调
          try {
            onData(output);
          } catch (callbackError) {
            console.error('[SSHExecutor] 回调函数执行失败:', callbackError);
          }
          
          if (stdout.length > 10 * 1024 * 1024) {
            stdout = stdout.substring(0, 10 * 1024 * 1024) + '\n[输出已截断: 超过 10MB]';
            channel.close();
          }
        });

        channel.stderr.on('data', (data: Buffer) => {
          const output = data.toString('utf8');
          stderr += output;
          
          if (stderr.length > 10 * 1024 * 1024) {
            stderr = stderr.substring(0, 10 * 1024 * 1024) + '\n[输出已截断: 超过 10MB]';
            channel.close();
          }
        });

        channel.on('close', (code: number) => {
          clearTimeout(timeoutId);
          exitCode = code || 0;
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode,
          });
        });

        channel.on('error', (err: Error) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });
    });
  }

  /**
   * 测试连接
   * @returns 如果连接正常返回 true
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.executeCommand('echo "test"');
      return result.exitCode === 0 && result.stdout === 'test';
    } catch (error) {
      return false;
    }
  }
}
