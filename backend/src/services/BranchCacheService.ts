import { GitLabMCPService } from './GitLabMCPService';
import { ProjectService } from './ProjectService';
import { CacheStrategyManager } from './CacheStrategyManager';
import { CacheClient, RedisCacheService } from './RedisCacheService';

export interface BranchesResult {
  branches: string[];
  defaultBranch?: string;
}

/**
 * GitLab 分支缓存服务
 * 封装分支列表的软刷新窗口策略，与 ConversationManager 解耦
 */
export class BranchCacheService {
  private cacheStrategyManager: CacheStrategyManager;
  private refreshIntervalMs: number;

  constructor(
    private gitlabService: GitLabMCPService,
    private projectService: ProjectService,
    cache?: CacheClient
  ) {
    const redisCache = cache ?? new RedisCacheService();
    this.cacheStrategyManager = new CacheStrategyManager(redisCache);
    const parsed = Number(process.env.GITLAB_BRANCHES_REFRESH_INTERVAL_MS || 120_000);
    this.refreshIntervalMs = Number.isFinite(parsed) && parsed >= 1 ? parsed : 120_000;
  }

  async getBranches(projectId: string, userId: string): Promise<BranchesResult> {
    const projectResult = await this.projectService.getProject(projectId, userId);
    if (!projectResult.success || !projectResult.project) {
      throw new Error(projectResult.error || '项目不存在');
    }
    const project = projectResult.project;
    const gitlabProjectId = project.gitlabProjectId;
    if (!gitlabProjectId) {
      throw new Error('项目未配置 gitlab_project_id');
    }

    const cacheKey = `gitlab:branches:${projectId}:${project.gitBranch || 'none'}`;

    return this.cacheStrategyManager.getWithStaleWhileRevalidate({
      key: cacheKey,
      ttlSeconds: 0,
      refreshIntervalMs: this.refreshIntervalMs,
      loader: () => this.fetchFromGitLab(projectId, project.gitBranch, gitlabProjectId),
      onStaleHit: () => {
        console.log(`[BranchCacheService] 缓存已过期，触发异步回源: projectId=${projectId}`);
      },
    });
  }

  private async fetchFromGitLab(
    projectId: string,
    projectDefaultBranch: string | null | undefined,
    gitlabProjectId: string
  ): Promise<BranchesResult> {
    const [branches, projectInfo] = await Promise.all([
      this.gitlabService.listBranches(gitlabProjectId),
      this.gitlabService.getProjectInfo(gitlabProjectId),
    ]);

    const defaultBranch = projectInfo?.default_branch || projectDefaultBranch || undefined;

    if (branches.length === 0) {
      console.warn(`[BranchCacheService] 分支列表为空: projectId=${projectId}, gitlabProjectId=${gitlabProjectId}`);
    }

    return { branches, defaultBranch };
  }
}
