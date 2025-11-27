import { MergeRequest, MRParams } from '../types';

/**
 * 创建 Merge Request 对象
 * @param mrId GitLab MR ID
 * @param webUrl MR 页面 URL
 * @param sourceBranch 源分支
 * @param targetBranch 目标分支
 * @returns Merge Request 对象
 */
export function createMergeRequest(
  mrId: number,
  webUrl: string,
  sourceBranch: string,
  targetBranch: string
): MergeRequest {
  return {
    mrId,
    webUrl,
    sourceBranch,
    targetBranch,
  };
}

/**
 * 验证 MR 参数
 * @param params MR 参数
 * @throws {Error} 如果参数无效
 */
export function validateMRParams(params: MRParams): void {
  if (!params.projectId || params.projectId.trim().length === 0) {
    throw new Error('项目 ID 不能为空');
  }
  if (!params.sourceBranch || params.sourceBranch.trim().length === 0) {
    throw new Error('源分支不能为空');
  }
  if (!params.targetBranch || params.targetBranch.trim().length === 0) {
    throw new Error('目标分支不能为空');
  }
  if (!params.title || params.title.trim().length === 0) {
    throw new Error('MR 标题不能为空');
  }
}

/**
 * 生成 MR 标题
 * @param taskPrompt 任务提示词
 * @returns MR 标题
 */
export function generateMRTitle(taskPrompt: string): string {
  // 截取提示词的前 50 个字符作为标题
  const maxLength = 50;
  const title = taskPrompt.length > maxLength
    ? `${taskPrompt.substring(0, maxLength)}...`
    : taskPrompt;
  
  return `feat: ${title}`;
}

/**
 * 生成 MR 描述
 * @param taskPrompt 任务提示词
 * @param taskId 任务 ID
 * @returns MR 描述
 */
export function generateMRDescription(
  taskPrompt: string,
  taskId: string
): string {
  return `## 任务描述

${taskPrompt}

## 任务信息

- 任务 ID: ${taskId}
- 创建时间: ${new Date().toISOString()}
- 创建方式: Web 前端实习生助手系统

## 变更说明

此 MR 由 AI 自动生成，请仔细审查代码变更。
`;
}
