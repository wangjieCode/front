import { GitService } from './GitService';
import { ICommandExecutor } from '../types';
import dayjs from 'dayjs';
import {
  ValidationResult,
  CloneResult,
  RepositoryInfo,
  RepositoryStatus,
  UpdateResult,
  OperationResult,
} from '../types';
import { projects } from '../db/schema';
import type { Project } from '../db/schema';
import { ValidationError, GitOperationError } from '../errors/CustomErrors';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { resolveStoredPath, convertToStoredPath, BasePathType } from '../utils/PathUtils';
import { getGitWorkDir } from '../utils/config';

/**
 * 仓库克隆进度回调函数类型
 */
export type CloneProgressCallback = (progress: {
  stage: 'cloning' | 'checking_out' | 'completed' | 'error';
  progress?: number; // 0-100
  message: string;
  details?: string;
}) => void;

/**
 * 仓库服务类
 * 负责Git仓库的克隆、验证、状态检查等操作
 */
export class RepositoryService {
  private gitService: GitService;
  private executor: ICommandExecutor;

  // 允许的Git域名白名单
  private readonly allowedDomains = [
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'gitee.com',
    'git.dtminds.cn',  // 添加私有 GitLab 实例
    // 可以添加更多可信域名
  ];

  // 工作目录基础路径
  private readonly baseWorkDir: string;

  constructor(executor: ICommandExecutor, baseWorkDir?: string) {
    this.executor = executor;
    this.baseWorkDir = baseWorkDir || getGitWorkDir();
    // GitService 需要 ICommandExecutor，这里直接复用 executor 执行 git 命令
    this.gitService = null as any;
  }

  /**
   * 验证仓库URL的可访问性和格式
   * @param url Git仓库URL
   * @returns 验证结果
   */
  async validateRepository(url: string): Promise<ValidationResult> {
    try {
      if (!url || typeof url !== 'string') {
        return {
          allowed: false,
          reason: '仓库URL不能为空',
        };
      }

      const trimmedUrl = url.trim();

      // 验证URL格式
      const urlPatterns = [
        /^https?:\/\/.+\.git$/, // HTTP/HTTPS URL
        /^git@.+:.+\.git$/, // SSH URL
        /^https?:\/\/.+$/, // HTTP/HTTPS URL (可能不以.git结尾)
      ];

      const isValidFormat = urlPatterns.some(pattern => pattern.test(trimmedUrl));
      if (!isValidFormat) {
        return {
          allowed: false,
          reason: '仓库URL格式不正确，支持的格式：https://github.com/user/repo.git 或 git@github.com:user/repo.git',
        };
      }

      // 验证域名白名单
      const domain = this.extractDomain(trimmedUrl);
      if (domain && !this.allowedDomains.includes(domain)) {
        return {
          allowed: false,
          reason: `不允许的域名：${domain}，请联系管理员添加到白名单`,
        };
      }

      // 测试仓库可访问性
      const testResult = await this.testRepositoryAccess(trimmedUrl);
      if (!testResult.success) {
        return {
          allowed: false,
          reason: `仓库无法访问：${testResult.error}`,
        };
      }

      return {
        allowed: true,
      };
    } catch (error) {
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : '验证仓库时发生错误',
      };
    }
  }

  /**
   * 克隆仓库到指定目录
   * @param project 项目信息
   * @param progressCallback 进度回调函数（可选）
   * @returns 克隆结果
   */
  async cloneRepository(
    project: Project,
    progressCallback?: CloneProgressCallback
  ): Promise<CloneResult> {
    try {
      progressCallback?.({
        stage: 'cloning',
        message: '开始克隆仓库...',
        progress: 0,
      });

      // 验证仓库URL
      const validation = await this.validateRepository(project.gitRepositoryUrl);
      if (!validation.allowed) {
        return {
                success: false,
                error: validation.reason || '仓库URL验证失败',
                message: validation.reason || '仓库URL验证失败',
              };      }

      // 确保工作目录存在
      const workDir = resolveStoredPath(project.workDirectory, BasePathType.GIT_WORK_DIR);
      await this.ensureDirectoryExists(workDir);

      progressCallback?.({
        stage: 'cloning',
        message: `正在克隆 ${project.gitRepositoryUrl} 到 ${workDir}`,
        progress: 10,
      });

      // 检查目录是否已存在且非空
      const dirCheckResult = await this.checkDirectoryEmpty(workDir);
      if (!dirCheckResult.isEmpty) {
        return {
                success: false,
                error: '目标目录已存在且不为空，请选择其他目录或清空现有目录',
                message: '目标目录已存在且不为空，请选择其他目录或清空现有目录',
              };      }

      // 执行克隆操作
      const cloneResult = await this.performClone(
        project.gitRepositoryUrl,
        workDir,
        project.gitBranch || 'main',
        (progress, message) => {
          progressCallback?.({
            stage: 'cloning',
            message,
            progress: 10 + Math.floor(progress * 0.7), // 10-80%
          });
        }
      );

      if (!cloneResult.success) {
        return {
                success: false,
                error: cloneResult.error,
                message: cloneResult.error || '克隆失败',
              };      }

      progressCallback?.({
        stage: 'checking_out',
        message: `切换到分支 ${project.gitBranch || 'main'}`,
        progress: 80,
      });

      // 切换到指定分支
      if (project.gitBranch && project.gitBranch !== 'main') {
        const checkoutResult = await this.executor.executeCommand(`git checkout ${project.gitBranch}`, workDir);
        if (checkoutResult.exitCode !== 0) {
          return {
            success: false,
            error: `克隆成功但切换分支失败：${checkoutResult.stderr}`,
            message: `克隆成功但切换分支失败：${checkoutResult.stderr}`,
          };
        }
      }

      progressCallback?.({
        stage: 'completed',
        message: '仓库克隆完成',
        progress: 100,
      });

      return {
        success: true,
        message: '仓库克隆成功',
        clonePath: workDir,
      };
    } catch (error) {
      progressCallback?.({
        stage: 'error',
        message: '克隆过程中发生错误',
        details: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : '克隆仓库失败',
        message: error instanceof Error ? error.message : '克隆仓库失败',
      };
    }
  }

  /**
   * 获取仓库信息
   * @param workDir 工作目录
   * @returns 仓库信息
   */
  async getRepositoryInfo(workDir: string): Promise<RepositoryInfo> {
    try {
      // 检查是否为Git仓库
      const gitDirCheck = await this.executor.executeCommand('git rev-parse --git-dir', workDir);
      if (gitDirCheck.exitCode !== 0) {
        return {
          exists: false,
          branch: '',
          status: RepositoryStatus.FAILED,
          error: '不是Git仓库',
        };
      }

      // 获取当前分支
      const branchResult = await this.executor.executeCommand('git rev-parse --abbrev-ref HEAD', workDir);
      const currentBranch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : '';

      // 获取最新提交信息
      const commitResult = await this.executor.executeCommand(
        'git log -1 --format="%H|%s|%an|%ad" --date=iso',
        workDir
      );

      let lastCommit;
      if (commitResult.exitCode === 0) {
        const [hash, message, author, date] = commitResult.stdout.trim().split('|');
        lastCommit = {
          hash,
          message,
          author,
          date: dayjs(date).toDate(),
        };
      }

      // 检查仓库状态
      const statusResult = await this.executor.executeCommand('git status --porcelain', workDir);
      const status = statusResult.exitCode === 0 ? RepositoryStatus.SUCCESS : RepositoryStatus.FAILED;

      return {
        exists: true,
        branch: currentBranch,
        lastCommit,
        status,
      };
    } catch (error) {
      return {
        exists: false,
        branch: '',
        status: RepositoryStatus.FAILED,
        error: error instanceof Error ? error.message : '获取仓库信息失败',
      };
    }
  }

  /**
   * 检查仓库状态
   * @param projectId 项目ID
   * @returns 仓库状态
   */
  async checkRepositoryStatus(projectId: string): Promise<RepositoryInfo> {
    try {
      // 通过项目 ID 的约定生成工作目录
      const workDir = join(this.baseWorkDir, 'projects', projectId);
      return await this.getRepositoryInfo(workDir);
    } catch (error) {
      return {
        exists: false,
        branch: '',
        status: RepositoryStatus.FAILED,
        error: error instanceof Error ? error.message : '检查仓库状态失败',
      };
    }
  }

  /**
   * 更新仓库（拉取最新代码）
   * @param projectId 项目ID
   * @param progressCallback 进度回调函数（可选）
   * @returns 更新结果
   */
  async updateRepository(
    projectId: string,
    progressCallback?: CloneProgressCallback
  ): Promise<UpdateResult> {
    try {
      progressCallback?.({
        stage: 'cloning',
        message: '开始更新仓库...',
        progress: 0,
      });

      // 通过项目 ID 的约定生成工作目录
      const workDir = join(this.baseWorkDir, 'projects', projectId);

      // 检查是否为Git仓库
      const repoInfo = await this.getRepositoryInfo(workDir);
      if (!repoInfo.exists) {
        return {
          success: false,
          error: '仓库不存在，需要先克隆',
          message: '仓库不存在，需要先克隆',
        };
      }

      progressCallback?.({
        stage: 'cloning',
        message: '正在拉取最新代码...',
        progress: 20,
      });

      // 获取更新前的提交数量
      const beforeCount = await this.getCommitCount(workDir);

      // 执行拉取操作
      await this.ensureAuthRemote(workDir);
      const pullResult = await this.executor.executeCommand('git pull origin', workDir);
      if (pullResult.exitCode !== 0) {
        return {
                success: false,
                error: `拉取失败：${pullResult.stderr}`,
                message: `拉取失败：${pullResult.stderr}`,
              };      }

      // 获取更新后的提交数量
      const afterCount = await this.getCommitCount(workDir);
      const newCommits = Math.max(0, afterCount - beforeCount);

      progressCallback?.({
        stage: 'completed',
        message: `仓库更新完成，新增 ${newCommits} 个提交`,
        progress: 100,
      });

      return {
        success: true,
        message: '仓库更新成功',
        newCommits,
      };
    } catch (error) {
      progressCallback?.({
        stage: 'error',
        message: '更新过程中发生错误',
        details: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : '更新仓库失败',
        message: error instanceof Error ? error.message : '更新仓库失败',
      };
    }
  }

  /**
   * 从URL中提取域名
   * @param url Git仓库URL
   * @returns 域名或null
   */
  private extractDomain(url: string): string | null {
    try {
      // 处理SSH URL：git@github.com:user/repo.git
      const sshMatch = url.match(/^git@([^:]+):/);
      if (sshMatch) {
        return sshMatch[1];
      }

      // 处理HTTP/HTTPS URL
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  /**
   * 测试仓库访问权限
   * @param url Git仓库URL
   * @returns 测试结果
   */
  private async testRepositoryAccess(url: string): Promise<OperationResult> {
    try {
      const authUrl = this.withGitlabToken(url);
      // 使用 ls-remote 命令测试访问权限
      const result = await this.executor.executeCommand(`git ls-remote ${authUrl}`);
      
      if (result.exitCode === 0) {
        return {
          success: true,
          message: '仓库可访问',
        };
      } else {
        return {
          success: false,
          error: `无法访问仓库：${result.stderr}`,
          message: `无法访问仓库：${result.stderr}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '测试仓库访问失败',
        message: error instanceof Error ? error.message : '测试仓库访问失败',
      };
    }
  }

  /**
   * 确保目录存在
   * @param dirPath 目录路径
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }
    } catch (error) {
      throw new GitOperationError('创建目录', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * 检查目录是否为空
   * @param dirPath 目录路径
   * @returns 检查结果
   */
  private async checkDirectoryEmpty(dirPath: string): Promise<{ isEmpty: boolean; error?: string }> {
    try {
      const result = await this.executor.executeCommand(`ls -A ${dirPath}`);
      return {
        isEmpty: result.exitCode === 0 && result.stdout.trim() === '',
      };
    } catch (error) {
      return {
        isEmpty: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 执行实际的克隆操作
   * @param url 仓库URL
   * @param workDir 工作目录
   * @param branch 分支名称
   * @param progressCallback 进度回调
   * @returns 克隆结果
   */
  private async performClone(
    url: string,
    workDir: string,
    branch: string,
    progressCallback: (progress: number, message: string) => void
  ): Promise<OperationResult> {
    try {
      const authUrl = this.withGitlabToken(url);
      // 使用--depth 1进行浅克隆以提高速度
      const cloneCommand = `git clone --depth 1 --branch ${branch} ${authUrl} ${workDir}`;
      
      progressCallback(30, '正在下载仓库文件...');
      
      const result = await this.executor.executeCommand(cloneCommand);
      
      if (result.exitCode === 0) {
        progressCallback(100, '仓库下载完成');
        return {
          success: true,
          message: '克隆成功',
        };
      } else {
        return {
          success: false,
          error: result.stderr || '克隆失败',
          message: result.stderr || '克隆失败',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '克隆操作失败',
        message: error instanceof Error ? error.message : '克隆操作失败',
      };
    }
  }

  /**
   * 确保远程使用带 Token 的 HTTPS URL
   */
  private async ensureAuthRemote(workDir: string): Promise<void> {
    const token = process.env.GITLAB_TOKEN;
    if (!token) return;
    const originResult = await this.executor.executeCommand('git remote get-url origin', workDir);
    if (originResult.exitCode !== 0) return;
    const originUrl = originResult.stdout.trim();
    if (!originUrl) return;
    const authUrl = this.withGitlabToken(originUrl);
    if (authUrl === originUrl) return;
    await this.executor.executeCommand(`git remote set-url origin "${authUrl}"`, workDir);
  }

  /**
   * 为 HTTPS GitLab URL 注入 Token（不影响 SSH）
   */
  public getAuthUrl(url: string): string {
    return this.withGitlabToken(url);
  }

  /**
   * 为 HTTPS GitLab URL 注入 Token（不影响 SSH）
   */
  private withGitlabToken(url: string): string {
    const token = process.env.GITLAB_TOKEN;
    if (!token) return url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
    try {
      const urlObj = new URL(url);
      if (urlObj.username || urlObj.password) return url;
      urlObj.username = 'oauth2';
      urlObj.password = token;
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  /**
   * 获取提交数量
   * @param workDir 工作目录
   * @returns 提交数量
   */
  private async getCommitCount(workDir: string): Promise<number> {
    try {
      const result = await this.executor.executeCommand('git rev-list --count HEAD', workDir);
      return result.exitCode === 0 ? parseInt(result.stdout.trim(), 10) : 0;
    } catch {
      return 0;
    }
  }
}
