import { CodeChange, ChangeType } from '../types';

/**
 * 创建代码变更对象
 * @param filePath 文件路径
 * @param changeType 变更类型
 * @param diff diff 内容
 * @returns 代码变更对象
 */
export function createCodeChange(
  filePath: string,
  changeType: ChangeType,
  diff: string
): CodeChange {
  return {
    filePath,
    changeType,
    diff,
  };
}

/**
 * 验证代码变更对象的完整性
 * @param change 代码变更对象
 * @returns 如果完整返回 true
 */
export function isValidCodeChange(change: CodeChange): boolean {
  return (
    !!change.filePath &&
    !!change.changeType &&
    !!change.diff &&
    Object.values(ChangeType).includes(change.changeType)
  );
}

/**
 * 从 git diff 输出解析文件路径
 * @param diffLine diff 的第一行（通常是 diff --git a/file b/file）
 * @returns 文件路径
 */
export function parseFilePathFromDiff(diffLine: string): string | null {
  // 匹配 "diff --git a/path b/path" 格式
  const match = diffLine.match(/diff --git a\/(.+) b\/.+/);
  return match ? match[1] : null;
}

/**
 * 判断变更类型
 * @param diffContent diff 内容
 * @returns 变更类型
 */
export function detectChangeType(diffContent: string): ChangeType {
  if (diffContent.includes('new file mode')) {
    return ChangeType.ADDED;
  }
  if (diffContent.includes('deleted file mode')) {
    return ChangeType.DELETED;
  }
  return ChangeType.MODIFIED;
}
