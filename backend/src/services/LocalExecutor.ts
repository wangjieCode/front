import { exec } from 'child_process';
import { promisify } from 'util';
import { CommandResult } from '../types';

const execAsync = promisify(exec);

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
  async executeCommand(command: string, workDir?: string): Promise<CommandResult> {
    try {
      const options = workDir ? { cwd: workDir, maxBuffer: 10 * 1024 * 1024 } : { maxBuffer: 10 * 1024 * 1024 };
      
      const { stdout, stderr } = await execAsync(command, options);

      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (error: any) {
      return {
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message,
        exitCode: error.code || 1,
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
