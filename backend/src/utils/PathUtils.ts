import path from 'path';

/**
 * 将路径转换为绝对路径
 * @param targetPath 目标路径
 * @returns 绝对路径
 */
export function resolveProjectRelativePath(targetPath: string | null): string {
  if (!targetPath) return '';
  if (path.isAbsolute(targetPath)) return targetPath;
  
  const runMode = process.env.RUN_MODE || 'local';
  
  // 获取基础目录，优先使用环境变量
  let baseWorkDir = runMode === 'remote' 
    ? process.env.REMOTE_GIT_WORK_DIR
    : process.env.LOCAL_GIT_WORK_DIR;
    
  // 如果没有配置环境变量，提供相对项目的默认值
  if (!baseWorkDir) {
    if (runMode === 'remote') {
      throw new Error('远程模式下必须配置 REMOTE_GIT_WORK_DIR 环境变量');
    } else {
      // 本地环境默认在项目根目录下的 front-workspace
      // 注意：这里 process.cwd() 通常是 backend 目录
      baseWorkDir = path.resolve(process.cwd(), '..', 'front-workspace');
    }
  } else if (!path.isAbsolute(baseWorkDir)) {
    // 如果 baseWorkDir 是相对路径，解析为相对于当前工作目录的绝对路径
    baseWorkDir = path.resolve(process.cwd(), baseWorkDir);
  }
    
  return path.join(baseWorkDir, targetPath);
}

/**
 * 将绝对路径转换为相对于工作空间的相对路径
 * @param absPath 绝对路径
 * @returns 相对路径
 */
export function convertToProjectRelativePath(absPath: string | null): string | null {
  if (!absPath) return absPath;
  if (!path.isAbsolute(absPath)) return absPath;

  const runMode = process.env.RUN_MODE || 'local';
  let baseWorkDir = runMode === 'remote' 
    ? process.env.REMOTE_GIT_WORK_DIR
    : process.env.LOCAL_GIT_WORK_DIR;

  if (!baseWorkDir) {
    // 如果没有配置基础目录，尝试使用默认值进行匹配
    if (runMode === 'local') {
      baseWorkDir = path.resolve(process.cwd(), '..', 'front-workspace');
    } else {
      return absPath;
    }
  } else if (!path.isAbsolute(baseWorkDir)) {
    baseWorkDir = path.resolve(process.cwd(), baseWorkDir);
  }

  // 确保 baseWorkDir 以分隔符结尾，或者在匹配时处理
  const normalizedBase = path.normalize(baseWorkDir);
  const normalizedPath = path.normalize(absPath);

  if (normalizedPath.startsWith(normalizedBase)) {
    let relativePath = normalizedPath.substring(normalizedBase.length);
    if (relativePath.startsWith(path.sep)) {
      relativePath = relativePath.substring(path.sep.length);
    }
    return relativePath;
  }

  return absPath;
}
