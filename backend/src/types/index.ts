/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed'
}

/**
 * 任务类型枚举
 */
export enum TaskType {
  CODE_CHANGE = 'code_change',  // 代码修改任务（需要创建 MR）
  QUERY = 'query'                // 查询任务（只返回信息）
}

/**
 * 日志级别枚举
 */
export enum LogLevel {
  INFO = 'info',
  ERROR = 'error'
}

/**
 * 代码变更类型枚举
 */
export enum ChangeType {
  ADDED = 'added',
  MODIFIED = 'modified',
  DELETED = 'deleted'
}

/**
 * 任务接口
 */
export interface Task {
  id: string;
  prompt: string;
  type: TaskType;  // 任务类型
  status: TaskStatus;
  branchName?: string;
  mrUrl?: string;
  result?: string;  // 查询类任务的结果
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * 日志条目接口
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
}

/**
 * 代码变更接口
 */
export interface CodeChange {
  filePath: string;
  changeType: ChangeType;
  diff: string;
}

/**
 * Merge Request 接口
 */
export interface MergeRequest {
  mrId: number;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
}

/**
 * SSH 配置接口
 */
export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  privateKey: string;
}

/**
 * 命令执行结果接口
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 命令执行器接口
 * SSHExecutor 和 LocalExecutor 都实现此接口
 */
export interface ICommandExecutor {
  isConnected(): boolean;
  executeCommand(command: string, workDir?: string): Promise<CommandResult>;
  executeCommandStream?(
    command: string,
    workDir: string | undefined,
    onData: (data: string) => void,
    onError?: (data: string) => void
  ): Promise<CommandResult>;
  testConnection(): Promise<boolean>;
}

/**
 * MR 参数接口
 */
export interface MRParams {
  projectId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
}

/**
 * 代码工具执行结果接口
 */
export interface CodeToolResult {
  success: boolean;
  message: string;
  changes: CodeChange[];
  rawOutput?: string;
  error?: string;
}

/**
 * 代码工具提供者接口
 * 所有代码工具必须实现此接口
 */
export interface ICodeToolProvider {
  /**
   * 工具名称
   */
  readonly name: string;

  /**
   * 使用 AI 修改代码
   * @param prompt 用户提示词
   * @param workDir 工作目录
   * @returns 执行结果
   */
  modifyCode(prompt: string, workDir: string): Promise<CodeToolResult>;

  /**
   * 检查工具是否可用
   * @param workDir 工作目录
   * @returns 是否可用
   */
  isAvailable(workDir: string): Promise<boolean>;

  /**
   * 获取工具版本
   * @param workDir 工作目录
   * @returns 版本字符串
   */
  getVersion(workDir: string): Promise<string>;
}

/**
 * 代码工具配置接口
 */
export interface CodeToolConfigData {
  toolType: string;
  toolOptions: Record<string, any>;
}
