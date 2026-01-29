import path from 'path';

/**
 * 基础路径类型，对应不同的环境变量配置
 */
export enum BasePathType {
  GIT_WORK_DIR = 'GIT_WORK_DIR',         // 主项目空间 (env.LOCAL_GIT_WORK_DIR / env.REMOTE_GIT_WORK_DIR)
  WORKTREE_BASE_DIR = 'WORKTREE_BASE_DIR' // 分身/Worktree 空间 (env.WORKTREE_BASE_DIR)
}

/**
 * 路径变量占位符
 * 用于在数据库中存储带变量的路径，如：${WORKTREE_BASE_DIR}/user-xxx/project
 */
export const PATH_VARIABLES = {
  WORKTREE_BASE_DIR: '${WORKTREE_BASE_DIR}',
  GIT_WORK_DIR: '${GIT_WORK_DIR}',
} as const;

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
 * [读取]：将数据库存储的路径（可能包含变量占位符）解析为当前环境的绝对路径
 * 
 * 支持的格式：
 * - ${WORKTREE_BASE_DIR}/relative/path
 * - ${GIT_WORK_DIR}/relative/path
 * - relative/path (兜底：根据 type 参数决定基础路径)
 * - /absolute/path (直接返回)
 * 
 * @param storedPath 数据库中存储的路径
 * @param fallbackType 当路径不包含变量时，使用的默认基础路径类型
 */
export function resolveStoredPath(
  storedPath: string | null, 
  fallbackType: BasePathType = BasePathType.GIT_WORK_DIR
): string {
  if (!storedPath) return '';
  
  // 如果是绝对路径，直接返回（兼容旧数据）
  if (path.isAbsolute(storedPath)) return storedPath;
  
  // 解析变量占位符
  if (storedPath.startsWith(PATH_VARIABLES.WORKTREE_BASE_DIR)) {
    const relativePath = storedPath.replace(PATH_VARIABLES.WORKTREE_BASE_DIR + '/', '');
    const baseDir = getBaseDir(BasePathType.WORKTREE_BASE_DIR);
    return path.join(baseDir, relativePath);
  }
  
  if (storedPath.startsWith(PATH_VARIABLES.GIT_WORK_DIR)) {
    const relativePath = storedPath.replace(PATH_VARIABLES.GIT_WORK_DIR + '/', '');
    const baseDir = getBaseDir(BasePathType.GIT_WORK_DIR);
    return path.join(baseDir, relativePath);
  }
  
  // 兜底：纯相对路径，根据路径特征智能决定基础路径
  // 逻辑：包含 user-xxx 的路径是 Worktree，其他通常是主项目
  if (storedPath.includes('user-') || storedPath.includes('conversation-')) {
    const baseDir = getBaseDir(BasePathType.WORKTREE_BASE_DIR);
    return path.join(baseDir, storedPath);
  }

  const baseDir = getBaseDir(fallbackType);
  return path.join(baseDir, storedPath);
}

/**
 * [写入]：将绝对路径转换为带变量占位符的路径格式
 * 
 * 转换规则：
 * 1. 优先匹配 WORKTREE_BASE_DIR，转换为 ${WORKTREE_BASE_DIR}/relative/path
 * 2. 其次匹配 GIT_WORK_DIR，转换为 ${GIT_WORK_DIR}/relative/path
 * 3. 都不匹配时，返回相对于项目根目录的路径（兜底）
 * 
 * @param absPath 绝对路径
 * @returns 带变量占位符的路径字符串
 */
export function convertToStoredPath(absPath: string | null): string | null {
  if (!absPath) return absPath;
  
  // 如果已经是变量格式，直接返回
  if (absPath.startsWith('${')) return absPath;
  
  // 如果不是绝对路径，直接返回（可能是旧的相对路径格式）
  if (!path.isAbsolute(absPath)) return absPath;

  const normalizedPath = path.resolve(absPath);

  // 尝试匹配 Worktree 基础路径
  const worktreeBase = getBaseDir(BasePathType.WORKTREE_BASE_DIR);
  const relToWorktree = path.relative(worktreeBase, normalizedPath);
  if (!relToWorktree.startsWith('..') && !path.isAbsolute(relToWorktree)) {
    return `${PATH_VARIABLES.WORKTREE_BASE_DIR}/${relToWorktree}`;
  }

  // 尝试匹配 Git 工作空间基础路径
  const gitBase = getBaseDir(BasePathType.GIT_WORK_DIR);
  const relToGit = path.relative(gitBase, normalizedPath);
  if (!relToGit.startsWith('..') && !path.isAbsolute(relToGit)) {
    return `${PATH_VARIABLES.GIT_WORK_DIR}/${relToGit}`;
  }

  // 都不匹配时的终极兜底：相对于 backend 的父目录
  const projectRoot = path.resolve(process.cwd(), '..');
  return path.relative(projectRoot, normalizedPath);
}

/**
 * 检查路径是否包含变量占位符
 */
export function hasPathVariable(path: string | null): boolean {
  if (!path) return false;
  return path.startsWith('${') && path.includes('}');
}

/**
 * 提取路径中的变量类型
 */
export function extractPathVariableType(path: string | null): BasePathType | null {
  if (!path) return null;
  
  if (path.startsWith(PATH_VARIABLES.WORKTREE_BASE_DIR)) {
    return BasePathType.WORKTREE_BASE_DIR;
  }
  
  if (path.startsWith(PATH_VARIABLES.GIT_WORK_DIR)) {
    return BasePathType.GIT_WORK_DIR;
  }
  
  return null;
}
