import { readFileSync } from 'fs';
import { SSHConfig } from '../types';

/**
 * 从环境变量加载 SSH 配置
 * @returns SSH 配置对象
 * @throws {Error} 如果配置不完整
 */
export function loadSSHConfig(): SSHConfig {
  const host = process.env.SSH_HOST;
  const port = process.env.SSH_PORT;
  const username = process.env.SSH_USERNAME;
  const privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;
  const password = process.env.SSH_PASSWORD;

  if (process.env.RUN_MODE === 'local') {
    throw new Error('本地模式不需要 SSH 配置');
  }

  if (!host || !port || !username) {
    throw new Error('SSH 配置不完整，请检查环境变量');
  }

  if (!privateKeyPath && !password) {
    throw new Error('SSH 配置不完整，需要提供 SSH_PRIVATE_KEY_PATH 或 SSH_PASSWORD');
  }

  const config: SSHConfig = {
    host,
    port: parseInt(port, 10),
    username,
  };

  if (privateKeyPath) {
    try {
      config.privateKey = readFileSync(privateKeyPath, 'utf8');
    } catch (error) {
      throw new Error(`无法读取 SSH 私钥文件: ${privateKeyPath}`);
    }
  }

  if (password) {
    config.password = password;
  }

  return config;
}

/**
 * 验证 SSH 配置
 * @param config SSH 配置
 * @throws {Error} 如果配置无效
 */
export function validateSSHConfig(config: SSHConfig): void {
  if (!config.host || config.host.trim().length === 0) {
    throw new Error('SSH 主机地址不能为空');
  }

  if (!config.port || config.port <= 0 || config.port > 65535) {
    throw new Error('SSH 端口号无效');
  }

  if (!config.username || config.username.trim().length === 0) {
    throw new Error('SSH 用户名不能为空');
  }

  if (!config.privateKey && !config.password) {
    throw new Error('SSH 认证信息不能为空，需要提供私钥或密码');
  }
}

/**
 * 获取 Git 工作目录
 * @returns Git 工作目录路径
 */
export function getGitWorkDir(): string {
  const workDir = process.env.GIT_WORK_DIR;
  if (!workDir) {
    throw new Error('GIT_WORK_DIR 环境变量未设置');
  }
  return workDir;
}

/**
 * 获取 Git 默认分支
 * @returns 默认分支名称
 */
export function getGitDefaultBranch(): string {
  return process.env.GIT_DEFAULT_BRANCH || 'main';
}

/**
 * 从环境变量加载 GitLab 配置
 * @returns GitLab 配置对象
 * @throws {Error} 如果配置不完整
 */
export function loadGitLabConfig(): {
  url: string;
  token: string;
  projectId: string;
} {
  const url = process.env.GITLAB_URL;
  const token = process.env.GITLAB_TOKEN;
  const projectId = process.env.GITLAB_PROJECT_ID;

  if (!url || !token || !projectId) {
    throw new Error('GitLab 配置不完整，请检查环境变量');
  }

  return { url, token, projectId };
}
