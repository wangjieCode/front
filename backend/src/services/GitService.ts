import { SSHExecutor } from './SSHExecutor';
import { CommandResult, MergeRequestInfo } from '../types';

/**
 * Git 操作结果接口
 */
export interface GitOperationResult {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
}

/**
 * Git 仓库状态接口
 */
export interface GitStatus {
  currentBranch: string;
  modifiedFiles: string[];
  untrackedFiles: string[];
  stagedFiles: string[];
  isClean: boolean;
}

/**
 * Git 操作服务类
 * 负责在远程虚拟机上执行 Git 操作
 */
export class GitService {
  constructor(
    private sshExecutor: SSHExecutor,
    private workDir: string
  ) {}

  /**
   * 创建新分支
   * @param branchName 分支名称
   * @param baseBranch 基础分支（可选，默认为当前分支）
   * @returns 操作结果
   */
  async createBranch(branchName: string, baseBranch?: string): Promise<GitOperationResult> {
    try {
      // 如果指定了基础分支，先切换到基础分支
      if (baseBranch) {
        const checkoutResult = await this.sshExecutor.executeCommand(
          `git checkout ${baseBranch}`,
          this.workDir
        );
        
        if (checkoutResult.exitCode !== 0) {
          return {
            success: false,
            message: `切换到基础分支失败: ${baseBranch}`,
            error: checkoutResult.stderr,
          };
        }
      }

      // 创建并切换到新分支
      const result = await this.sshExecutor.executeCommand(
        `git checkout -b ${branchName}`,
        this.workDir
      );

      if (result.exitCode === 0) {
        return {
          success: true,
          message: `成功创建分支: ${branchName}`,
          output: result.stdout,
        };
      } else {
        return {
          success: false,
          message: `创建分支失败: ${branchName}`,
          error: result.stderr,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '创建分支时发生错误',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 切换分支
   * @param branchName 分支名称
   * @returns 操作结果
   */
  async checkoutBranch(branchName: string): Promise<GitOperationResult> {
    try {
      const result = await this.sshExecutor.executeCommand(
        `git checkout ${branchName}`,
        this.workDir
      );

      if (result.exitCode === 0) {
        return {
          success: true,
          message: `成功切换到分支: ${branchName}`,
          output: result.stdout,
        };
      } else {
        return {
          success: false,
          message: `切换分支失败: ${branchName}`,
          error: result.stderr,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '切换分支时发生错误',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取当前仓库状态
   * @returns Git 状态信息
   */
  async getStatus(): Promise<GitStatus> {
    try {
      // 获取当前分支
      const branchResult = await this.sshExecutor.executeCommand(
        'git branch --show-current',
        this.workDir
      );
      const currentBranch = branchResult.stdout.trim();

      // 获取状态
      const statusResult = await this.sshExecutor.executeCommand(
        'git status --porcelain',
        this.workDir
      );

      const modifiedFiles: string[] = [];
      const untrackedFiles: string[] = [];
      const stagedFiles: string[] = [];

      // 解析 git status --porcelain 输出
      const lines = statusResult.stdout.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);

        if (status[0] === 'M' || status[0] === 'A' || status[0] === 'D') {
          stagedFiles.push(file);
        }
        if (status[1] === 'M') {
          modifiedFiles.push(file);
        }
        if (status === '??') {
          untrackedFiles.push(file);
        }
      }

      return {
        currentBranch,
        modifiedFiles,
        untrackedFiles,
        stagedFiles,
        isClean: lines.length === 0,
      };
    } catch (error) {
      throw new Error(`获取 Git 状态失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 添加文件到暂存区
   * @param files 文件路径数组，如果为空则添加所有文件
   * @returns 操作结果
   */
  async addFiles(files: string[] = []): Promise<GitOperationResult> {
    try {
      const fileArgs = files.length > 0 ? files.join(' ') : '.';
      const result = await this.sshExecutor.executeCommand(
        `git add ${fileArgs}`,
        this.workDir
      );

      if (result.exitCode === 0) {
        return {
          success: true,
          message: files.length > 0 
            ? `成功添加 ${files.length} 个文件到暂存区`
            : '成功添加所有文件到暂存区',
          output: result.stdout,
        };
      } else {
        return {
          success: false,
          message: '添加文件到暂存区失败',
          error: result.stderr,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '添加文件时发生错误',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 提交代码
   * @param message 提交信息
   * @returns 操作结果
   */
  async commit(message: string): Promise<GitOperationResult> {
    try {
      // 转义提交信息中的引号
      const escapedMessage = message.replace(/"/g, '\\"');
      
      const result = await this.sshExecutor.executeCommand(
        `git commit -m "${escapedMessage}"`,
        this.workDir
      );

      if (result.exitCode === 0) {
        return {
          success: true,
          message: '成功提交代码',
          output: result.stdout,
        };
      } else {
        // 检查是否是因为没有变更
        if (result.stdout.includes('nothing to commit')) {
          return {
            success: false,
            message: '没有需要提交的变更',
            error: result.stdout,
          };
        }
        return {
          success: false,
          message: '提交代码失败',
          error: result.stderr || result.stdout,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '提交代码时发生错误',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 推送分支到远程仓库
   * @param branchName 分支名称
   * @param remote 远程仓库名称（默认为 origin）
   * @param force 是否强制推送
   * @returns 操作结果
   */
  async push(branchName: string, remote: string = 'origin', force: boolean = false): Promise<GitOperationResult> {
    try {
      // 在推送前配置 Git 认证（使用 GitLab Token）
      const gitlabToken = process.env.GITLAB_TOKEN;
      if (gitlabToken) {
        // 配置远程 URL 使用 Token 认证
        const gitlabUrl = process.env.GITLAB_URL || 'https://git.dtminds.cn';
        const projectPath = process.env.GITLAB_PROJECT_PATH || 'front-end/dtmall-admin';
        const baseUrl = gitlabUrl.replace(/https?:\/\//, '').replace(/\/$/, '');
        
        // 设置远程 URL：https://oauth2:<token>@domain/path.git
        const authUrl = `https://oauth2:${gitlabToken}@${baseUrl}/${projectPath}.git`;
        
        await this.sshExecutor.executeCommand(
          `git remote set-url ${remote} ${authUrl}`,
          this.workDir
        );
        
        console.log(`[GitService] 已配置 Git 远程认证`);
      }
      
      const forceFlag = force ? '-f' : '';
      const result = await this.sshExecutor.executeCommand(
        `git push ${forceFlag} ${remote} ${branchName}`,
        this.workDir
      );

      if (result.exitCode === 0) {
        return {
          success: true,
          message: `成功推送分支 ${branchName} 到 ${remote}`,
          output: result.stdout + result.stderr, // git push 输出在 stderr
        };
      } else {
        return {
          success: false,
          message: `推送分支失败: ${branchName}`,
          error: result.stderr,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '推送分支时发生错误',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取代码变更的 diff
   * @param staged 是否只获取暂存区的 diff
   * @returns diff 内容
   */
  async getDiff(staged: boolean = false): Promise<string> {
    try {
      const command = staged ? 'git diff --cached' : 'git diff';
      const result = await this.sshExecutor.executeCommand(command, this.workDir);
      return result.stdout;
    } catch (error) {
      throw new Error(`获取 diff 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取两个提交之间的 diff
   * @param from 起始提交
   * @param to 结束提交
   * @returns diff 内容
   */
  async getDiffBetween(from: string, to: string): Promise<string> {
    try {
      const result = await this.sshExecutor.executeCommand(
        `git diff ${from}..${to}`,
        this.workDir
      );
      return result.stdout;
    } catch (error) {
      throw new Error(`获取 diff 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 执行完整的提交流程（add + commit + push）
   * @param branchName 分支名称
   * @param commitMessage 提交信息
   * @returns 操作结果
   */
  async commitAndPush(branchName: string, commitMessage: string): Promise<GitOperationResult> {
    try {
      // 1. 添加所有文件
      const addResult = await this.addFiles();
      if (!addResult.success) {
        return addResult;
      }

      // 2. 提交
      const commitResult = await this.commit(commitMessage);
      if (!commitResult.success) {
        return commitResult;
      }

      // 3. 推送
      const pushResult = await this.push(branchName);
      if (!pushResult.success) {
        return pushResult;
      }

      return {
        success: true,
        message: '成功完成代码提交和推送',
        output: `Add: ${addResult.output}\nCommit: ${commitResult.output}\nPush: ${pushResult.output}`,
      };
    } catch (error) {
      return {
        success: false,
        message: '提交和推送过程中发生错误',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 检查分支是否存在（本地或远程）
   * @param branchName 分支名称
   * @param checkRemote 是否检查远程分支（默认为 false）
   * @returns 如果存在返回 true
   */
  async branchExists(branchName: string, checkRemote: boolean = false): Promise<boolean> {
    try {
      if (checkRemote) {
        // 检查远程分支
        // 使用简单的格式，然后检查输出中是否包含分支名
        const result = await this.sshExecutor.executeCommand(
          `git ls-remote --heads origin`,
          this.workDir
        );
        // 检查输出中是否包含该分支
        return result.stdout.includes(`refs/heads/${branchName}`);
      } else {
        // 检查本地分支
        const result = await this.sshExecutor.executeCommand(
          `git branch --list ${branchName}`,
          this.workDir
        );
        console.log(`[GitService] 检查本地分支: ${branchName}, result: ${JSON.stringify(result)}`);
        return result.stdout.trim().length > 0;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查是否有未提交的变更
   * @returns 如果有未提交的变更返回 true
   */
  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const result = await this.sshExecutor.executeCommand(
        'git status --porcelain',
        this.workDir
      );
      // 如果输出为空，说明工作区是干净的（没有变更）
      return result.stdout.trim().length > 0;
    } catch (error) {
      console.error('检查 Git 状态失败:', error);
      return false;
    }
  }

  /**
   * 为对话创建 Git 分支
   * @param sessionId 会话 ID
   * @param baseBranch 基础分支（默认为 master）
   * @returns 创建的分支名称
   */
  async createBranchForConversation(
    sessionId: string,
    baseBranch: string = 'main'
  ): Promise<string> {
    try {
      // 生成分支名称：conversation-{sessionId前8位}-{时间戳}
      const shortSessionId = sessionId.substring(0, 8);
      const timestamp = Date.now();
      const branchName = `conversation-${shortSessionId}-${timestamp}`;

      // 创建分支
      const result = await this.createBranch(branchName, baseBranch);

      if (!result.success) {
        throw new Error(result.error || result.message);
      }

      return branchName;
    } catch (error) {
      throw new Error(
        `创建对话分支失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 创建 Merge Request
   * @param sourceBranch 源分支
   * @param targetBranch 目标分支
   * @param title MR 标题
   * @param description MR 描述
   * @returns MR 信息
   */
  async createMergeRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string
  ): Promise<MergeRequestInfo> {
    try {
      // 注意：这里需要根据实际的 Git 平台（GitLab/GitHub）来实现
      // 这里提供一个基础实现，假设使用 GitLab CLI
      
      // 首先推送分支
      const pushResult = await this.push(sourceBranch);
      if (!pushResult.success) {
        throw new Error(`推送分支失败: ${pushResult.error}`);
      }

      // 使用 GitLab CLI 创建 MR（需要安装 glab）
      // 或者使用 GitHub CLI（需要安装 gh）
      // 这里提供一个示例实现
      
      const escapedTitle = title.replace(/"/g, '\\"');
      const escapedDescription = description.replace(/"/g, '\\"');
      
      const result = await this.sshExecutor.executeCommand(
        `glab mr create --source-branch ${sourceBranch} --target-branch ${targetBranch} --title "${escapedTitle}" --description "${escapedDescription}" --yes`,
        this.workDir
      );

      if (result.exitCode !== 0) {
        throw new Error(`创建 MR 失败: ${result.stderr}`);
      }

      // 从输出中提取 MR URL
      // GitLab CLI 输出格式: https://gitlab.com/project/repo/-/merge_requests/123
      const urlMatch = result.stdout.match(/https?:\/\/[^\s]+\/merge_requests\/(\d+)/);
      
      if (!urlMatch) {
        throw new Error('无法从输出中提取 MR URL');
      }

      const mrUrl = urlMatch[0];
      const mrId = parseInt(urlMatch[1]);

      return {
        mrId,
        webUrl: mrUrl,
        sourceBranch,
        targetBranch,
        title,
      };
    } catch (error) {
      throw new Error(
        `创建 Merge Request 失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 硬重置到 HEAD（丢弃所有变更）
   * @returns 操作结果
   */
  async resetHard(): Promise<GitOperationResult> {
    try {
      const result = await this.sshExecutor.executeCommand(
        'git reset --hard HEAD',
        this.workDir
      );

      if (result.exitCode === 0) {
        return {
          success: true,
          message: '成功丢弃所有变更',
          output: result.stdout,
        };
      } else {
        return {
          success: false,
          message: '丢弃变更失败',
          error: result.stderr,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: '重置时发生错误',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 添加所有文件到暂存区
   * @returns 操作结果
   */
  async addAll(): Promise<GitOperationResult> {
    return this.addFiles([]);
  }
}
