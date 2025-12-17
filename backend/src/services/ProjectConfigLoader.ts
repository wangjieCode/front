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
        // 例如: PROJECT_DTMALL_ADMIN_GITLAB_URL -> DTMALL_ADMIN
        const withoutPrefix = key.substring(prefix.length);
        
        // 已知的配置后缀模式
        const configSuffixes = [
          'GITLAB_URL', 'GITLAB_TOKEN', 'GITLAB_PROJECT_ID',
          'REPO_DIR', 'WORKTREE_BASE_DIR', 'GIT_DEFAULT_BRANCH',
          'DOCKER_SSH_HOST', 'DOCKER_SSH_PORT', 'DOCKER_SSH_USERNAME',
          'DOCKER_SSH_PASSWORD', 'DOCKER_SSH_KEY_PATH'
        ];
        
        // 找到匹配的配置后缀
        for (const suffix of configSuffixes) {
          if (withoutPrefix.endsWith('_' + suffix)) {
            const projectKey = withoutPrefix.substring(0, withoutPrefix.length - suffix.length - 1);
            if (projectKey) {
              projectKeys.add(projectKey);
            }
            break;
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
