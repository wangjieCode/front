import { exec } from 'child_process';
import { promisify } from 'util';
import { CommandResult } from '../types';

const execAsync = promisify(exec);
const GIT_NETWORK_SUBCOMMANDS = new Set(['fetch', 'pull', 'push', 'clone', 'ls-remote']);
const GIT_GLOBAL_OPTIONS_WITH_VALUE = new Set(['-C', '--git-dir', '--work-tree', '-c', '--namespace', '--exec-path', '--config-env']);

export function isGitNetworkCommand(command: string): boolean {
  if (!command?.trim()) {
    return false;
  }

  const tokens = command.trim().split(/\s+/).filter(Boolean);
  let index = 0;

  // 跳过前置环境变量：FOO=bar git fetch
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
    index += 1;
  }

  if (index >= tokens.length) {
    return false;
  }

  const gitToken = tokens[index];
  if (gitToken !== 'git' && !gitToken.endsWith('/git')) {
    return false;
  }
  index += 1;

  while (index < tokens.length) {
    const token = tokens[index];
    if (!token.startsWith('-')) {
      break;
    }
    index += 1;
    if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(token) && index < tokens.length) {
      index += 1;
    }
  }

  const subCommand = tokens[index];
  if (!subCommand) {
    return false;
  }

  if (GIT_NETWORK_SUBCOMMANDS.has(subCommand)) {
    return true;
  }

  if (subCommand === 'remote') {
    let remoteIndex = index + 1;
    while (remoteIndex < tokens.length && tokens[remoteIndex].startsWith('-')) {
      remoteIndex += 1;
    }
    return tokens[remoteIndex] === 'update';
  }

  return false;
}

export function buildGitAuthEnv(command: string, env?: Record<string, string>): Record<string, string> | undefined {
  const token = process.env.GITLAB_TOKEN?.trim();
  const mergedEnv = {
    ...env,
  };

  if (token && isGitNetworkCommand(command)) {
    mergedEnv.GIT_HTTP_EXTRAHEADER = `Authorization: Bearer ${token}`;
  }

  return Object.keys(mergedEnv).length > 0 ? mergedEnv : undefined;
}

/**
 * 本地命令执行器
 * 在本机上执行命令（不需要 SSH）
 */
export class LocalExecutor {
  /**
   * 检查是否已连接（本地执行器始终可用）
   */
  isConnected(): boolean {
    return true;
  }

  /**
   * 获取连接状态
   */
  getStatus(): string {
    return 'connected';
  }

  /**
   * 连接（本地执行器不需要连接）
   */
  async connect(): Promise<void> {
    // 本地执行器不需要连接
    return Promise.resolve();
  }

  /**
   * 断开连接（本地执行器不需要断开）
   */
  disconnect(): void {
    // 本地执行器不需要断开
  }

  /**
   * 执行命令
   * @param command 要执行的命令
   * @param workDir 工作目录（可选）
   * @returns 命令执行结果
   */
  async executeCommand(command: string, workDir?: string, timeout: number = 60000, env?: Record<string, string>): Promise<CommandResult> {
    // console.log('[LocalExecutor] 执行命令:', command.substring(0, 100) + '...');
    // console.log('[LocalExecutor] 工作目录:', workDir || '(当前目录)');

    try {
      const runtimeEnv = buildGitAuthEnv(command, env);
      const options = {
        cwd: workDir,
        maxBuffer: 100 * 1024 * 1024, // 100MB
        timeout: timeout,
        env: {
          ...process.env,
          ...runtimeEnv,
        }
      };

      // 验证工作目录是否存在
      if (workDir) {
        const fs = require('fs');
        if (!fs.existsSync(workDir)) {
          throw new Error(`工作目录不存在: ${workDir}`);
        }
      }

      // console.log('[LocalExecutor] IFLOW_API_KEY 已传递:', !!options.env.IFLOW_API_KEY);

      const { stdout, stderr } = await execAsync(command, options);

      // console.log('[LocalExecutor] ✅ 命令执行完成');
      // console.log('[LocalExecutor] stdout 长度:', stdout.length);
      // console.log('[LocalExecutor] stdout 最后50字符:', JSON.stringify(stdout.slice(-50)));
      // console.log('[LocalExecutor] stderr 长度:', stderr.length);

      return {
        stdout: stdout,
        stderr: stderr,
        exitCode: 0,
      };
    } catch (error: any) {
      console.error('[LocalExecutor] ❌ 命令执行失败');
      console.error('[LocalExecutor] 错误码:', error.code);
      console.error('[LocalExecutor] 错误信息:', error.message);
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
      };
    }
  }

  /**
   * 执行命令并流式处理输出
   * @param command 要执行的命令
   * @param workDir 工作目录（可选）
   * @param onData 数据回调函数
   * @param onError 错误回调函数
   * @returns 命令执行结果
   */
  async executeCommandStream(
    command: string,
    workDir: string | undefined,
    onData: (data: string) => void,
    timeout: number = 300000,
    env?: Record<string, string>
  ): Promise<CommandResult> {
    // console.log('[LocalExecutor] 流式执行命令:', command.substring(0, 100) + '...');
    // console.log('[LocalExecutor] 工作目录:', workDir || '(当前目录)');

    try {
      const { spawn } = require('child_process');
      const runtimeEnv = buildGitAuthEnv(command, env);
      const options = {
        cwd: workDir,
        timeout: timeout,
        env: {
          ...process.env,
          ...runtimeEnv,
        }
      };

      // 验证工作目录是否存在
      if (workDir) {
        const fs = require('fs');
        if (!fs.existsSync(workDir)) {
          return {
            stdout: '',
            stderr: `工作目录不存在: ${workDir}`,
            exitCode: 1,
          };
        }
      }

      // console.log('[LocalExecutor] IFLOW_API_KEY 已传递:', !!options.env.IFLOW_API_KEY);

      return new Promise((resolve, reject) => {
        // console.log('[LocalExecutor] 启动子进程...');
        const child = spawn('sh', ['-c', command], options);

        let stdout = '';
        let stderr = '';
        let exitCode = 0;

        // 捕获标准输出并实时回调
        child.stdout.on('data', (data: Buffer) => {
          const output = data.toString('utf8');
          stdout += output;
          onData(output);
        });

        // 捕获标准错误
        child.stderr.on('data', (data: Buffer) => {
          const output = data.toString('utf8');
          stderr += output;
          // 合并到输出中或者按需处理
          onData(output);
        });

        // 进程结束
        child.on('close', (code: number) => {
          exitCode = code || 0;
          // console.log('[LocalExecutor] 子进程结束，退出码:', exitCode);
          // console.log('[LocalExecutor] stdout 总长度:', stdout.length);
          // console.log('[LocalExecutor] stderr 总长度:', stderr.length);
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode,
          });
        });

        // 错误处理
        child.on('error', (error: Error) => {
          console.error('[LocalExecutor] ❌ 子进程错误:', error.message);
          reject(error);
        });
      });
    } catch (error: any) {
      return {
        stdout: '',
        stderr: error.message || String(error),
        exitCode: 1,
      };
    }
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
