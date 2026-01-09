import { MergeRequest, MRParams } from '../types';
import { createMergeRequest, validateMRParams, generateMRTitle, generateMRDescription } from '../models/MergeRequest';

// 使用全局 fetch（Node.js 18+ 内置）
// 如果使用 Node.js < 18，需要安装 node-fetch
declare const fetch: typeof globalThis.fetch;
declare const URLSearchParams: typeof globalThis.URLSearchParams;

/**
 * GitLab API 配置接口
 */
export interface GitLabConfig {
  url: string;
  token: string;
  projectId: string;
}

/**
 * GitLab API 响应接口
 */
interface GitLabMRResponse {
  id: number;
  iid: number;
  web_url: string;
  source_branch: string;
  target_branch: string;
  title: string;
  state: string;
}

/**
 * GitLab MCP 服务类
 * 负责通过 GitLab API 创建 Merge Request
 */
export class GitLabMCPService {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(private config: GitLabConfig) {
    this.baseUrl = `${config.url}/api/v4`;
    this.headers = {
      'Content-Type': 'application/json',
      'PRIVATE-TOKEN': config.token,
    };
  }

  /**
   * 创建 Merge Request
   * @param params MR 参数
   * @returns Merge Request 对象
   */
  async createMergeRequest(params: MRParams): Promise<MergeRequest> {
    // 验证参数
    validateMRParams(params);

    try {
      // 检查 MR 是否已存在
      const existingMR = await this.findExistingMR(params.sourceBranch, params.targetBranch);
      if (existingMR) {
        console.log(`[GitLabMCPService] ℹ️  MR 已存在（远程查询）: ${existingMR.webUrl}`);
        return existingMR;
      }

      // 创建新的 MR
      const url = `${this.baseUrl}/projects/${encodeURIComponent(params.projectId)}/merge_requests`;
      
      const body = {
        source_branch: params.sourceBranch,
        target_branch: params.targetBranch,
        title: params.title,
        description: params.description,
        remove_source_branch: true, // 合并后删除源分支
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `创建 MR 失败 (${response.status}): ${errorData.message || response.statusText}`
        );
      }

      const data: GitLabMRResponse = await response.json();

      return createMergeRequest(
        data.iid,
        data.web_url,
        data.source_branch,
        data.target_branch
      );
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`创建 MR 时发生未知错误: ${String(error)}`);
    }
  }

  /**
   * 查找已存在的 MR
   * @param sourceBranch 源分支
   * @param targetBranch 目标分支
   * @returns 如果找到返回 MR 对象，否则返回 null
   */
  /**
   * 查找已存在的 MR
   * @param sourceBranch 源分支
   * @param targetBranch 目标分支
   * @param projectId 可选的项目 ID，如果提供将覆盖配置中的默认 ID
   * @returns 如果找到返回 MR 对象，否则返回 null
   */
  async findExistingMR(
    sourceBranch: string,
    targetBranch?: string,
    projectId?: string
  ): Promise<MergeRequest | null> {
    try {
      const targetProjectId = projectId || this.config.projectId;
      const url = `${this.baseUrl}/projects/${encodeURIComponent(targetProjectId)}/merge_requests`;
      
      const params = new URLSearchParams({
        source_branch: sourceBranch,
        state: 'opened',
      });

      if (targetBranch) {
        params.append('target_branch', targetBranch);
      }

      const response = await fetch(`${url}?${params.toString()}`, {
        method: 'GET',
        headers: this.headers,
      });

      if (response.status === 401) {
        console.error(`[GitLabMCPService] ❌ 401 Unauthorized: 请检查 GITLAB_TOKEN 是否有效`);
      }

      if (!response.ok) {
        console.warn(`[GitLabMCPService] findExistingMR 失败: ${response.status} ${response.statusText}`);
        return null;
      }

      const data: GitLabMRResponse[] = await response.json();

      if (data.length > 0) {
        const mr = data[0];
        return createMergeRequest(
          mr.iid,
          mr.web_url,
          mr.source_branch,
          mr.target_branch
        );
      }

      return null;
    } catch (error) {
      console.error(`[GitLabMCPService] findExistingMR 异常:`, error);
      // 查询失败时返回 null，不抛出错误
      return null;
    }
  }

  /**
   * 获取 MR 详情
   * @param mrId MR ID
   * @returns MR 对象
   */
  async getMergeRequest(mrId: number, projectId?: string): Promise<MergeRequest | null> {
    try {
      const targetProjectId = projectId || this.config.projectId;
      const url = `${this.baseUrl}/projects/${encodeURIComponent(targetProjectId)}/merge_requests/${mrId}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        return null;
      }

      const data: GitLabMRResponse = await response.json();

      return createMergeRequest(
        data.iid,
        data.web_url,
        data.source_branch,
        data.target_branch
      );
    } catch (error) {
      return null;
    }
  }

  /**
   * 创建带有任务信息的 MR
   * @param taskId 任务 ID
   * @param taskPrompt 任务提示词
   * @param sourceBranch 源分支
   * @param targetBranch 目标分支
   * @param projectId 可选的项目 ID
   * @returns Merge Request 对象
   */
  async createMRForTask(
    taskId: string,
    taskPrompt: string,
    sourceBranch: string,
    targetBranch: string,
    projectId?: string
  ): Promise<MergeRequest> {
    const title = generateMRTitle(taskPrompt);
    const description = generateMRDescription(taskPrompt, taskId);
    const targetProjectId = projectId || this.config.projectId;

    if (!targetProjectId) {
      throw new Error('未配置 GitHub/GitLab Project ID');
    }

    return this.createMergeRequest({
      projectId: targetProjectId,
      sourceBranch,
      targetBranch,
      title,
      description,
    });
  }

  /**
   * 测试 GitLab 连接
   * @returns 如果连接成功返回 true
   */
  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/projects/${encodeURIComponent(this.config.projectId)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取项目信息
   * @returns 项目信息对象
   */
  async getProjectInfo(projectId?: string): Promise<{
    id: number;
    name: string;
    web_url: string;
    default_branch: string;
  } | null> {
    try {
      const targetProjectId = projectId || this.config.projectId;
      const url = `${this.baseUrl}/projects/${encodeURIComponent(targetProjectId)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      return null;
    }
  }
}
