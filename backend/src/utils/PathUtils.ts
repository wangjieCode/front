import path from 'path';

/**
 * 基础路径类型，对应不同的环境变量配置
 */
export enum BasePathType {
  GIT_WORK_DIR = 'GIT_WORK_DIR',         // 主项目空间 (env.LOCAL_GIT_WORK_DIR / env.REMOTE_GIT_WORK_DIR)
  WORKTREE_BASE_DIR = 'WORKTREE_BASE_DIR' // 分身/Worktree 空间 (env.WORKTREE_BASE_DIR)
}

/**
 * 根据运行模式（local/remote）和类型获取当前环境的基础物理路径
 */
function getBaseDir(type: BasePathType): string {
  const runMode = process.env.RUN_MODE || 'local';
  
  if (type === BasePathType.WORKTREE_BASE_DIR) {
    const base = runMode === 'remote' 
      ? process.env.REMOTE_WORKTREE_BASE_DIR 
      : process.env.WORKTREE_BASE_DIR;
    
    if (base) return path.resolve(base);
    
    // 兜底逻辑：如果未显式配置 WORKTREE_BASE_DIR，默认在主工作空间同级的 worktrees 目录
    const gitBase = getBaseDir(BasePathType.GIT_WORK_DIR);
    return path.resolve(gitBase, '..', 'worktrees');
  }

  // 默认：主项目工作空间
  let gitBase = runMode === 'remote'
    ? process.env.REMOTE_GIT_WORK_DIR
    : process.env.LOCAL_GIT_WORK_DIR;

  if (!gitBase) {
    // 最终兜底：相对于 backend 目录的同级 front-workspace
    gitBase = path.resolve(process.cwd(), '..', 'front-workspace');
  }
  
  return path.resolve(gitBase);
}

/**
 * [读取]：将数据库存储的相对路径解析为当前环境的绝对路径
 */
export function resolveProjectRelativePath(relPath: string | null, type: BasePathType = BasePathType.GIT_WORK_DIR): string {
  if (!relPath) return '';
  if (path.isAbsolute(relPath)) return relPath;
  
  const baseDir = getBaseDir(type);
  return path.join(baseDir, relPath);
}

/**
 * [写入]：将绝对路径强制转换为环境无关的相对路径
 * 它会依次尝试从 Worktree 基础目录和 Git 工作目录进行剥离
 */
export function convertToProjectRelativePath(absPath: string | null): string | null {
  if (!absPath) return absPath;
  if (!path.isAbsolute(absPath)) return absPath;

  const normalizedPath = path.resolve(absPath);

  // 尝试匹配 Worktree 基础路径
  const worktreeBase = getBaseDir(BasePathType.WORKTREE_BASE_DIR);
  const relToWorktree = path.relative(worktreeBase, normalizedPath);
  if (!relToWorktree.startsWith('..') && !path.isAbsolute(relToWorktree)) {
    return relToWorktree || '.';
  }

  // 尝试匹配 Git 工作空间基础路径
  const gitBase = getBaseDir(BasePathType.GIT_WORK_DIR);
  const relToGit = path.relative(gitBase, normalizedPath);
  if (!relToGit.startsWith('..') && !path.isAbsolute(relToGit)) {
    return relToGit || '.';
  }

  // 都不匹配时的终极兜底：相对于 backend 的父目录
  const projectRoot = path.resolve(process.cwd(), '..');
  return path.relative(projectRoot, normalizedPath);
}

/**
 * [读取兜底]：根据路径特征智能决定还原方式
 */
export function smartResolvePath(relPath: string | null): string {
  if (!relPath) return '';
  if (path.isAbsolute(relPath)) return relPath;

  // 逻辑：包含 user-xxx 的路径是 Worktree，其他通常是主项目
  if (relPath.includes('user-') || relPath.includes('conversation-')) {
    return resolveProjectRelativePath(relPath, BasePathType.WORKTREE_BASE_DIR);
  }

  return resolveProjectRelativePath(relPath, BasePathType.GIT_WORK_DIR);
}
