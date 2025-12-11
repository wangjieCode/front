/**
 * 项目配置接口
 */
export interface ProjectConfig {
  projectKey: string;
  gitlabUrl: string;
  gitlabToken: string;
  gitlabProjectId: string;
  repoDir: string;
  worktreeBaseDir: string;
  gitDefaultBranch: string;
  dockerConfig?: {
    sshHost?: string;
    sshPort?: number;
    sshUsername?: string;
    sshPassword?: string;
    sshKeyPath?: string;
  };
}

/**
 * 项目配置加载器
 * 从环境变量读取项目配置
 */
export class ProjectConfigLoader {
  /**
   * 加载项目配置
   * @param projectKey 项目标识键
   * @returns 项目配置对象
   * @throws {Error} 如果配置不完整
   */
  static loadConfig(projectKey: string): ProjectConfig {
    const prefix = `PROJECT_${projectKey}_`;

    // 读取必需配置
    const gitlabUrl = process.env[`${prefix}GITLAB_URL`];
    const gitlabToken = process.env[`${prefix}GITLAB_TOKEN`];
    const gitlabProjectId = process.env[`${prefix}GITLAB_PROJECT_ID`];
    const repoDir = process.env[`${prefix}REPO_DIR`];
    const worktreeBaseDir = process.env[`${prefix}WORKTREE_BASE_DIR`];

    // 验证必需字段
    const missingFields: string[] = [];
    if (!gitlabUrl) missingFields.push('GITLAB_URL');
    if (!gitlabToken) missingFields.push('GITLAB_TOKEN');
    if (!gitlabProjectId) missingFields.push('GITLAB_PROJECT_ID');
    if (!repoDir) missingFields.push('REPO_DIR');
    if (!worktreeBaseDir) missingFields.push('WORKTREE_BASE_DIR');

    if (missingFields.length > 0) {
      throw new Error(
        `项目 ${projectKey} 配置不完整，缺少字段: ${missingFields.join(', ')}`
      );
    }

    // 读取可选配置
    const gitDefaultBranch = process.env[`${prefix}GIT_DEFAULT_BRANCH`] || 'main';

    // Docker 配置
    const dockerConfig: ProjectConfig['dockerConfig'] = {};
    const dockerSshHost = process.env[`${prefix}DOCKER_SSH_HOST`];
    if (dockerSshHost) {
      dockerConfig.sshHost = dockerSshHost;
      dockerConfig.sshPort = parseInt(process.env[`${prefix}DOCKER_SSH_PORT`] || '22');
      dockerConfig.sshUsername = process.env[`${prefix}DOCKER_SSH_USERNAME`];
      dockerConfig.sshPassword = process.env[`${prefix}DOCKER_SSH_PASSWORD`];
      dockerConfig.sshKeyPath = process.env[`${prefix}DOCKER_SSH_KEY_PATH`];
    }

    return {
      projectKey,
      gitlabUrl,
      gitlabToken,
      gitlabProjectId,
      repoDir,
      worktreeBaseDir,
      gitDefaultBranch,
      dockerConfig: Object.keys(dockerConfig).length > 0 ? dockerConfig : undefined,
    };
  }

  /**
   * 验证配置完整性
   * @param projectKey 项目标识键
   * @returns 是否配置完整
   */
  static validateConfig(projectKey: string): boolean {
    try {
      this.loadConfig(projectKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取所有已配置的项目 Key
   * 通过扫描环境变量中的 PROJECT_ 前缀来识别
   */
  static getAllProjectKeys(): string[] {
    const projectKeys = new Set<string>();
    const prefix = 'PROJECT_';

    for (const key in process.env) {
      if (key.startsWith(prefix)) {
        // 提取项目 key
        // 例如: PROJECT_MAIN_SITE_GITLAB_URL -> MAIN_SITE
        const parts = key.substring(prefix.length).split('_');
        if (parts.length >= 2) {
          // 找到下划线分隔的最后一个配置名称之前的部分
          // 例如: MAIN_SITE_GITLAB 中，GITLAB 是配置名称，MAIN_SITE 是项目 key
          const lastPart = parts[parts.length - 1];
          const configNames = ['GITLAB', 'REPO', 'WORKTREE', 'GIT', 'DOCKER'];
          
          // 如果最后一部分是已知的配置名称，则前面的部分是项目 key
          if (configNames.some(name => lastPart.startsWith(name))) {
            const projectKey = parts.slice(0, -1).join('_');
            if (projectKey) {
              projectKeys.add(projectKey);
            }
          }
        }
      }
    }

    return Array.from(projectKeys);
  }

  /**
   * 加载所有项目配置
   * @returns 所有有效的项目配置
   */
  static loadAllConfigs(): ProjectConfig[] {
    const projectKeys = this.getAllProjectKeys();
    const configs: ProjectConfig[] = [];

    for (const projectKey of projectKeys) {
      try {
        const config = this.loadConfig(projectKey);
        configs.push(config);
      } catch (error) {
        console.warn(`[ProjectConfigLoader] 加载项目 ${projectKey} 配置失败:`, error);
      }
    }

    return configs;
  }
}
