import path from 'path';

/**
 * 获取 Git 工作目录
 * @returns Git 工作目录路径
 */
export function getGitWorkDir(): string {
  const workDir = process.env.LOCAL_GIT_WORK_DIR;

  if (!workDir) {
    throw new Error('Git 工作目录未配置。请设置 LOCAL_GIT_WORK_DIR 环境变量');
  }

  return path.resolve(workDir);
}

/**
 * 获取 Git 默认分支
 * @returns 默认分支名称
 */
export function getGitDefaultBranch(): string {
  // 优先使用 GIT_DEFAULT_BRANCH
  const defaultBranch = process.env.GIT_DEFAULT_BRANCH;
  
  // 最终默认值
  return defaultBranch || 'master';
}

/**
 * 从环境变量加载 GitLab 配置
 * @returns GitLab 配置对象
 * @throws {Error} 如果配置不完整
 */
export function loadGitLabConfig(): {
  url: string;
  token: string;
} {
  const url = process.env.GITLAB_URL;
  const token = process.env.GITLAB_TOKEN;

  if (!url || !token) {
    throw new Error('GitLab 配置不完整，请检查环境变量');
  }

  return { url, token };
}

/**
 * 获取 Worktree 基础目录
 * @param workDir Git 工作目录（用于回退）
 * @returns Worktree 基础目录路径
 */
export function getWorktreeBaseDir(workDir: string): string {
  // 优先使用 WORKTREE_BASE_DIR
  const worktreeBaseDir = process.env.WORKTREE_BASE_DIR;
  
  // 最终回退到 workDir 的同级目录
  return path.resolve(worktreeBaseDir || path.resolve(workDir, '..', 'worktrees'));
}
